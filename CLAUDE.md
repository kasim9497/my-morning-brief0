# 晨序（給 Claude Code 讀的）

`kasim9497/my-morning-brief0`：Kasim 一個人用的生活排程 App，在 iPhone 上「加入主畫面」使用（PWA）。線上網址 `https://kasim9497.github.io/my-morning-brief0/`。

先讀這三份，不要從程式碼裡猜：

- [PRODUCT.md](PRODUCT.md)：給誰用、最重要的事（每天的作息和任務有沒有做到）、不可以做的事。
- [DESIGN.md](DESIGN.md)：樣式規範。北極星是「健康 App 的摘要頁」，元件手感「紮實、明確」。
- [docs/project-history.md](docs/project-history.md)：2026-09 到 2026-10-09 的完整開發紀錄（每個決定的原因、踩過的雷）。平常不用讀；要知道「為什麼這樣做」時再去查。裡面有很多已經作廢的做法（深色模式、Gemini、新聞、原生 App 為主、手動備份），以這份和程式碼為準。

## 怎麼跟使用者合作

- 一律用繁體中文回覆。使用者不是工程師：給步驟、講白話、講清楚哪些我測過、哪些要他在手機上看。
- 他有時用注音輸入法忘了切換，打出一串英數字（`b4fu61j42jo4` ＝「日期不對」）。看到像亂碼的訊息先照注音鍵盤對一次。
- 金鑰、密碼、驗證碼不要請他貼給我，也不要寫進檔案或 repo。要他自己貼進 Cloudflare 或 GitHub 的後台；指令接 `| clip` 直接進剪貼簿，不要叫他用滑鼠從終端機選取（會少字）。
- 不花錢：不儲值 AI 服務、不付 Apple 開發者帳號。
- 不要動他的 VPN（Clash Verge）設定，只給步驟。不要繞過網站的防機器人機制。
- 不要自己改 repo 名稱或 Pages 網址。

## 架構

| 部分 | 位置 | 說明 |
|---|---|---|
| 前端 | `my-morning-brief-apple-design/` | 純 ES module 的靜態網站，沒有打包工具。要用本機伺服器開，不能直接雙擊 `index.html` |
| 每日資料 | `scripts/generate_brief.py` → `data/today.json` | GitHub Actions 每天 07:30 和每次 push 到 main 時跑：天氣（和風天氣，南京栖霞區）、匯率、語錄、10 題題庫、運勢 |
| 後端 | `cloudflare-worker/` | 一個 Worker：AI 助理（`chat-proxy.js`）、每日運勢的模型呼叫（`mode: 'brief'`）、推播提醒（`push.js`）、雲端備份（`backup.js`）。push 到 main 時 Cloudflare 會自動重新部署，改壞了線上就壞了 |
| iOS 外殼 | `ios-shell/` | Capacitor 專案，只是打開線上網站的殼。現在不是主要做法，留著備用 |

前端的模組（都在 `js/`）：

- 資料與邏輯：`taskEngine.js`（任務與作息）、`fixedSchedule.js`（固定時間點）、`sleepCalculator.js`、`sleepReminder.js`（提醒怎麼發）、`quizMistakes.js`（錯題本）、`countdown.js`、`mediaTracker.js`、`backup.js` + `cloudBackup.js`、`weeklyReport.js`、`chatBox.js`、`services/dataService.js`
- 畫面：`app.js`（今日頁和初始化）、`tabs.js`、`TaskListView.js`、`CalendarView.js`、`CountdownView.js`、`SleepView.js`、`FixedScheduleView.js`、`SettingsView.js`、`ChatBoxView.js`、`taskIcons.js`、`swipeRow.js`、`motion.js`
- `config.js`：Worker 的網址。`sw.js`（在網站根目錄）：只處理推播的 service worker。

五個分頁：今日（任務 → 倒數 → 天氣、運勢、匯率 → 題庫 → 語錄）、週曆、倒數、睡眠（計算機 + 作息與提醒）、設定（每週安排、追劇讀書、本週摘要、雲端備份）。

## 一定要遵守的規則

**資料**
- 使用者的紀錄存在 localStorage，key 一律 `morningBrief.` 開頭，才會被雲端備份涵蓋。
- 不是使用者紀錄的東西（同步狀態、一次性旗標、題庫今天做到哪）用 `chenxu.` 開頭，才不會被備份帶走、也不會在還原時被清掉。
- 新編號不要只用 `Date.now()`：AI 助理一次加好幾項時會在同一毫秒撞號。後面加亂數字（照 `taskEngine.js` 的 `addCustomTask`）。
- 不要用程式默默清使用者的資料，除非他明確要求。

**內容不可以編**
- 題庫只用公路局官方題庫（`data/questions.json`，798 題）。不補寫解析、不改答案。
- 語錄要有查得到的出處。日文的句子要逐字對過原文才能加（做法在 history）。
- 運勢不提使用者個人的事（考試、職涯、所在地）。天象只能用 `get_sky_facts()` 算出來的。
- 抓不到今天的資料就不顯示，不拿範例內容充數。

