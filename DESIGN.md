---
name: 晨序
description: 一個人用的生活排程 App，樣子比照 iOS「健康」App 的摘要頁
colors:
  system-gray-bg: "#f2f2f7"
  card-white: "#ffffff"
  ink: "#1c1c1e"
  ink-muted: "#6c6c70"
  ink-tertiary: "#8e8e93"
  hairline: "rgba(60, 60, 67, 0.12)"
  fill-subtle: "rgba(118, 118, 128, 0.10)"
  action-blue: "#007aff"
  action-blue-text: "#0058c4"
  action-blue-subtle: "rgba(0, 122, 255, 0.12)"
  done-green: "#34c759"
  done-green-text: "#1b7a34"
  alert-red: "#ff3b30"
  alert-red-text: "#c62620"
  warn-orange: "#ff9500"
  warn-orange-text: "#9a4d00"
  tint-tasks-orange: "#b85000"
  tint-countdown-red: "#c9184a"
  tint-weather-teal: "#00758a"
  tint-horoscope-purple: "#8e3bbf"
  tint-rate-green: "#1b7a34"
  tint-quote-indigo: "#4a48c8"
  tint-quiz-blue: "#0066d6"
typography:
  large-title:
    fontFamily: "-apple-system, 'SF Pro Display', 'PingFang TC', 'Noto Sans TC Variable', sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
  title1:
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title2:
    fontSize: "1.375rem"
    fontWeight: 700
    letterSpacing: "-0.015em"
  title3:
    fontSize: "1.25rem"
  body:
    fontSize: "1.0625rem"
    fontWeight: 400
  subhead:
    fontSize: "0.9375rem"
  footnote:
    fontSize: "0.8125rem"
  caption:
    fontSize: "0.75rem"
  caption2:
    fontSize: "0.6875rem"
rounded:
  sm: "8px"
  md: "14px"
  lg: "26px"
  xl: "28px"
  pill: "9999px"
spacing:
  page-gutter: "1.25rem"
  stack-gap: "0.75rem"
  card-padding-y: "1rem"
  card-padding-x: "1.25rem"
  row-min-height: "44px"
components:
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "1rem 1.25rem"
  button-tinted:
    backgroundColor: "{colors.action-blue-subtle}"
    textColor: "{colors.action-blue-text}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
    height: "40px"
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.pill}"
  text-button:
    textColor: "{colors.action-blue}"
    height: "44px"
  list-row:
    textColor: "{colors.ink}"
    height: "44px"
  input:
    backgroundColor: "{colors.fill-subtle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.6rem 0.85rem"
  switch:
    width: "51px"
    height: "31px"
    rounded: "{rounded.pill}"
  tab-bar:
    rounded: "{rounded.pill}"
    height: "64px"
---

# Design System: 晨序

## Overview

**Creative North Star: "健康 App 的摘要頁"**

晨序看起來要像 iPhone 內建的 App：系統灰的底、白色的卡片、粗體的大數字、細線分隔的清單。使用者每天早上和空檔打開它幾秒鐘，所以畫面的任務是「讓人不用讀就看懂」，不是讓人欣賞。熟悉感本身就是設計：使用者不該需要學任何新的操作方式。

元件的手感是**紮實、明確**。能按的東西一眼看得出來能按，按下去有清楚的回饋（縮一下、變淡一下），不靠懸停、不靠猜。裝飾幾乎沒有；顏色只做兩件事——標出「這一區是什麼」（每個區塊一個代表色）和「這個可以按」（藍色）。

只有淺色外觀。深色模式做過又拿掉了：加到主畫面後，系統畫的狀態列在深色下顏色對不上，網頁控制不了。

**Key Characteristics:**
- 灰底白卡，卡片沒有邊框也沒有陰影。
- 卡片裡的明細是細線分隔的列，不再包一層有底色的小框。
- 一頁只有一個粗體大標題；卡片標題用代表色，不加圖示。
- 玻璃材質只給浮在內容上面的導覽層（頂端導覽列、底部選單、底部彈出的對話框）。
- 每一個可以點的東西至少 40–44px 高。

## Colors

色盤就是 iOS 的系統色：中性的灰和白佔絕大部分，飽和色只出現在需要被注意的地方。

### Primary
- **行動藍** (`action-blue`)：所有「可以按」的東西——文字按鈕、主要按鈕、選中的日期、開著的分段控制。畫面上看到藍色就代表能互動。
- **行動藍・文字版** (`action-blue-text`)：藍色文字放在淡藍底上時用這個加深的版本，對比才夠。

### Secondary
- **完成綠** (`done-green`)、**警示紅** (`alert-red`)、**提醒橘** (`warn-orange`)：狀態色。綠是做完了，紅是刪除或答錯，橘是落後或天象提醒。各有一個加深的文字版（`-text`），彩色文字一律用文字版。

