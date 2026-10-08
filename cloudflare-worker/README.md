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


## 作息時間的推播提醒（push.js）

晨序把「幾點、星期幾要提醒」傳給這個 Worker，Worker 每分鐘檢查一次，時間到了就推播到手機。

需要兩樣設定：

1. **KV 儲存空間 `PUSH_KV`**：寫在 `wrangler.toml`，部署時自動建立，不用手動做。
2. **Secret `VAPID_PRIVATE_JWK`**：一把只有你有的私鑰，推播服務靠它確認推播是你送的。
   在自己的電腦上產生（需要 Node）：

   ```bash
   node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']).then(k=>crypto.subtle.exportKey('jwk',k.privateKey)).then(j=>console.log(JSON.stringify(j)))"
   ```

   把印出來的那一整行（從 `{` 到 `}`）貼到 Cloudflare 後台：這個 Worker → Settings →
   Variables and Secrets → Add → Type 選 **Secret**、名稱 `VAPID_PRIVATE_JWK`。
   **不要把它貼到別的地方，也不要放進 repo。**

換掉這把金鑰之後，手機上原本的訂閱會失效：要把主畫面的晨序刪掉重加，再打開一次提醒開關。


## 雲端自動備份（backup.js）

晨序的設定頁可以設一組通關密語開啟。開啟後，資料有變動就會傳一份到這個 Worker，存在同一個 KV（`PUSH_KV`）裡，key 是 `backup:` 開頭。不需要額外的設定。

- 手機把密語雜湊後才傳上來，這裡再雜湊一次當 key，KV 裡看不到密語。
- 最多存 3 份（3 組不同的密語），每份最大約 600 KB。要清掉舊的：在 Cloudflare 後台的 KV 裡刪掉那筆 `backup:…`，並把 `backup-index` 裡對應的那一項拿掉。
- 內容沒有加密，在後台看得到，方便出問題時查看和修復。
