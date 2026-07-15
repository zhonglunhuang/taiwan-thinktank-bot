// Vercel Serverless Function — Claude API 串流代理
// API Key 存在 Vercel 環境變數 ANTHROPIC_API_KEY，永遠不會送到瀏覽器。
// 前端把「使用者問題 + 檢索到的文章」POST 到這裡，由伺服器加上金鑰呼叫 Anthropic，
// 並以純文字串流（逐段）回傳給前端，達成一個字一個字跑出來的效果。

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `你是「台灣智庫政策小幫手」，一位 LINE 上的政策 AI 助理，代表台灣智庫（Taiwan Thinktank，https://www.taiwanthinktank.org）。你只能根據使用者訊息〈文章資料〉中提供的台灣智庫文章內容回答，禁止使用其他知識來源或杜撰。

【回覆風格】
1. 開場先給一句「強而有力、前瞻堅定」的重點結論，語氣參考台灣智庫共同創辦人林佳龍的風格：宏觀、務實、以「韌性」「臺灣的價值與機會」「面對挑戰、掌握契機」為主軸，展現信心與行動力（可用「臺灣的關鍵在於…」「面對○○的挑戰，我們更要主動出擊…」這類開場）。但只是借用其語氣，不得假冒林佳龍本人發言。
2. 開場結論後，條列 2~4 點具體政策建議，每點 1~2 句、開頭用「💡」。
3. 所有內容必須有〈文章資料〉支撐，不可延伸杜撰。語氣專業而堅定、適合 LINE 短訊，總長約 350 字內，使用繁體中文（臺灣用語）。

【參考文章】
建議之後空一行，以「📎 參考文章」開頭，列出你實際引用的 1~4 篇文章，每篇兩行：第一行「・標題」，第二行縮排貼上〈文章資料〉中的 url（逐字複製，禁止自行編造或改寫網址）。

【例外】
・若〈文章資料〉沒有足夠相關內容，誠實說明「台灣智庫網站目前沒有直接相關的研究」，再列出 1~2 篇最接近的文章供延伸閱讀，不可硬掰。
・與公共政策無關的閒聊，簡短友善回應並引導對方詢問政策議題，此時不需列參考文章。`;

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

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (_) {
    body = {};
  }
  const question = (body.question || "").toString().slice(0, 2000);
  const context = (body.context || "").toString().slice(0, 60000);
  if (!question.trim()) {
    return res.status(400).json({ error: "缺少問題內容" });
  }

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `〈文章資料〉\n${context}\n\n〈使用者問題〉\n${question}` },
        ],
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: "無法連線 Anthropic：" + e.message });
  }

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json({ error: err?.error?.message || `Anthropic ${upstream.status}` });
  }

  // 串流純文字回前端
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = "", wrote = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.startsWith("data:")) {
          const p = line.slice(5).trim();
          if (!p) continue;
          try {
            const o = JSON.parse(p);
            if (o.type === "content_block_delta" && o.delta?.type === "text_delta") {
              res.write(o.delta.text);
              wrote = true;
            }
          } catch (_) {}
        }
      }
    }
  } catch (_) {
    // 串流中斷：保留已送出的內容
  }
  if (!wrote) res.write("😥 這個問題我無法回答，請換個政策議題試試。");
  res.end();
}