### Tertiary
- **區塊代表色**（七個 `tint-*`）：任務橘、倒數紅、天氣青、運勢紫、匯率綠、題庫藍、語錄靛。只用在卡片標題的文字上，讓人掃一眼就知道這張卡是什麼。都是加深過的色，可以直接當文字用。

### Neutral
- **系統灰底** (`system-gray-bg`)：整個頁面的底色。
- **卡片白** (`card-white`)：卡片的底色，不透明。
- **墨色** (`ink`)／**次要墨色** (`ink-muted`)／**第三層墨色** (`ink-tertiary`)：正文、說明、備註。
- **髮絲線** (`hairline`)：清單列之間的分隔線。
- **淡填色** (`fill-subtle`)：輸入框、沒選中的星期按鈕、分段控制的底。

### Named Rules
**藍色只給能按的東西。** 藍色不拿來裝飾、不拿來當標題色（題庫卡片的代表色是另一個比較深的藍）。

**彩色文字用文字版。** 原始的飽和色（`#ff9500`、`#34c759`、`#ff3b30`）對比度不到 4.5:1，只能當圖示、開關、邊框的顏色，不能當文字。

**不要寫死色碼。** 所有顏色走 `css/styles.css` 最上面 `:root` 的變數。

## Typography

**Display Font / Body Font:** 系統字體（iPhone 上是 SF Pro 和蘋方），其他裝置退回自己放在專案裡的思源黑體可變字重版。

**Character:** 一套字體、九個字級、三種字重。層級靠字級和字重拉開，不靠換字體。

### Hierarchy
- **Large Title** (700, 2.125rem／34px)：每一頁最上面的大標題，一頁只有一個。「今日」頁的大標題是問候語。
- **Title 1** (700, 1.75rem／28px, 行高 1.1, 等寬數字)：卡片裡的大數字——匯率、倒數天數、題庫成績。
- **Title 2** (700, 1.375rem／22px)：卡片外面的區塊標題。
- **Title 3** (1.25rem／20px)：少用，介於區塊標題和內文之間。
- **Body** (400, 1.0625rem／17px)：內文、清單列、卡片標題（卡片標題是 600）。
- **Subhead** (0.9375rem／15px)：次要內文、按鈕文字。
- **Footnote** (0.8125rem／13px)：說明文字、備註。
- **Caption** (0.75rem／12px)、**Caption 2** (0.6875rem／11px)：標籤、底部選單的字。

### Named Rules
**九級規則。** 字級只用這九個變數（`--text-large-title` 到 `--text-caption2`），不寫零散的數字。之前有三十多種字級，使用者看了說「怪怪的」。

**700 很貴。** 粗體 700 只給頁面大標題、區塊標題、大數字。其他最多 600，內文 400。

**輸入框 16px 起跳。** 手機上輸入框和選單的字級不能小於 16px，不然 iPhone 會自動放大頁面。

## Layout

單欄。內容最寬 860px、置中，左右各留 1.25rem。卡片之間、卡片和區塊標題之間的間距統一是 0.75rem，由外層的 `.card-stack` 或 `.dashboard-grid` 管，個別元素不自己加上下邊距。

768px 以上「今日」頁變成兩欄，寬的卡片（任務、天氣、題庫）橫跨整列。手機是主要的使用情境，桌機只要不壞就好。

頂端導覽列和底部選單是固定的，內容從它們底下捲過去。上下都要讓出安全區（瀏海、底部橫條）。

固定欄數的格線（週曆七欄、星期按鈕七顆）欄位一律寫 `minmax(0, 1fr)`，不然手機上會橫向溢出。

**今日頁的順序是照「早上先看什麼」排的**：任務 → 倒數 → 天氣和運勢 → 匯率和題庫 → 語錄。加新卡片前先想它是每天必看、順手看看、還是有空再看。

## Elevation & Depth

內容層是平的：卡片沒有陰影、沒有邊框，靠「白卡在灰底上」分出層次。

只有浮在內容上面的東西有深度：

### Shadow Vocabulary
- **浮動** (`box-shadow: 0 8px 28px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)`)：底部選單。
- **對話框** (`box-shadow: 0 32px 64px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08)`)：從底部彈出的 AI 助理。

### Named Rules
**玻璃只給導覽層。** 毛玻璃（`backdrop-filter: blur`）只用在頂端導覽列、底部選單、底部對話框。卡片是內容，一律不透明。

## Shapes

圓角分四級：小元件 8px（分段控制裡的按鈕）、中元件 14px（輸入框、月曆格子）、卡片 26px、底部對話框 28px。按鈕、開關、底部選單是膠囊形。

