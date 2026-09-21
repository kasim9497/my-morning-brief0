# 專案脈絡（給 Claude Code 讀的）

這是 kasim9497/my-morning-brief0，一個南京交換學期用的個人生活排程 App，正在從純展示型晨報，擴充成一個整合任務清單、週曆、倒數、追劇/讀書自動排程的 App，最終目標是用 Capacitor 包成真正的 iOS app。

## 現況（已經做完的部分）

- `my-morning-brief-apple-design/` 是前端主目錄，純 ES module（`index.html` 用 `<script type="module">`），**開發時必須用本機伺服器（VS Code Live Server 或 `python -m http.server`）打開，不能直接雙擊 index.html**
- 已經加了底部 4 個 tab（今日／週曆／倒數／設定），邏輯在 `js/tabs.js`，今日以外的三個目前是空的 placeholder
- `scripts/generate_brief.py`：GitHub Actions 每天定時執行，抓天氣／匯率／新聞／機車筆試題庫，經 OpenRouter（`deepseek/deepseek-chat-v3.1`）合成後輸出 `data/today.json`，前端讀這個檔案渲染
- 天氣資料來源已從台灣 CWA 換成南京的和風天氣（QWeather），`fetch_weather()` 用 `QWEATHER_API_KEY` + `QWEATHER_API_HOST`（本機驗證通過，2026-09-18；GitHub Secrets 已設定，見下方「已解決」）
- `strip_html()` 之前有雙重 HTML 編碼漏字的 bug（Blogger 類 RSS 來源），已修正，改動時不要移除或簡化這個函式
- `.github/workflows/morning_brief.yml`：Deploy to GitHub Pages 要在 Send Telegram Notification 之前執行，通知要用部署後的真實網址（`steps.deployment.outputs.page_url`），不要走舊的寫死網址
- `js/taskEngine.js` + `js/TaskListView.js`：今日任務清單狀態機已完成，資料存 localStorage（key: `morningBrief.taskEngine.v1`），已接到「今日」頁最上方卡片，可以延 1/2/3 天／延下週／跳過這週。`TaskListView.js` 的 `renderTaskListInto(container, dateStr, label, onChange)` 是通用版，不限今天，`CalendarView.js` 也共用這個函式
- `js/CalendarView.js`：週曆／月曆已完成。週檢視顯示週一到週日 7 天 + 每天完成度，點任何一天（含過去/未來）都能展開任務清單直接操作；月檢視顯示整月格子 + 圓點狀態（綠=全完成、橘=部分完成、紅=都沒做、灰=未來），點格子會切回週檢視並定位到那天。`taskEngine.js` 新增 export：`addDays`、`getWeekday`
- `js/countdown.js` + `js/CountdownView.js`：倒數已完成。資料存 localStorage（key: `morningBrief.countdowns.v1`），預設帶一筆「交換學期結束」倒數到 `2027-01-31`，可以新增/刪除自訂倒數，按剩餘天數排序
- **視覺重新設計（2026-09-19）**：拿掉整個 UI 裡大部分的表情符號（masthead、tab bar、卡片標題、按鈕、AI 生成內容的區塊標籤），換成統一的極簡線條 SVG icon（`stroke="currentColor"`，跟著版面配色走，不是寫死顏色）。只留 `taskEngine.js` 的 `TASK_DEFS` 任務類型 icon（💊📺🏃 等），那些是功能性的（快速辨識任務類型），不是純裝飾。以後要加新的 icon，比照這個風格：24x24 viewBox、`stroke-width 1.6-1.8`、`stroke-linecap round`，不要直接貼表情符號進 UI
- **修掉一個會讓整個畫面看起來像「CSS 壞掉」的 bug**：`.card` 原本預設 `opacity: 0`，要靠「今日」頁專屬的 JS 進場動畫（`triggerCardStagger()`）幫每張卡片補上 `.card-enter` 才會顯示。這代表任何不在 `dashboard-grid` 裡、或 JS 沒執行成功的卡片會整個隱形（週曆/倒數剛做出來時就中過這個雷）。現在 `.card` 預設 `opacity: 1`，`.card-enter` 只是進場動畫的加分效果，不再是可見度的必要條件。以後新增卡片式 UI 不用再手動處理這件事
- **UI/UX 無障礙與觸控修正（2026-09-19，用 uiux設計智庫 skill 查證後改的）**：
  - 觸控熱區太小：`.task-check` 26px→40px、`.countdown-delete` 32px→44px、`.task-skip-btn`／`.task-postpone-select` 補 `min-height: 36px`。之後新增任何會在手機上點的按鈕，目標至少 40-44px，不要用預設的小 padding
  - `CalendarView.js`／`CountdownView.js` 原本每次重新渲染（包含使用者點一下打勾這種小互動）都會讓卡片重播一次進場動畫，太干擾，已經移除——那個進場動畫現在只留給「今日」頁的一次性 dashboard 載入用
  - 所有裝飾用的行內 SVG icon（跟在文字旁邊，不是唯一的操作線索）都補上 `aria-hidden="true" focusable="false"`，避免螢幕報讀器重複唸兩次。以後新增 icon 比照辦理；如果 icon 是「唯一」的操作線索（沒有旁邊文字），要在外層按鈕加 `aria-label`，不要加在 icon 本身
