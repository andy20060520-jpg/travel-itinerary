# 旅行分帳（歐元）

多支手機一起記帳、即時同步、自動算出「誰該轉給誰多少錢」的網頁 App。

- 一人建立帳本，用連結或 QR Code 邀請旅伴，不需要註冊帳號
- 支出可平均分或自訂每人金額，金額以歐元（€）計算
- 用最少的轉帳次數結清，還完錢可按「已還」留下紀錄
- 沒有網路時也能記帳，連上網後自動同步
- 可「加入主畫面」，用起來像 App

## 先試用（不用任何設定）

`firebase-config.js` 的 `apiKey` 是空的時候，會以「單機試用模式」執行：資料只存在這支手機，不會同步。

在專案根目錄啟動任何靜態伺服器，例如 `python -m http.server 5500`（或用上層的 `serve.ps1`），再打開 `http://localhost:5500/split-bill/`。

## 啟用多人同步：設定 Firebase（免費，約 10 分鐘）

1. 到 <https://console.firebase.google.com> 用 Google 帳號登入 →「新增專案」，名稱隨意（例如 `split-bill`），Google Analytics 可關閉。
2. 左側「建構 → Authentication」→「開始使用」→「Sign-in method」→ 啟用 **匿名**。
3. 左側「建構 → Firestore Database」→「建立資料庫」→ 位置建議選 `europe-west`（歐洲旅遊較快）→ 以「正式版模式」建立。
4. Firestore 的「規則」分頁 → 把本資料夾的 `firestore.rules` 內容整個貼上 →「發布」。
5. 專案總覽旁的齒輪「專案設定」→「你的應用程式」→ 點 `</>`（網頁）→ 註冊應用程式（不用勾 Hosting）→ 複製出現的 `firebaseConfig`，貼到 `firebase-config.js`。
6. 部署網頁（見下方），再到「Authentication → 設定 → 已授權網域」加入你的網址網域（例如 `你的帳號.github.io`）。

> `firebaseConfig` 本來就會出現在網頁上，不是密碼；資料安全由 `firestore.rules` 控制。

免費方案（Spark）每天 5 萬次讀取、2 萬次寫入，一群人出國記帳綽綽有餘，不會被收費。

## 部署到手機能開的網址（GitHub Pages）

1. 把這個 repo 推到 GitHub，到 repo 的「Settings → Pages」，Source 選「Deploy from a branch」，選分支與 `/ (root)`。
2. 幾分鐘後網址會是 `https://<帳號>.github.io/<repo 名稱>/split-bill/`。
3. 用手機打開 → 建立帳本 →「邀請」→ 讓旅伴掃 QR Code。
4. iPhone：Safari 分享 →「加入主畫面」；Android：Chrome 選單 →「安裝應用程式」。

## 檔案說明

| 檔案 | 用途 |
| --- | --- |
| `index.html` / `style.css` | 介面 |
| `app.js` | 畫面與操作邏輯 |
| `store.js` | 資料層：Firestore 即時同步，或 localStorage 單機試用 |
| `settle.js` | 分帳計算（金額以歐分整數處理，避免小數誤差） |
| `firebase-config.js` | 貼上你的 Firebase 設定 |
| `firestore.rules` | 資料庫安全規則 |
