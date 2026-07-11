# Grok Build GUI 使用指南

## 安裝與啟動

1. 執行 `installer/Grok Build GUI Setup 0.1.0.exe`。
2. 從開始選單開啟 **Grok Build GUI**。
3. 右上角按 **Connect**，連接本機 `C:\Users\111\.grok\bin\grok.exe`。

程式沿用既有 GROK 登入與 session，不會要求重新輸入憑證。

## 基本操作

- 左側選擇既有 session，或按「新 Session」選擇工作目錄。
- `Enter` 傳送，`Shift+Enter` 換行，`Esc` 取消執行中的回合。
- `Ctrl+F` 搜尋目前對話，`Ctrl+K` 搜尋 session，`Ctrl+Shift+P` 開啟命令面板。
- 向上閱讀時不會被串流強制拉回底部；按「跳到最新」恢復跟隨。
- 工具、reasoning、plan、subagent 和背景 task 都能獨立展開。
- 權限請求只顯示 GROK ACP 當次實際提供的合法選項。

## 附件

本機 GROK 0.2.93 的 ACP handshake 回報 `image=false`。用迴紋針選擇圖片時，GUI 會插入絕對路徑，不會偽裝成可用的圖片內容區塊。未來 CLI 宣告圖片能力後，GUI 會自動切換為原生 image block。

## TUI 出口

Compact、Rewind、Plugins、MCP、Memory 等尚無穩定結構化 ACP 介面的功能，請按 session 標題列的終端圖示，在 Windows Terminal 中開啟真正的 GROK TUI。GUI 不模擬終端按鍵。

## 設定與資料

- 設定頁可調整主題、字級、行高、內容寬度和快捷鍵。
- GUI 只保存介面偏好；對話仍由 GROK session 儲存。
- GUI 不讀取 `~/.grok/auth.json`，不修改 `~/.grok/config.toml`，也不自行升級 GROK。
