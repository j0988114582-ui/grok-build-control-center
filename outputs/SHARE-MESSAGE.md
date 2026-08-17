# 給測試使用者的轉傳訊息

下面這段可以直接貼到 LINE、Messenger 或 Discord；連結與 SHA-256 已對應 v0.14.0 Release 的實際內容。

---

我做了一個 Windows 測試版程式：**Grok Build Control Center**。

它把原本要在黑色終端機裡操作的 Grok Build，變成一般聊天視窗。你不需要會寫程式：選一個資料夾，用中文說「幫我整理這些檔案」或「幫我找出這個程式哪裡壞掉」，Grok 就會一步一步處理；要修改檔案或執行工具時，畫面也會先讓你確認。

下載：https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.14.0

安裝方式：

1. 下載 `Grok-Build-Control-Center-Setup-0.14.0.exe`。
2. 先核對 Release 裡的 SHA-256：`7E9BB5B08F250DD7E65727571F66489E928A5F1BA8C365E5CCC3635F53B84007D`。
3. 目前是尚未簽章的社群測試版，所以 Windows 可能顯示 SmartScreen 警告。只有雜湊完全相同、而且下載來源是我提供的 GitHub Release 才繼續。
4. 打開程式；第一次使用按「安裝 Grok CLI」，確認來源顯示 `https://x.ai/cli/install.ps1`。
5. 接著按「開啟瀏覽器並重新登入」，在 x.ai 官方頁面登入。
6. 回到程式按「選資料夾開始」，選資料夾，直接用中文交代工作。

幾個安心重點：

- 不用另外安裝 Node.js，也不用先學 PowerShell。
- 程式不會保存你的 Grok 密碼或 token；登入由 x.ai 官方頁面處理。
- 上方額度的 Build／Imagine／API 若顯示「—」，意思是 x.ai 這次沒有提供細項，不代表 0%，也不是壞掉。
- 這是測試版，請先拿不重要、或已經有備份的資料夾試用；看到權限確認時要先讀內容再按允許。

如果遇到問題，請把「你按了什麼、畫面顯示什麼、Windows 版本」一起回傳給我，不要傳密碼、token 或私密檔案。

---