- **「今日」頁卡片重新排序（2026-09-19）**：不是照功能寫好的順序排，是照「今天早上該先看什麼」排——`今日 AI 個人建議`（一句話摘要）現在是全寬 hero 放最上面（原本埋在第 5 個位置），接著是任務清單，然後天氣（放大成 2 欄寬，資訊量比較大）配星座運勢，接著匯率配駕照筆試（練習用、不急），新聞放最後（閱讀類內容）。之後如果要加新卡片，先想清楚它是「每天必看」「順手看看」還是「有空再看」，再決定放的位置，不要直接加到最後面
- **手機寬度週曆/月曆橫向溢出 bug（2026-09-20）**：`.cal-week-grid`／`.cal-month-grid`／`.cal-month-weekdays` 都用 `grid-template-columns: repeat(7, 1fr)`，但純 `1fr` 欄位預設最小寬度是內容的 min-content，不是 0，手機窄螢幕 7 欄擠不下內容就會整排橫向溢出卡片邊界。已經全部改成 `repeat(7, minmax(0, 1fr))`。以後寫任何固定欄數的 grid，尤其是要在手機上顯示的，欄位定義都用 `minmax(0, 1fr)`，不要單寫 `1fr`
- **平板寬度版面 bug（2026-09-19）**：`.col-span-2`／`.col-span-3` 原本只在 `min-width:1024px`（3 欄版面）有定義，768–1023px 那個 2 欄斷點完全沒對應規則，導致 hero 卡片、任務清單、天氣、題庫卡都被硬塞進半欄，「今天 3 件事」橫排擠成一團。已經在 768px 斷點也補上「col-span-2/3 都當全寬」的規則
- **卡片材質改回不透明（2026-09-19，參考 Apple 官方 Liquid Glass 設計規則）**：`.card`（`dashboard-grid` 裡那些卡片）原本套了跟 masthead 一樣的玻璃霧化材質（`backdrop-filter: blur`），但 Apple 的規則是玻璃感只給「導覽層」（masthead／tab bar／sheet）用，「內容層」（這些卡片其實是逐格重複的清單）不該用玻璃。已經把 `.card` 改回不透明底色（`--bg-card-solid`），玻璃感保留在 masthead/tab-bar/modal 就好。以後新增卡片式內容，預設用不透明，不要再疊玻璃
- **卡片標題不再有 icon（2026-09-20）**：使用者覺得每個標題前面的符號多餘，`index.html`／`CalendarView.js`／`CountdownView.js`／`SettingsView.js` 的 `<h3 class="card-title">` 全部改回純文字，不要再加 icon。masthead 的太陽 icon 跟 tab bar 的 icon 沒有動（那些算導覽/品牌，不算「標題」）
- **「今日」頁再排一次（2026-09-20）**：任務清單移到最上面（原本 AI 建議 hero 卡才是第一個），接著新增一張「倒數」摘要卡（唯讀，只顯示，新增/刪除還是要去「倒數」頁），然後才是 AI 建議、天氣/星座、匯率/題庫
- **拿掉「今日最重要的一件事」（2026-09-20）**：這個黑色 banner 的內容其實從沒變過（Gemini prompt 裡有沒有正確生成都一樣），使用者判斷沒意義直接要求刪除。前端 `renderDailyAdvice()` 跟後端 `dailyAdvice.primeGoal`（prompt schema + offline fallback + main()）都拿掉了，`dailyAdvice` 現在只剩 `top3`
- **匯率歷史走勢改成真的資料（2026-09-20）**：ExchangeRate-API 免費版沒有歷史資料，`generate_brief.py` 現在自己維護 `data/exchange_rate_history.json`，每次執行存一筆當天匯率，滾動保留最近 7 筆，`yesterday`/`change`/`changePercent`/`last7Days` 全部從這份自己存的歷史算出來（不是編的假資料，前幾天資料不夠時會比較短，累積滿 7 天才有完整一週）。**這是目前唯一需要 workflow 寫回 repo 的資料**：permissions 加了 `contents: write`，多一個 commit 步驟，訊息帶 `[skip ci]` 避免跟新加的 push 觸發器form 成無限迴圈
- **星座 prompt 加了一條「可以提但不能編」的規則（2026-09-20）**：如果 AI 確定知道當下有廣為人知的天象事件（例如水星逆行），可以順帶提一句，但不確定日期就不要提，避免編造聽起來合理但其實是幻覺的天象資訊
- **天象提醒獨立成一個欄位（2026-09-22）**：使用者要求運勢要「有根據」、如果有土星逆行或其他重大天象要主動提醒，不要只是埋在長文字裡。新增 `horoscopeTransitAlert` 欄位（prompt schema／offline fallback／`main()` 都有處理，對應到 `horoscope.transitAlert`），規則比照水星逆行那條擴大到「水星逆行、土星逆行、其他行星逆行、日食／月食等」，一樣是「確定知道才填，不確定就填 null」。前端 `app.js` 的 `renderHoroscope()` 只有 `transitAlert` 有值時才畫一個獨立的橘色提醒區塊（`.transit-alert-box`），沒有事件就完全不顯示，不會跟平常的運勢摘要混在一起
- **匯率卡片加上「點開看每日明細」（2026-09-22）**：使用者要求人民幣匯率可以點下去看歷史每一天的數字（原本近 7 日走勢只有 bar 的 hover title，手機沒有 hover 等於看不到）。後端 `fetch_exchange_rate()` 新增 `last7DaysDetailed`（`[{date, rate}]`，帶真實日期，跟原本純數字的 `last7Days` 並存不衝突），前端 `app.js` 的 `renderExchangeRate()` 把整個 `.sparkline-container` 變成可點擊區塊，點一下展開/收合 `.rate-history-list`（今天／昨天／其餘日期顯示 M/D，都是真實日期不是假資料）。**踩過一個 CSS 陷阱**：`.rate-history-list` 預設有 `display: flex`，跟瀏覽器內建的 `[hidden] { display: none }` 規則同優先度打平手，author stylesheet 後載入蓋掉瀏覽器預設，導致 `hidden` 屬性完全沒用、清單永遠顯示。修法是額外補一條 `.rate-history-list[hidden] { display: none; }`。**以後任何元素要用 `hidden` 屬性做顯示切換，如果那個 class 本身有設 `display: flex/grid/block` 等非 none 值，一定要額外補 `[hidden]` 覆寫規則，不能只靠瀏覽器預設**
- **新增「追劇／讀書進度」功能，塞進「設定」頁（2026-09-22）**：對應 roadmap 第 6 步的自動分配部分，使用者要求可以填劇名/書名、填總集數/頁數，系統算出每日建議份量，還要做成 list。已用 AskUserQuestion 確認放置位置——**不開新的第 5 個 tab，塞進「設定」頁最下面**，維持 4 個 tab。新增 `js/mediaTracker.js`（純 localStorage，key: `morningBrief.mediaTracker.v1`，架構照抄 `countdown.js` 的模式，不需要後端——`個人排程AI助理_企劃書.md`原本以為「延後」按鈕需要後端寫入，但其實跟 taskEngine/countdown 一樣純前端 localStorage 就能做，不用額外後端）。核心演算法照企劃書 5.1/5.2 節：`todayQuota = ceil(剩餘量 ÷ 剩餘天數)`，落後的量會自動併入「剩餘量」不用另外存 carry_over 欄位；如果目前需要的份量超過最初平均值的 1.5 倍，顯示橘色「進度有點落後，要不要延後目標日？」提示 + 「延後 3 天」按鈕，不會默默要求使用者硬看更多（使用者自己決定要不要延）。`SettingsView.js` 加了新增表單（劇名/書名、類型：劇/書/電影、總集數/頁數、目標日）跟每筆項目的進度條、記錄今天進度輸入框、刪除鈕。已在瀏覽器實測過新增/記錄進度/落後警示/延後/刪除，行為都正確
- **OpenRouter 呼叫偶爾會吐出格式壞掉的 JSON（2026-09-22 發現）**：實測時遇過一次 `json.loads()` 對 `content` 解析失敗（`Expecting ',' delimiter`），重跑同樣的 prompt 又正常了——研判是 OpenRouter 把請求路由到不同底層 provider（例如 SambaNova vs 其他）時，就算開了 `response_format: json_object`，穩定度還是不是 100%。已經在 `synthesize_with_openrouter()` 加上重試一次的邏輯（`for attempt in range(2)`），兩次都失敗才真的 fall back 到離線樣板，不要看到有重試邏輯就以為是多餘的，這是實測踩過雷才加的

