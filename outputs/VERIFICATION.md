# Grok Build GUI 驗證紀錄

## 已驗證

- GROK CLI：`grok 0.2.93 (f00f96316d)`。
- ACP handshake：protocol version 1，`loadSession=true`。
- ACP prompt capability：`image=false`，GUI 已實作路徑降級。
- 既有 session 重播：32 user messages、69 agent messages、167 thought chunks、292 tool calls、6 plans。
- Electron preload：sandbox + context isolation 下 bridge 可用。
- 真 Electron UI：讀取 67 個本機 sessions，renderer console/page errors 為 0。
- 自動測試涵蓋事件正規化、session reducer、權限、快捷鍵、設定、session index、附件能力閘門與首頁渲染。

## 明確未執行

- 未送出付費模型 prompt；因此新 session 的真模型回覆、工具核准與取消流程尚未做付費 live smoke。
- 未修改、刪除或 rewind 任何既有 GROK session。

## 維護原則

GROK CLI 更新後先跑 `npm test`、`npm run build` 和 ACP handshake。新增事件集中加入 `src/shared/event-adapter.ts`；不要在 React 元件中直接依賴原始 ACP wire shape。
