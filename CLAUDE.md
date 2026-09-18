# 專案脈絡（給 Claude Code 讀的）

這是 kasim9497/my-morning-brief0，一個南京交換學期用的個人生活排程 App，正在從純展示型晨報，擴充成一個整合任務清單、週曆、倒數、追劇/讀書自動排程的 App，最終目標是用 Capacitor 包成真正的 iOS app。

## 現況（已經做完的部分）

- `my-morning-brief-apple-design/` 是前端主目錄，純 ES module（`index.html` 用 `<script type="module">`），**開發時必須用本機伺服器（VS Code Live Server 或 `python -m http.server`）打開，不能直接雙擊 index.html**
- 已經加了底部 4 個 tab（今日／週曆／倒數／設定），邏輯在 `js/tabs.js`，今日以外的三個目前是空的 placeholder
- `scripts/generate_brief.py`：GitHub Actions 每天定時執行，抓天氣／匯率／新聞／機車筆試題庫，經 Gemini 合成後輸出 `data/today.json`，前端讀這個檔案渲染
- 天氣資料來源已從台灣 CWA 換成南京的和風天氣（QWeather），`fetch_weather()` 用 `QWEATHER_API_KEY` + `QWEATHER_API_HOST`（本機驗證通過，2026-09-18；GitHub Secrets 是否已設定要跟使用者確認）
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
- **卡片材質改回不透明（2026-09-19，參考 Apple 官方 Liquid Glass 設計規則）**：`.card`（`dashboard-grid` 裡那些卡片）原本套了跟 masthead 一樣的玻璃霧化材質（`backdrop-filter: blur`），但 Apple 的規則是玻璃感只給「導覽層」（masthead／tab bar／sheet）用，「內容層」（這些卡片其實是逐格重複的清單）不該用玻璃。已經把 `.card` 改回不透明底色（`--bg-card-solid`），玻璃感保留在 masthead/tab-bar/modal 就好。以後新增卡片式內容，預設用不透明，不要再疊玻璃

## 待辦／已知問題

- **QWeather GitHub Secrets 待確認**：Host（`jj44ucf442.re.qweatherapi.com`）跟認證方式（`X-QW-Api-Key` header）都已經改好且本機測試成功，但還沒確認使用者是否已經把 `QWEATHER_API_KEY`／`QWEATHER_API_HOST` 加進 GitHub repo 的 Secrets，動 `.github/workflows/morning_brief.yml` 或懷疑 Actions 天氣沒更新時先確認這件事
- **個人化資料還沒換**：`USER_PROFILE`（`name: "Jinhao"`、`zodiac: "處女座"` 等）跟 Gemini prompt 裡寫死的敘述都還是舊測試資料，不是使用者本人的。改動這塊前先跟使用者確認要填什麼，不要自己編
- **星座運勢是假的**：使用者認為目前的星座卡片只是套用生肖的罐頭文字，已經給過一次真實命盤資料（西洋占星＋八字＋紫微斗數，生日 2005-09-07），但那份完整資料沒有存在專案裡，要重做這塊時要再跟使用者要一次
- `index_standalone.html` 是舊版單檔備份，沒有同步 tab bar 等新功能，先不要維護這份，只維護 `index.html` + 拆開的 js/css

## 接下來要做的（照這個順序）

1. ~~`taskEngine.js`~~ 已完成（見上）
2. ~~`CalendarView.js`~~ 已完成（見上）
3. ~~`countdown.js` + `CountdownView.js`~~ 已完成（見上）
4. ~~`SettingsView.js`~~ 已完成：可調整「運動、蔬果日、PO文、洗衣採買」這幾項出現在星期幾（`taskEngine.js` 新增 `getRoutineConfig()`/`setTaskWeekdays()`/`getConfigurableTaskIds()`，設定存在跟任務資料同一個 localStorage key 底下的 `routineConfig` 欄位）。保健食品/追劇是每天固定不開放關閉；居家用品檢查/旅遊規劃/睡眠時間/手機宵禁目前只做成唯讀參考，還沒有實際的提醒/通知機制（那是第 7 步的事）
5. Capacitor 包裝 + Codemagic 雲端構建（下一步）（沒有 Mac，走免費 Apple ID + AltStore，或視情況付費 $99/年，這個之後再決定）
6. OpenRouter 接進日報 + 追劇/讀書進度自動分配（輸入總集數/頁數 + 目標完成日，自動算每日份量，落後太多要提示而不是默默加量）

## 使用者的確定排程（跟任務清單/提醒功能設計有關）

- 運動：嚴格一週 2 天（週二 跑步 2km + 重訓、週四 重訓），籃球是非固定娛樂項目不算配額
- 蔬果日：週二
- 洗澡提醒／手機宵禁：每天固定 23:30／23:00
- 追劇規則：每天洗澡後到就寢前至少看完一集
- 保健食品：每天早上
- 洗衣打掃／採買下週蔬果：週日下午
- 濾心／除溼袋／馬桶殺菌球檢查＋旅遊規劃：每月第一個週日