## 待辦／已知問題

- **`.github/workflows/morning_brief.yml` 現在 push 到 main 就會自動跑（2026-09-20）**：原本只有排程（07:30）跟手動觸發，改完程式碼要等到隔天或自己去點才會真的上線。現在多加了 `on: push: branches: [main]`，以後每次 push 都會自動重新產生 + 部署，不用再手動點 Run workflow。**連帶影響**：因為 workflow 現在會自己 commit 回 repo（匯率歷史那個 `[skip ci]` commit），本機的 `origin/main` 隨時可能比本機 `main` 新，**每次要 push 之前先 `git fetch && git pull --rebase origin main`**，不然會被 reject（non-fast-forward），2026-09-20 已經中過一次
- ~~QWeather GitHub Secrets 還沒設定~~ 已解決（2026-09-20）：使用者在 Actions secrets 加了 `QWEATHER_API_KEY`／`QWEATHER_API_HOST`（之前卡兩晚的原因單純是這兩個 secret 從沒真的存進去），run #64 手動觸發後線上天氣正確顯示南京栖霞區真實資料（例如：陰、25°C、濕度79%），`isFallback: false`，問題徹底解決
- ~~個人化資料還沒換~~ 已完成（2026-09-20）：`USER_PROFILE` 改成 `name: "Kasim"`、`city: "南京市"`、`district: "栖霞區"`，同步改掉 `mockData.js`、`index.html` 靜態文字、`app.js` fallback 字串、Gemini prompt、`notify_telegram.py`（這支原本寫死「蘆洲區」，現在改成讀 `weather.location`，以後地點再變不會又忘記改）
- ~~星座運勢是假的~~ 已修（2026-09-20）：`generate_brief.py` 新增 `BIRTH_CHART_SUMMARY` 常數（融合西洋占星＋八字＋紫微斗數三套系統整理出的真實命盤重點，使用者原始完整資料沒有存進 repo，只存了整理過的摘要），Gemini prompt 現在會根據這份摘要生成 `horoscopeSummary`／`horoscopeDetails`（overall/love/work/wealth/health 五項）／`horoscopeLuckyColor`／`horoscopeLuckyNumber`／`horoscopeRating`，`main()` 全部改讀這些欄位（`rating_to_stars()` 把數字評分轉成星星字串），不再是寫死的 `★★★★☆`／固定五行字句。Gemini 不可用時的離線 fallback 一樣是根據真實命盤寫的，只是不會每天換說法
- **意外抓到的舊 bug**：修星座的時候完整跑一次 pipeline 測試，發現 `strip_html()` 這個函式定義在 commit 108ab15 之後、9300ac6 之前的某次手動上傳（`Add files via upload`／`Delete...directory` 那種 commit）裡被誤刪了，但呼叫的地方還在，導致 `fetch_rss_news()` 每次都靜默丟 `NameError`、新聞永遠抓不到（有 try/except 包住不會讓整個 pipeline 掛掉，但長期都在用空清單）。已經照 108ab15 原始版本一字不改地補回來
- `index_standalone.html` 是舊版單檔備份，沒有同步 tab bar 等新功能，先不要維護這份，只維護 `index.html` + 拆開的 js/css
- **Gemini 已徹底放棄，改用 OpenRouter（2026-09-21）**：Gemini Developer API 連續踩了 4 輪雷——`gemini-2.5-flash-lite` 404（2026-10-16 停用公告）→ 換 `gemini-2.5-flash` 還是 404（Google 錯誤訊息直接說「no longer available to new users, use gemini-3.6-flash instead」）→ 換 `gemini-3.6-flash` + `X-goog-api-key` header 認證一度是 401 → 最後穩定復現的是 `FAILED_PRECONDITION: User location is not supported`。**這個地區限制查證確認是免費層根據「呼叫當下伺服器 IP」做的地區白名單限制，跟 Google 帳號的付款地/帳單地址完全無關**（一開始誤判成帳號層級地區鎖，被使用者糾正過）。四輪修正都沒解決，判斷是 GitHub Actions runner 的 IP 剛好不在白名單內，於是放棄 Gemini。已改用 **OpenRouter**（`synthesize_with_gemini()` 重新命名為 `synthesize_with_openrouter()`），model 是 `deepseek/deepseek-chat-v3.1`（付費但單次呼叫成本 < US$0.0001，一天呼叫個位數次幾乎等於免費），呼叫 `https://openrouter.ai/api/v1/chat/completions`，`Authorization: Bearer <OPENROUTER_API_KEY>`，用 `response_format: {"type": "json_object"}` 強制輸出 JSON。**已用真實 key 實測過完整 pipeline**：運勢正確扣合 `BIRTH_CHART_SUMMARY` 命盤重點、結合當天星期幾發揮，新聞摘要正確對應 RSS 候選項目，繁體中文輸出正常，不是套版文字。曾經試過 OpenRouter 的免費模型（`:free` 後綴，例如 `qwen/qwen3.8-27b:free`、`z-ai/glm-5.2:free`）但共用池常常 429 rate limit，不夠穩定，改用付費模型是使用者確認的決定，不要為了省那幾分錢改回免費模型。**下一步**：GitHub Actions repo secrets 要新增 `OPENROUTER_API_KEY`（workflow 檔案已經改成讀這個變數，但 secret 本身還沒在 GitHub 上設定，下次看到 Actions 日誌記得確認是否真的成功，不是憑空假設）
- **每日語錄功能，還沒開始（2026-09-20 提出）**：使用者想加一個「每天一句語錄」的東西，但語錄類型還沒想好（勵志/名人名言/自己寫的/哪個領域都不確定）。下次接觸這塊時先問清楚語錄類型，不要自己決定
- **App 改名，還沒決定（2026-09-20 提出）**："Morning Brief" 這個名字使用者想換掉，或至少要更像在跟他打招呼，還沒給具體名字，下次要問
- **AI 聊天框，設計方向已確認，實作中（2026-09-22）**：範圍確認——要能實際操作（延後任務、改設定），不是只能問答。用 AskUserQuestion 確認了三個技術決定：(1) 後端走**小型 Cloudflare Workers 代理**幫忙藏 `OPENROUTER_API_KEY`（純靜態網站沒地方藏 key，這是使用者選的方案，不是前端直接埋 key）；(2) 放置位置是**全站浮動按鈕**（右下角圓形按鈕，不管在哪個分頁都點得到，不佔用 tab bar 名額）；(3) 要能實際操作。架構是：前端把使用者訊息 + 目前 App 狀態摘要送到 Worker → Worker 呼叫 OpenRouter（沿用 `deepseek/deepseek-chat-v3.1`）→ 模型用 `response_format: json_object` 回傳 `{reply, action: {type, args} | null}` → **Worker 不執行動作，只是轉發決策**，實際執行（寫 localStorage）永遠在前端做，因為 Worker 是無狀態的，碰不到瀏覽器的 localStorage。**Cloudflare 帳號/部署是使用者要自己做的手動步驟**（跟當初 OpenRouter 申請 key 一樣），Worker 原始碼會放在 repo 裡（`cloudflare-worker/`），使用者部署完後把 Worker 網址告訴我，寫進前端設定
- ~~追劇/讀書進度自動分配，完全還沒開始~~ 已完成（2026-09-22，見上方「新增『追劇／讀書進度』功能」）
- ~~90 分鐘睡眠週期功能，還沒開始~~ 已完成（2026-09-22）：使用者要求兩個子功能都要——(1) 睡眠計算機：`js/sleepCalculator.js` 的 `suggestBedtimes(wakeTime)`／`suggestWakeTimes(bedTime)`，純數學運算（不用 AI），每個週期 90 分鐘、入睡緩衝固定 15 分鐘，起床模式算 6/5/4 個週期的建議上床時間，上床模式算 4/5/6 個週期的建議起床時間；(2) 就寢提醒：`js/sleepReminder.js`，純前端 `setTimeout` + 瀏覽器 `Notification` API，資料存 localStorage（key: `morningBrief.sleepReminder.v1`）。**使用者自己已經知道並接受的限制**：只在分頁還開著的時候才會跳通知，PWA 純前端沒辦法背景推播，這塊要等之後真的包成 Capacitor app 才可能做到背景通知。UI 都塞在「設定」頁的「睡眠計算機」卡片（在「固定作息時間參考」卡片下面），已在瀏覽器實測過起床/上床兩種模式的計算結果都對，通知權限允許/拒絕的分支也都測過

