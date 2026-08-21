# 給測試使用者的轉傳訊息

下面這段可以直接貼到 LINE、Messenger 或 Discord；連結與 SHA-256 已對應 v0.14.1 Release 的實際內容。

---

我做了一個 Windows 測試版程式：**Grok Build Control Center 0.14.1**。

它把原本要在黑色終端機裡操作的 Grok Build，變成一般聊天視窗。你不需要會寫程式：選一個資料夾，用中文說「幫我整理這些檔案」或「幫我找出這個程式哪裡壞掉」，Grok 就會一步一步處理；要修改檔案或執行工具時，畫面也會先讓你確認。

這一版比較容易上手：上方權限改成「先問我／全部自動過」、左邊對話可排序、右邊預覽若檔在專案外可以按「允許這個資料夾」。

下載：https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.14.1

安裝方式：

1. 下載 `Grok-Build-Control-Center-Setup-0.14.1.exe`。
2. 先核對 Release 裡的 SHA-256：`e3c47dbf1e24d695e6ba449cb0ddad260a2f5cb151119340f2cb207656d9e579`。
3. 目前是尚未簽章的社群測試版，所以 Windows 可能顯示 SmartScreen 警告。只有雜湊完全相同、而且下載來源是我提供的 GitHub Release 才繼續。
4. 打開程式；第一次使用按「安裝 Grok CLI」，確認來源顯示 `https://x.ai/cli/install.ps1`。
5. 接著按「開啟瀏覽器並重新登入」，在 x.ai 官方頁面登入。
6. 回到程式按「選資料夾開始」，選資料夾，直接用中文交代工作。

幾個安心重點：

- 不用另外安裝 Node.js，也不用先學 PowerShell。
- 程式不會保存你的 Grok 密碼或 token；登入由 x.ai 官方頁面處理。
- 上方額度的 Build／Imagine／API 若顯示「—」，意思是 x.ai 這次沒有提供細項，不代表 0%，也不是壞掉。
- 這是測試版，請先拿不重要、或已經有備份的資料夾試用；看到權限確認時要先讀內容再按允許。
- 預覽若出現「工作區外」，按「允許這個資料夾並重試」即可；不要對不認識的路徑按允許。

如果遇到問題，請把「你按了什麼、畫面顯示什麼、Windows 版本」一起回傳給我，不要傳密碼、token 或私密檔案。

---
