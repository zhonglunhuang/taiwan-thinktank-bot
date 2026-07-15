# 台灣智庫政策小幫手（LINE 風格 Demo）

一個模擬 LINE 對話介面的政策 AI 機器人靜態網站。使用者詢問國家政策問題時，機器人**只根據
[台灣智庫](https://www.taiwanthinktank.org) 網站上的文章**回答：先給政策建議，下方附上
引用文章的索引網址。

## 功能

- 📱 **LINE 風格聊天介面**：綠色訊息泡泡、已讀標記、輸入中動畫、快速回覆按鈕
- 📚 **知識庫**：265 篇台灣智庫文章（政策研究報告／議題評論／研討會新聞／民調，2016–2026），
  由 `scripts/crawl.py` 從官網 sitemap 爬取
- 🔍 **輕量 RAG**：瀏覽器端中文 bigram 關鍵字檢索，挑出最相關的 30 篇文章作為 Claude 的唯一資料來源
- 🤖 **Claude API 串接**：瀏覽器直接呼叫 Anthropic Messages API（模型 `claude-opus-4-8`），
  system prompt 嚴格限制「只能引用提供的文章、先建議後附來源、不可捏造網址」
- 🎭 **離線示範模式**：未設定 API Key 時以檢索結果模擬回覆，方便沒有網路金鑰時展示

## 快速開始

```bash
# 本機預覽（任何靜態伺服器皆可）
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

1. 點右上角 **⚙︎** 貼上 Anthropic API Key（`sk-ant-...`，僅存於瀏覽器 localStorage）
2. 輸入問題或點快速回覆按鈕，例如「台灣半導體產業的戰略地位？」
3. 機器人回覆：💡 政策建議 → 📎 參考文章（原文網址）

## 部署到 GitHub Pages

```bash
gh repo create taiwan-thinktank-bot --public --source=. --push
gh api repos/{owner}/taiwan-thinktank-bot/pages -X POST \
  -f "source[branch]=main" -f "source[path]=/"
```

或在 GitHub 網頁：**Settings → Pages → Branch: main / (root) → Save**，
幾分鐘後網站會出現在 `https://<帳號>.github.io/taiwan-thinktank-bot/`。

## 更新知識庫

```bash
python3 scripts/crawl.py   # 重新爬取官網全部文章 → data/articles.json
```

## 架構

```
使用者輸入
   │
   ▼
瀏覽器端檢索（bigram 比對 265 篇文章的標題+摘要，取前 30 篇）
   │
   ▼
Claude API（claude-opus-4-8）
   system：只能引用〈文章資料〉、先建議後附來源
   user：〈文章資料〉+〈使用者問題〉
   │
   ▼
LINE 泡泡渲染（💡 建議 + 📎 參考文章連結）
```

## ⚠️ 安全注意事項（正式上線前必讀）

- 本 demo 讓瀏覽器直接呼叫 Anthropic API（`anthropic-dangerous-direct-browser-access`），
  API Key 存在使用者瀏覽器中。**正式產品請改為後端代理**（Cloudflare Workers、Vercel
  Functions、或 LINE Messaging API webhook server），金鑰只放在伺服器端。
- 真正的 LINE 官方帳號整合需使用 [LINE Messaging API](https://developers.line.biz/)：
  webhook 收訊 → 伺服器端執行同樣的檢索 + Claude 呼叫 → Reply API 回傳。
  本站的檢索與提示詞邏輯可直接搬到伺服器端重用。

## 檔案結構

```
index.html            # 主頁：LINE UI + 檢索 + Claude API 串接（單檔、零依賴）
data/articles.json    # 知識庫（265 篇文章索引：標題/摘要/分類/日期/網址）
scripts/crawl.py      # 知識庫爬蟲（sitemap → og metadata）
```
