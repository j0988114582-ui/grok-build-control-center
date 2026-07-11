# Grok Build GUI 驗證紀錄

## 已驗證

- GROK CLI：`grok 0.2.93 (f00f96316d)`。
- ACP handshake：protocol version 1，`loadSession=true`。
- ACP prompt capability：`image=false`，GUI 已實作路徑降級。
- 既有 session 重播：32 user messages、69 agent messages、167 thought chunks、292 tool calls、6 plans。
- Electron preload：sandbox + context isolation 下 bridge 可用。
- 真 Electron UI：讀取 67 個本機 sessions，renderer console/page errors 為 0。
- stable 更新檢查：current/latest 均為 0.2.93，沒有可安裝更新。
- 真模型：精確回覆 `GROK_GUI_LIVE_OK`。
- 真工具：shell 工具完成 5 段狀態更新，回覆包含 `GROK_GUI_TOOL_DONE`。
- 真取消：長時間 shell 工作回傳 cancelled，沒有得到失敗 token。
- 模型擴充：`session/set_model` 可切換同模型與 reasoning effort；提供 Grok 4.5、Composer 2.5。
- 自動測試涵蓋事件正規化、工具巢狀 output、session reducer、權限、快捷鍵、設定、session index、附件能力閘門、模型 metadata、10,000 事件與首頁渲染。

## 明確未執行

- 權限 UI 已用結構化 request 實際點選；因本機 `permission_mode="always-approve"`，真工具沒有發出 permission request，未修改全域設定來強制觸發。
- TUI 出口會開啟可見 Windows Terminal，為避免留下互動程序，最終自動化只驗證按鈕路由，沒有實際啟動新分頁。
- 未修改、刪除或 rewind 任何既有 GROK session。
- 冒煙建立的 8 個專用 sessions 已依精確 ID 刪除；既有 sessions 未動。

## 維護原則

GROK CLI 更新後先跑 `npm test`、`npm run build` 和 ACP handshake。新增事件集中加入 `src/shared/event-adapter.ts`；不要在 React 元件中直接依賴原始 ACP wire shape。
