// Vercel Serverless Function — Claude API 代理
// API Key 存在 Vercel 環境變數 ANTHROPIC_API_KEY，永遠不會送到瀏覽器。
// 前端把「使用者問題 + 檢索到的文章」POST 到這裡，由伺服器加上金鑰呼叫 Anthropic。

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `你是「台灣智庫政策小幫手」，一個 LINE 上的政策 AI 助理。你只能根據台灣智庫（Taiwan Thinktank，https://www.taiwanthinktank.org）網站的文章回答。

嚴格規則：
1. 只能引用使用者訊息中〈文章資料〉區塊提供的文章內容回答，禁止使用其他知識來源補充或杜撰。
2. 回覆結構：先提出政策建議或分析（條列 2~4 點，每點 1~2 句，開頭用「💡」），語氣專業親切、適合 LINE 短訊（總長 350 字以內）。
3. 建議之後空一行，以「📎 參考文章」開頭，列出你實際引用的 1~4 篇文章，每篇一行，格式：「・標題」下一行縮排網址。網址必須逐字複製〈文章資料〉中的 url，禁止自行編造網址。
4. 若〈文章資料〉中沒有足夠相關的內容，誠實說明「台灣智庫網站目前沒有直接相關的研究」，再列出 1~2 篇最接近的文章供延伸閱讀；不可硬掰。
5. 與公共政策無關的問題（閒聊、天氣等），簡短友善回應並引導使用者詢問政策議題，此時不需列參考文章。
6. 一律使用繁體中文（台灣用語）。`;

export default async function handler(req, res) {
  // 健康檢查：前端用 GET 探測代理是否存在
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, mode: "proxy", model: MODEL });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "伺服器未設定 ANTHROPIC_API_KEY" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const question = (body.question || "").toString().slice(0, 2000);
    const context = (body.context || "").toString().slice(0, 60000);
    if (!question.trim()) {
      return res.status(400).json({ error: "缺少問題內容" });
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `〈文章資料〉\n${context}\n\n〈使用者問題〉\n${question}` },
        ],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || `Anthropic ${r.status}` });
    }

    const data = await r.json();
    if (data.stop_reason === "refusal") {
      return res.status(200).json({ reply: "😥 這個問題我無法回答，請換個政策議題試試。" });
    }
    const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "代理錯誤：" + e.message });
  }
}
