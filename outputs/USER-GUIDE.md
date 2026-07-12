# Grok Build Control Center 使用指南

## 第一次安裝

1. 執行 `Grok-Build-Control-Center-Setup-0.3.2.exe`。
2. 從開始選單開啟 **Grok Build Control Center**。
3. 如果畫面顯示找不到 CLI，按 **安裝 Grok CLI**。
4. 確認畫面顯示的官方來源是 `https://x.ai/cli/install.ps1`，再按 **確認安裝 Grok CLI**。
5. 安裝成功後按 **開啟瀏覽器並重新登入**，在 x.ai 頁面完成登入。
6. 回到程式，按 **選擇專案開始**，挑選想讓 Grok 協助的資料夾。

不需要自行安裝 Node.js，也不需要學 PowerShell。Windows Terminal 只在使用進階 TUI 功能時才需要，不影響 GUI 的聊天、改檔與測試功能。

## 基本操作

- 左側選擇既有 session，或按「新 Session」選擇工作目錄。
- 用中文白話輸入任務；`Enter` 傳送，`Shift+Enter` 換行，`Esc` 依序關閉視窗或取消執行中的回合。
- `Ctrl+F` 搜尋目前對話，`Ctrl+K` 搜尋 session，`Ctrl+Shift+P` 開啟命令面板。
- 向上閱讀時不會被串流強制拉回底部；按「跳到最新」恢復跟隨。
- 標題列可切換 Grok 提供的模型；支援 reasoning 的模型會顯示 High／Medium／Low effort。
- 權限視窗預設聚焦取消／拒絕選項，請先看清楚 Grok 要執行的動作再允許。

## 切換帳號

按上方的 **切換帳號**，確認後由 Grok CLI 開啟 x.ai 官方瀏覽器登入頁。程式不保存密碼、token 或多組帳號，也不讀取 `~/.grok/auth.json`。CLI 0.2.93 沒有提供目前帳號 email 或帳號清單，因此 GUI 不會假裝顯示這些資料。

## 額度怎麼看

- **總額度**：本週訂閱的整體使用比例。
- **Build／Imagine／API**：只顯示 x.ai billing 服務實際回傳的比例。
- 顯示 **—** 代表服務沒有提供該項拆分，不是 0%，也不是程式故障。
- Session 內的 Context 百分比是目前對話的 token 空間，和本週訂閱額度不同。

## TUI 出口

Compact、Rewind、Plugins、MCP、Memory 等尚無穩定結構化 ACP 介面的功能，請按 session 標題列的終端圖示，在 Windows Terminal 中開啟真正的 Grok TUI。GUI 不模擬終端按鍵。

## Windows 安全提醒

目前社群 installer 尚未簽章。Windows SmartScreen 可能出現「Windows 已保護您的電腦」。只使用你信任的人提供的 GitHub Release，並先比對同一個 Release 中的 `SHA256SUMS.txt`；雜湊不同就不要執行。
