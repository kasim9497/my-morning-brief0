# 晨序

一個人用的生活排程 App：早上打開，幾秒內知道今天要做什麼；做完打勾，固定的時間點到了會跳通知。

在 iPhone 上用 Safari「加入主畫面」安裝（PWA），不用上架、沒有帳號、資料存在自己的手機上。

線上版：https://kasim9497.github.io/my-morning-brief0/

## 功能

主角是**每天的作息和任務有沒有做到**，其他都是配角。

| 分頁 | 內容 |
|---|---|
| 今日 | 今天的任務（打勾、延後、今天不做、復原）、倒數、天氣、運勢、匯率、機車筆試題庫、每日語錄 |
| 週曆 | 一週和一個月的完成狀況，可以回頭補打勾 |
| 倒數 | 自訂的倒數日 |
| 睡眠 | 90 分鐘週期的睡眠計算機、睡眠紀錄（上床、起床、中間醒來）、作息時間和提醒 |
| 設定 | 每週安排、追劇讀書進度、整理一週紀錄交給 AI 分析、加密的雲端備份 |

右上角有 AI 助理，可以用說的延後任務、改作息、新增倒數。

## 架構

```
iPhone（加到主畫面的網頁）
  ├─ 讀 GitHub Pages 上的靜態網站和每天的 today.json
  └─ 連 Cloudflare Worker：AI 助理、推播提醒、雲端備份

GitHub Actions（每天 07:30 和每次 push）
  └─ 跑測試 → 產生 today.json（天氣、匯率、題目、語錄、運勢）→ 部署到 GitHub Pages
```

| 部分 | 位置 | 技術 |
|---|---|---|
| 前端 | `my-morning-brief-apple-design/` | 原生 ES module，沒有框架和打包工具 |
| 每日資料 | `my-morning-brief-apple-design/scripts/generate_brief.py` | Python，GitHub Actions 排程執行 |
| 後端 | `cloudflare-worker/` | Cloudflare Workers（AI 用 Workers AI，推播用 Web Push + VAPID，資料存 KV） |
| iOS 外殼 | `ios-shell/` | Capacitor，備用 |

全部用免費方案：GitHub Pages、GitHub Actions、Cloudflare Workers 免費額度。

## 資料和隱私

- 紀錄存在手機瀏覽器的 localStorage，沒有帳號系統。
- 雲端備份用使用者自己設的通關密語：內容在手機上先用 AES-GCM 加密再上傳，金鑰從密語算出來、只留在手機，伺服器只存密文。
- 推播提醒只把「幾點、星期幾」傳到伺服器，項目名稱不離開手機。
- 個人資料不放在這個公開的 repo 裡（放 GitHub Secret）。

## 在電腦上執行

ES module 不能直接雙擊開，要用本機伺服器：

```bash
cd my-morning-brief-apple-design
python -m http.server 8000
```

然後開 `http://localhost:8000`。更多方法見 [HOW_TO_RUN.md](HOW_TO_RUN.md)。

測試（不用裝任何套件，Node.js 內建）：

```bash
cd my-morning-brief-apple-design
node --test
```

## 文件

- [PRODUCT.md](PRODUCT.md)：給誰用、要解決什麼、不做什麼
- [DESIGN.md](DESIGN.md)：視覺和互動規範
- [CLAUDE.md](CLAUDE.md)：開發規則、測試和部署流程
- [docs/project-history.md](docs/project-history.md)：開發紀錄

## 已知限制

- iPhone 要「加入主畫面」並從主畫面打開，才收得到推播。
- 推播靠 Cloudflare 的每分鐘排程，可能晚一兩分鐘。
- 在某些地區連 Cloudflare Worker 需要 VPN（AI 助理、改提醒時間、雲端備份受影響）。
