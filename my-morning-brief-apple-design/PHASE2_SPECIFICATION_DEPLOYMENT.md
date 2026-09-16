# 個人 AI 數位晨報系統｜Phase 2～Phase 4 規格化落地實作指南

## 1. 系統核心架構與職責分離 (Architecture)

本系統徹底區分「靜態網頁前端」與「雲端定時自動化後端」：

```text
                  ☀️ Personal AI Morning Brief
                               │
                       [GitHub Repository]
                               │
            ┌──────────────────┴──────────────────┐
            ↓                                     ↓
   [GitHub Pages 前端靜態頁面]              [GitHub Actions 自動化管道]
   • 託管 index.html, styles.css          • 每日 07:30 AM (UTC 23:30) 定時啟動
   • 讀取今日最新 today.json              • 執行 scripts/generate_brief.py
   • 使用者開啟瀏覽器即時閱讀               ├─ 1. 抓取 CWA 氣象局 API (蘆洲區)
   • 零 API Key 曝露安全防護               ├─ 2. 抓取 ExchangeRate API (CNY/TWD)
                                          ├─ 3. 從 data/questions.json 抽出 5 題機車駕照筆試
                                          ├─ 4. 抓取 RSS AI 科技新聞 (OpenAI, Google)
                                          ├─ 5. 呼叫 Gemini 2.5 Flash-Lite 進行 AI 摘要
                                          └─ 6. 生成並 Commit 更新 today.json 檔
                                                  │
                                                  ↓
                                        [Telegram Bot 訊息推播]
```

---

## 2. API 資料來源與「API 負責事實，Gemini 負責理解」原則

| 模組 | 資料來源與 API 規格 | 處理原則 (Fact vs Understanding) |
| :--- | :--- | :--- |
| **今日天氣** | **中央氣象署 (CWA) Open Data API**<br/>`F-D0047-071` 鄉鎮天氣預報（新北市蘆洲區） | **API 提供事實**（溫度、降雨機率）<br/>**Gemini 生成建議**（穿著與攜帶雨具提醒） |
| **人民幣匯率** | **ExchangeRate-API**<br/>`https://open.er-api.com/v6/latest/CNY` | **API 提供事實**（數字、計算漲跌與走勢）<br/>**Gemini 進行解讀**（簡單一句話經濟氛圍） |
| **駕照筆試** | **2026 官方普通重型機車筆試題庫**<br/>儲存於 `data/questions.json` | **官方題庫提供事實**（題目、選項、正解與官方解析）<br/>**禁止 AI 隨機自編** |
| **AI 科技新聞** | **官方 RSS Feeds**<br/>(OpenAI, Google AI Blog, TechCrunch) | **RSS 提供事實標題與網址**<br/>**Gemini 進行三段式整理**（發生什麼事 → 為什麼重要 → 對我的意義） |

---

## 3. Gemini 2.5 Flash-Lite API 規格與 Prompt 設定

### 3.1 模型選擇說明
- **淘汰舊型號**：Gemini 1.5 系列已舊，Gemini 2.0 Flash 已於 2026 年 6 月 1 日停止服務。
- **採用 Gemini 2.5 Flash-Lite**：Google 目前最新專為高效能、高吞吐、低成本設計的模型，完全滿足資訊摘錄與重組需求。
- **成本與免費額度**：Google AI Studio 提供 Free Tier 額度，每日僅呼叫 1 次，每月預估費用約為 **NT$0 ～ NT$10**。

### 3.2 結構化 Prompt 規範
Python 腳本傳送給 Gemini 的 Prompt 嚴格採用 JSON Schema 約束：
```json
{
  "weatherTip": "針對溫差與降雨的一句話實用出門提醒",
  "horoscopeSummary": "針對處女座今日星象的2句簡短指引",
  "aiNews": [
    {
      "id": "n1",
      "source": "來源名稱",
      "title": "繁體中文新聞標題",
      "summary": "一句話摘要發生什麼事",
      "whyImportant": "為什麼重要 (產業趨勢)",
      "myImpact": "對使用者 (AI PM / 個人專案) 的啟發與意義"
    }
  ],
  "dailyAdvice": {
    "top3": [
      {"icon": "🌧️", "text": "天氣提醒"},
      {"icon": "🛵", "text": "駕照練習方向"},
      {"icon": "🤖", "text": "科技新知建議"}
    ],
    "primeGoal": "今日最重要的一件事 (直接切中要點)"
  }
}
```

---

## 4. 安全規範：GitHub Secrets 金鑰管理

為確保安全性，**前端程式碼 (HTML/JS) 嚴禁放置任何 API Key**。所有敏感金鑰均存於 GitHub Repository 的 Secrets 中：

1. 前往 GitHub 專案倉庫 → **Settings** → **Secrets and variables** → **Actions**.
2. 新增以下 Secrets：
   - `GEMINI_API_KEY`: Google AI Studio 申請之 API 金鑰。
   - `CWA_API_KEY`: 中央氣象署氣象資料開放平台授權碼。
   - `TELEGRAM_BOT_TOKEN`: (選填) Telegram BotFather 取得之 Token。
   - `TELEGRAM_CHAT_ID`: (選填) Telegram 個人或頻道 Chat ID。

---

## 5. 快速上線與部署流程

1. **建立 GitHub 倉庫**：在 GitHub 上建立新 Repository（例如 `my-morning-brief`）。
2. **上傳專案檔案**：將 `morning-brief-mvp/` 目錄下的所有檔案 Commit 並 Push 至 `main` 分支。
3. **設定 Secrets**：於 GitHub Settings 填入 `GEMINI_API_KEY` 與 `CWA_API_KEY`。
4. **開啟 GitHub Pages**：
   - 到 Settings → Pages → Build and deployment → Source 選擇 `Deploy from a branch` (Branch: `main` / `/root`)。
5. **手動測試自動化流程**：
   - 前往 GitHub Actions 頁籤 → 點擊 `Daily Morning Brief Automated Pipeline` → 點擊 `Run workflow` 手動執行。
   - 執行成功後，Actions 會更新 `today.json`，稍等 1 分鐘打開 GitHub Pages 網址，即可看到真實產出的 AI 數位晨報！
