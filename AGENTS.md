# Grok Build GUI — agent notes

狀態（2026-07-11，v0.3.0）：weekly billing、銀河背景、游標/語意動效、新手 UX、a11y/效能檢查與 unsigned NSIS installer 已完成；定位為 unofficial Windows control center。

## 實測驗證過的 grok CLI (0.2.93) ACP 事實（別重新猜）

- **模型清單**：`session/new` 回應的 `models` 會給完整清單（grok-4.5 含 high/medium/low effort、grok-composer-2.5-fast 無 effort）；2026-07-11 live smoke 中 `initialize._meta.modelState` 只回單一 `grok-build`，`session/load` 也不保證帶 models。UI 優先使用 session 回應，connect modelState 只當 fallback。
- **切模型**：`session/set_model` extension method（params: sessionId, modelId, reasoningEffort?）實測可用；標準 `session/set_config_option` 反而 Method not found。
- **Context 與訂閱額度是兩條管線**：grok 不推 `usage_update`；context window 仍讀 `~/.grok/sessions/<url-encoded-cwd>/<sessionId>/signals.json`。週訂閱額度走已實測的 ACP extension `_x.ai/billing`，params `{}`，CLI 自行認證；回應需經 `src/shared/billing.ts` 容錯 normalize，不能讀 `auth.json`。
- **刪除對話**：`grok sessions delete <id>`，非互動、無 --force、成功印 `Deleted session <id>`。GUI 走這個 CLI，不自己 rm 目錄。
- **initialize `_meta.availableCommands`** 有 slash 命令清單（compact/context/session-info…），可直接餵 command palette。

## 驗證流程

- `npm test`（64 tests）＋ `npm run lint` ＋ `npm run typecheck`。
- 免額度 live 驗證：`node work/live_feature_smoke.mjs`（真 CLI 連線、建 session、切模型、刪 session，不發 prompt）。
- 花額度的完整 smoke：`node work/live_acp_smoke.mjs`（會發 3 個 prompt）。
- UI/a11y：`npm run smoke:ui`（真 Electron、axe serious/critical、會寫含本機路徑的 gitignored 截圖）。
- 打包：`npm run package` → `outputs/installer/Grok-Build-Control-Center-Setup-0.3.0.exe`；目前 `Get-AuthenticodeSignature` 為 `NotSigned`，不可誤稱已簽章。
