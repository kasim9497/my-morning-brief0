# 晨序 iOS 外殼

這個資料夾是把晨序包成 iPhone App 用的。App 本身只是一個外殼，打開後直接載入線上的網站
（`capacitor.config.json` 的 `server.url`），所以平常改網站內容不用重新打包 App，照舊 push 就會更新。

需要重新打包的情況：改了這個資料夾裡的東西（App 名稱、圖示、原生設定、之後要加的原生功能）。

## 怎麼打包

不需要 Mac。`.github/workflows/ios_build.yml` 會在 GitHub 的 macOS 機器上做：

1. 用 Capacitor 產生 Xcode 專案（`ios/` 資料夾不進版控，每次重新產生）
2. 換上圖示、鎖定淺色外觀
3. 不簽名地編譯，包成 `chenxu-unsigned.ipa`

這個資料夾或那個 workflow 檔有變動時會自動跑，也可以在 GitHub 的 Actions 頁面手動按 Run workflow。
產出的檔案在那次執行頁面最下面的 Artifacts。

## 怎麼裝到 iPhone

產出的 `.ipa` 沒有簽名，不能直接裝。在 Windows 上用 Sideloadly 之類的工具，登入自己的 Apple ID 簽名後安裝。
免費的 Apple ID 簽出來的 App 7 天後會過期，要重新簽一次；App 裡的資料不會因此消失。
