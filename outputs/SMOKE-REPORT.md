# Grok Build GUI 0.1.1 全功能冒煙報告

日期：2026-07-11（Asia/Taipei）

## 版本

- GROK Build CLI：`0.2.93 (f00f96316d)`。
- 官方 updater stable：current `0.2.93`、latest `0.2.93`、`updateAvailable=false`。
- GUI：0.1.1。

## PASS

- Audit 0 vulnerabilities、ESLint 0 warnings、TypeScript/build 成功。
- 12 個測試檔、25 個測試通過；10,000 結構化事件低於 2 秒門檻。
- Electron sandbox/preload bridge、session 索引、搜尋、快捷鍵、Markdown、工具／Plan 卡片、設定與權限 modal。
- ACP handshake、session new/load、既有歷史重播、真模型精確回覆、真 shell 工具、取消、session export。
- Model picker：Grok 4.5、Composer 2.5；Grok 4.5 effort metadata 與 `session/set_model` 路徑。
- 圖片 capability=false 時安全降級成絕對路徑。
- 測試建立的 8 個 GROK sessions 已依精確 ID 清除，session 總數由 75 回復為 67。

## 條件式通過

- Permission：UI 與合法 option 驗證通過；live 因全域 always-approve 沒有發 request。
- 圖片：目前 ACP 不支援 image block，路徑降級符合設計。

## TUI fallback

Rename、Compact、Rewind、Fork、Worktree、Plugins、MCP、Memory 沒有 GROK 0.2.93 可用的結構化 ACP method。GUI 提供 TUI 出口，未使用 ANSI 解析或隱藏 slash command。

## 外部環境警告

- `C:\Users\111\.claude\settings.json` 是無效／空白 JSON。
- `meta-ads` MCP 授權失敗。

兩者未阻止 GROK 模型、工具、取消或 session 重播。本輪未跨範圍修改。

## 安裝包

- `Grok Build GUI Setup 0.1.1.exe`
- SHA-256：`FA2A8FE31869196E901E4B716E483FDBA268730EFA167D2857E5B6451003E93A`
- Windows Authenticode：`NotSigned`。請只使用本工作區產出的安裝檔並核對雜湊。
