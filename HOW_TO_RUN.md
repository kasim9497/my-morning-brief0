# 怎麼打開這個專案看成品

這個專案的主要版本在 `my-morning-brief-apple-design/index.html`，它用的是 ES module
（`<script type="module">`），**不能直接雙擊打開**，瀏覽器會因為安全限制擋掉裡面的
`import`，畫面會整個空白。必須透過一個本機伺服器打開。

## 方法一：VS Code + Live Server（推薦，全程滑鼠點擊，不用打指令）

1. 安裝 [VS Code](https://code.visualstudio.com/)（免費）
2. 打開 VS Code，左側擴充功能圖示（四個方塊那個）搜尋 `Live Server`，安裝
   （作者是 Ritwick Dey，安裝數最多那個）
3. VS Code 選「開啟資料夾」，選 `my-morning-brief-apple-design` 這個資料夾
4. 在檔案總管找到 `index.html`，滑鼠右鍵 → `Open with Live Server`
5. 瀏覽器會自動開一個 `http://127.0.0.1:5500/...` 的網址，這就是成品畫面
6. 之後每次改完程式碼存檔，瀏覽器會自動重新整理，不用手動重整

## 方法二：不想裝 VS Code，用內建終端機

前提：電腦要有裝 Python（Windows 從微軟市集裝，Mac 內建就有）。

1. 打開終端機（Windows 是「命令提示字元」或 PowerShell，Mac 是「終端機」App）
2. `cd` 進去 `my-morning-brief-apple-design` 這個資料夾
3. 打指令：`python -m http.server 8000` （某些系統要打 `python3`）
4. 瀏覽器開 `http://localhost:8000`

## 關於 index_standalone.html

這個資料夾裡還有一個 `index_standalone.html`，是單一檔案的舊版本備份，
CSS／JS 全部包在同一個檔案裡，**可以直接雙擊打開**，不用伺服器。

**但它目前沒有底部 Tab Bar（今日／週曆／倒數／設定）這個新功能**，
是舊的、還沒同步更新的版本。要看新功能請用方法一或二打開 `index.html`，
不要看 `index_standalone.html`，不然會以為改的東西沒生效。