星期按鈕是 10px 的圓角方形，七顆排成一列。使用者明確說過不要一顆顆圓形，「太多圓形很亂」。

圖示是線條風格：24×24、線寬 1.6–1.8、圓頭。只有底部選單的圖示是實心的。作息項目的圖示是彩色圓角方塊配白色線條。不用表情符號當圖示。

## Components

### Buttons
- **Shape:** 膠囊形，最小高度 40px。
- **Tinted（預設）:** 淡藍底配深藍字，用在次要動作。
- **Primary:** 實心藍底白字，一張卡片最多一顆。`.btn-block` 讓它佔滿整列。
- **Text button（`.section-action`）:** 只有藍色文字，沒有底。用在區塊標題右邊的「編輯」、清單列尾的「加入」。點擊範圍至少 44×44px。
- **Pressed:** 按下去縮小一點（0.09 秒）或變淡。同時寫 `:active` 和 `.is-pressing`，後者由 `app.js` 在手指碰到的瞬間加上。
- **Hover:** 只在有滑鼠的裝置上出現（`@media (hover: hover) and (pointer: fine)`）。

### Cards / Containers
- **Corner Style:** 26px。
- **Background:** 不透明的白。
- **Shadow Strategy:** 沒有。
- **Border:** 沒有。
- **Internal Padding:** 上下 1rem、左右 1.25rem。
- **Title:** 17px、600、用這張卡的代表色（卡片加 `.tint-xxx`）；右邊可以放一個灰色的小標記。標題前面不加圖示。

### List rows
卡片裡的明細一律是列：最小高度 44px、左邊名稱右邊值、列與列之間一條髮絲線。備註用 13px 的灰字放在名稱下面一行。不要在卡片裡再包一層有底色的框。

### Inputs / Fields
- **Style:** 淡填色的底、沒有邊框、圓角 14px。
- **列內輸入框（`.row-input`）:** 沒有底也沒有框，直接在清單列裡打字，至少 36px 高。
- **Focus:** 列內輸入框底部出現一條藍線。
- **Switch:** 51×31px 的膠囊，開的時候是綠色。

### Segmented control
淡填色的底，裡面的選項是 8px 圓角；選中的那個變白底。用在「週／月」「星期幾／每 N 天」。兩三個互斥選項用這個，不要用一排膠囊按鈕。

### Navigation
- **頂端導覽列:** 固定在最上面，一開始是透明的；往下捲超過 56px 才浮出玻璃底和置中的小標題。右邊兩顆圓形按鈕（重新整理、AI 助理）。
- **底部選單:** 置中的浮動玻璃膠囊，最寬 420px、高 64px，離底部 10px 加安全區。五個分頁，圖示實心，選中的那個有一塊淡色的底。
- **切換分頁:** 內容照分頁的左右順序滑入（0.28 秒）。只是動畫，沒有手指左右滑的手勢。

### Metric
大數字加單位：數字是 Title 1、等寬數字，單位是旁邊的小灰字。匯率、倒數、題庫成績共用。

### Swipe row
清單列可以向左滑露出紅色的刪除鈕（88px 寬）。同時一定要有看得見的入口：卡片右上角的「編輯」。編輯時列不移動，右邊讓出刪除鈕的位置，名稱變成可以改的輸入框。

## Do's and Don'ts

### Do:
- **Do** 所有顏色、字級、圓角都用 `:root` 的變數。
- **Do** 讓每個可以點的東西至少 40–44px 高。
- **Do** 卡片裡的明細用細線分隔的列。
- **Do** 彩色文字用加深的 `-text` 版本或 `tint-*`。
- **Do** `:hover` 包在 `@media (hover: hover) and (pointer: fine)` 裡。
- **Do** 按壓樣式同時寫 `:active` 和 `.is-pressing`，並把 class 加進 `app.js` 的 `PRESSABLE_SELECTOR`。
- **Do** 用 `hidden` 屬性切換顯示時，如果那個 class 有設 `display`，另外補一條 `[hidden] { display: none }`。
- **Do** 滑動才看得到的操作，另外給一個看得見的入口。

### Don't:
- **Don't** 在卡片上加陰影、邊框或毛玻璃。
- **Don't** 在卡片裡再包一層有底色的小框。
- **Don't** 在卡片標題前面加圖示，或用表情符號當圖示。
- **Don't** 在頁面標題、卡片標題、卡片內容三層重複同一個詞。
- **Don't** 用一顆顆圓形按鈕排成一排。
- **Don't** 在日期旁邊放「數字/數字」的寫法（會被看成日期）。
- **Don't** 加深色模式，除非狀態列的顏色能被控制。
- **Don't** 在卡片或區塊上自己加上下邊距。
- **Don't** 把系統字體（SF Pro、蘋方）的檔案放進專案，授權不允許。