## 接下來要做的（照這個順序）

1. ~~`taskEngine.js`~~ 已完成（見上）
2. ~~`CalendarView.js`~~ 已完成（見上）
3. ~~`countdown.js` + `CountdownView.js`~~ 已完成（見上）
4. ~~`SettingsView.js`~~ 已完成：可調整「運動、蔬果日、PO文、洗衣採買」這幾項出現在星期幾（`taskEngine.js` 新增 `getRoutineConfig()`/`setTaskWeekdays()`/`getConfigurableTaskIds()`，設定存在跟任務資料同一個 localStorage key 底下的 `routineConfig` 欄位）。保健食品/追劇是每天固定不開放關閉；居家用品檢查/旅遊規劃/睡眠時間/手機宵禁目前只做成唯讀參考，還沒有實際的提醒/通知機制（那是第 7 步的事）
   - **每 N 天排程模式已加上（2026-09-21）**：原本每個任務只能設「星期幾」，現在每個任務可以自己獨立選「星期幾」或「每 N 天一次」（使用者確認的設計）。`taskEngine.js` 的 `DEFAULT_ROUTINE_CONFIG` 改成結構化物件 `{mode: 'weekday', days: [...]}` 或 `{mode: 'interval', everyNDays: N, anchorDate: 'YYYY-MM-DD'}`，`normalizeRoutineConfig()` 會把舊格式（純陣列）自動遷移成新格式，`isTaskActiveOnDate()` 依 mode 分流判斷（interval 模式算 `(今天 - anchorDate 天數) % everyNDays === 0`）。`setTaskWeekdays` 改名成 `setTaskWeekdaySchedule`，新增 `setTaskIntervalSchedule`。`SettingsView.js` 每個任務列多了「星期幾／每 N 天」的模式切換鈕。已用瀏覽器直接測過 interval 模式算出來的啟用日期是對的
5. Capacitor 包裝 + Codemagic 雲端構建（下一步）（沒有 Mac，走免費 Apple ID + AltStore，或視情況付費 $99/年，這個之後再決定）
6. ~~OpenRouter 接進日報~~ 已完成（2026-09-21，見上方「Gemini 已徹底放棄，改用 OpenRouter」）；~~追劇/讀書進度自動分配~~ 已完成（2026-09-22，見上方「新增『追劇／讀書進度』功能」，`js/mediaTracker.js` + `SettingsView.js`）

## 使用者的確定排程（跟任務清單/提醒功能設計有關）

- 運動：嚴格一週 2 天（週二 跑步 2km + 重訓、週四 重訓），籃球是非固定娛樂項目不算配額
- 蔬果日：週二
- 洗澡提醒／手機宵禁：每天固定 23:30／23:00
- 追劇規則：每天洗澡後到就寢前至少看完一集
- 保健食品：每天早上
- 洗衣打掃／採買下週蔬果：週日下午
- 濾心／除溼袋／馬桶殺菌球檢查＋旅遊規劃：每月第一個週日
