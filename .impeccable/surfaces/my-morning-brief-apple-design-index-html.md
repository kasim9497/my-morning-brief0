---
version: 1
slug: "my-morning-brief-apple-design-index-html"
primary_target: "my-morning-brief-apple-design/index.html"
related_targets: []
---

# Today page (今日)

Scope: `my-morning-brief-apple-design/index.html` 的今日分頁。Mode: Operate。其他四個分頁暫時維持舊樣子，使用者滿意今日頁後再套用。

Audience and job: 使用者一個人。早上起床和白天空檔打開，要在幾秒內知道「今天該注意什麼」，並看到自己有累積（連續天數、睡眠趨勢）。他實際在用的是睡眠紀錄、機車筆試題庫、天氣／匯率／運勢／語錄；任務清單幾乎沒用，所以縮成一格、能自動完成的自動完成。

Constraints: 淺色；不要幼稚；不編內容（宜／忌每一條都由真實紀錄或當天資料推出來）；iPhone PWA，純 ES module。

## Direction contract

THESIS: 今日頁是一張為他印的日曆頁，不是待辦清單。拒絕的是「白卡片一張張往下疊、每張一樣重」的摘要頁。

OWN-WORLD: 撕頁日曆。亮白紙、墨黑字、平日正綠、週末朱紅兩色印刷（顏色跟著星期換）；數字用 Barlow Condensed 粗體，中文用 Noto Sans TC；紙張是直角小圓角、綠色細線分欄、小字密排。狀態用記號的形狀表示（實心、空心、劃掉），不只靠顏色。

STORY: 打開先看到今天的日期和「宜／忌」，知道今天的重點；往下一排三欄看到睡眠、題庫、作息各自的數字和連續天數；再往下才是天氣、匯率、運勢、語錄。

FIRST VIEWPORT: 上半是日曆頁：左上農曆、右上星期，中間一個佔滿寬度一半以上的超大日期數字，右側直排月份和年份；撕線下面是「宜」「忌」兩列。緊接一排三欄密排（睡眠／題庫／作息）。每天第一次打開，昨天那一頁會撕掉。

FORM: 撕頁日曆／農民曆，使用者把選擇交給我、條件是不要太幼稚；這是我排序的第 1 個，抽選指定的是第 5 個（道路標誌），因為跟「不要幼稚」衝突而換掉。seed key 44bc8a16。從沒採用的方向借來的紀律：狀態用形狀而不只是顏色（光譜線）、三欄小字密排的密度（日式高密度）。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
