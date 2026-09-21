# AI 聊天框後端（Cloudflare Workers）

這個資料夾是一個獨立的小後端，唯一的工作是幫忙藏住 `OPENROUTER_API_KEY`，不讓它暴露在前端網頁的原始碼裡。前端（GitHub Pages 那個純靜態網站）只會呼叫這個 Worker 的網址，Worker 再用你的 key 去呼叫 OpenRouter。

## 部署步驟

1. **申請 Cloudflare 帳號**（免費）：<https://dash.cloudflare.com/sign-up>

2. **安裝 wrangler**（Cloudflare 官方的部署工具），在終端機執行：
   ```bash
   npm install -g wrangler
   ```

3. **登入**（會跳出瀏覽器視窗要你授權）：
   ```bash
   wrangler login
   ```

4. **切到這個資料夾**，設定你的 OpenRouter key（存成 Worker 的 secret，不會出現在程式碼或 git 紀錄裡）：
   ```bash
   cd cloudflare-worker
   wrangler secret put OPENROUTER_API_KEY
   ```
   執行後會提示你貼上 key，貼上你在 openrouter.ai 申請的那把 `sk-or-v1-...` 開頭的 key。

5. **部署**：
   ```bash
   wrangler deploy
   ```
   成功後終端機會印出一個網址，長得像：
   ```
   https://my-morning-brief-chat-proxy.<你的帳號>.workers.dev
   ```

6. **把這個網址貼給我**（或自己打開 `my-morning-brief-apple-design/js/chatBox.js`，把最上面的 `CHAT_WORKER_URL = ''` 改成這個網址），聊天框就能真的動起來。

## 之後要更新這個 Worker 怎麼辦

改完 `chat-proxy.js` 之後，在這個資料夾重新執行一次 `wrangler deploy` 就會更新到同一個網址，不用重新申請。

## 免費額度夠用嗎

Cloudflare Workers 免費方案是每天 10 萬次請求，這個 App 一天頂多用個位數次，完全用不完，不會產生費用。