**樣式**（細節在 DESIGN.md）
- 顏色、字級、圓角只用 `css/styles.css` 最上面 `:root` 的變數。字級只有九級。
- 每一組文字和底色要有 4.5:1 的對比。
- 手機上可以點的東西至少 40–44px。輸入框字級不小於 16px。
- 卡片不透明、沒有陰影和邊框；卡片裡用細線分隔的列，不再包有底色的框。
- `:hover` 包在 `@media (hover: hover) and (pointer: fine)` 裡。按壓樣式同時寫 `:active` 和 `.is-pressing`，class 加進 `app.js` 的 `PRESSABLE_SELECTOR`。
- 用 `hidden` 屬性切換顯示、而那個 class 有設 `display` 時，要另外補 `[hidden] { display: none }`。
- 固定欄數的格線用 `minmax(0, 1fr)`，不要單寫 `1fr`。
- 只有淺色外觀。不要加深色模式。
- 不用表情符號當圖示。

**程式**
- JS 之間的 import 一律寫成 `from './xxx.js'`（單引號、相對路徑、`.js` 結尾）。部署時會用 sed 幫這些網址加版本號，寫成別的形式會漏掉，瀏覽器就會拿到新舊混雜的檔案。
- `sw.js` 不要加 fetch 處理或離線快取。這個專案被快取坑過很多次。
- `print` 的字串不要放 cp950 沒有的字元（重音字母、emoji），Windows 本機跑會崩潰。
- 在滑開的清單列裡加按鈕時，注意 `swipeRow.js` 的 `pointerdown` 不要把那一列收回去（收回去按鈕會隱藏，點擊落空）。

## 測試與部署

- 測試：在 `my-morning-brief-apple-design/` 跑 `node --test`（36 項，沒有相依套件）。**部署流程會先跑測試，沒過就不部署，連每天早上的資料更新也會停。**
- 所以測試不可以依賴「今天是星期幾」或「某一天剛好排了什麼」。2026-10-09 就因為這樣停了一天。要用任務的測試自己建項目；改完用假日期多跑幾天（做法在 history 最後一段）。
- 改了 `taskEngine.js`／`sleepCalculator.js`／`quizMistakes.js`／`fixedSchedule.js`／`cloudBackup.js`／Worker 的 `push.js`、`backup.js` 之後要跑測試。改了行為就同步改測試，不要為了讓它過而刪測試。
- push 之前：`git stash push -- .claude/launch.json; git pull --rebase origin main; git stash pop`。Actions 會自己 commit 匯率歷史回 repo，不先拉會被拒絕。`.claude/launch.json` 和最外層那份題庫 PDF 不要 commit。
- push 之後用 `"/c/Program Files/GitHub CLI/gh.exe" run list --repo kasim9497/my-morning-brief0` 確認部署成功再說「上線了」。
- 這台電腦連外要走代理：`HTTPS_PROXY=http://127.0.0.1:7897`。
- 用 curl 測 Worker 要帶 `-H "Origin: https://kasim9497.github.io"`，不然是 403。不要對線上的 Worker 存測試用的備份（只有 3 個名額）。

## 在瀏覽器裡驗證

- 預覽伺服器的設定在 `.claude/launch.json`。**每次驗證換一個埠**（同一個埠會拿到快取的舊 CSS／JS），不要用 8549–8648（這台 Windows 的保留埠）。
- 本機的 `data/today.json` 是 8 月的範例檔。要看正常的樣子，暫時把 `window.fetch` 換成回傳改過日期和內容的資料，再按重新整理。
- 預覽視窗沒在畫面上時動畫不會前進，量位置前先 `document.getAnimations().forEach(a => a.finish())`。截圖常常逾時，改用讀 DOM 和計算後的樣式。
- 測過會改資料的操作之後換一個新的埠（新的來源），不要只還原 localStorage：頁面記憶體裡那份會再寫回去。
- 這裡測不到的：推播通知（預覽瀏覽器拒絕通知權限）、安全區、實際觸感。這些要請使用者在手機上確認，回報時講清楚。

## 現在的狀態（2026-10-09）

使用者在 iPhone 上確認過：推播提醒會響、底部選單不擋橫條、淺色外觀正常。

還沒在手機上確認的（都在 2026-10-08 到 10-09 做的）：今日頁新排版、任務的復原、題庫新流程和進度保存、天氣和運勢的收合、睡眠頁的「作息與提醒」、雲端備份第一次實際上傳。

已知的限制（使用者知道）：
- 在南京，連 Worker 要開 VPN。改提醒時間、雲端備份、AI 助理都受影響；收推播不受影響。
- 提醒可能晚一分鐘左右，偶爾可能漏。
- 雲端備份靠一組通關密語，不是正式登入，內容沒加密。手動備份已經拿掉，沒開雲端備份就沒有任何備份。
- 每天 07:30 之前打開，天氣和匯率會標「昨天的資料」，沒有運勢。這是對的。
- 「週一至週三 01:20 就寢」的提醒在週二到週四凌晨響（凌晨 5 點前算前一晚）。使用者還沒確認這是不是他要的。
- 運勢的文字是免費模型寫的，只有天象是算的。
- 日本語錄的中文是我翻的；柳宗悅和諺語的比例偏高。

接下來：使用者打算先照常用兩週，記下哪些沒在看、哪些卡，再跑一次 `/impeccable critique`（上次今日頁 22/40，之後修了全部五個優先問題）。在那之前不要主動加新功能。
