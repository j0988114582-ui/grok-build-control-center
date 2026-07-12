# Grok Build GUI — agent notes

狀態（2026-07-12，v0.3.1）：weekly billing、銀河背景、游標/語意動效、新手 UX、a11y/效能檢查與 unsigned NSIS installer 已完成；定位為 unofficial Windows control center。

狀態補充（2026-07-12）：啟動／連線競態、快捷鍵、Esc 優先序、prompt 失敗復原、額度提醒、task 合併與視窗導覽已完成審查加固。

## 發布前第二輪複審（2026-07-12，Claude 雙 agent 對抗式審查）

- 修正 24 項:IME isComposing 防護（composer/改名/命令面板/全域鍵盤）、send() 對已銷毀視窗防護＋closed 清 null、electron-store clearInvalidConfig（settings.json 損壞不再變磚）、loadSession 重入鎖＋過期回應防護、formatDate 壞日期防白屏、Virtuoso computeItemKey=event.id（reducer 合併保留原 id）、回合結束/斷線清 pending 權限 modal、切 session 重置 followTail/unread、connect() caps 合併不再清空 commands/mode、load/create 回應的 modes 套用、EventCard memo＋搜尋計數 useMemo、靜態星空 resize 重繪、WebGL context lost/restored 處理、星空時間精度 wrap、respondPermission 先驗證再刪、export/usage sessionId 驗證、打包版忽略 ELECTRON_RENDERER_URL、asar 排除 node_modules（-49MB）、退出時停掉連線中 client、附件圖 20MB 上限、刪除運行中 session 先取消、ModelPicker 空清單防護、setMode/export/setModel 失敗回饋、SettingsPanel 儲存合併 live drafts。測試 83→85。
- **已知限制（未修，勿當 bug 重查）**:ACP SDK 1.2.1 的 zSessionUpdate 是封閉 union,`subagent_spawned`/`task_backgrounded`/`session_recap`/`retry_state`/`auto_compact_completed`/`turn_completed` 等自訂 update 會在 SDK 層被 parse-fail 丟棄,event-adapter 對應 case 實際收不到（已用 memory-stream 實驗證實）。turn 完成不受影響（走 prompt response 的 stopReason）。要修得攔原始 notification 或換 SDK 版本——排入下一功能輪。
- grok CLI 在 stdin EOF 後是否自行退出未驗證;quit 中斷連線可能短暫留孤兒程序（已在 window-all-closed 停掉 connecting client 降低機率）。

## 實測驗證過的 grok CLI (0.2.93) ACP 事實（別重新猜）

- **模型清單**：`session/new` 回應的 `models` 會給完整清單（grok-4.5 含 high/medium/low effort、grok-composer-2.5-fast 無 effort）；2026-07-11 live smoke 中 `initialize._meta.modelState` 只回單一 `grok-build`，`session/load` 也不保證帶 models。UI 優先使用 session 回應，connect modelState 只當 fallback。
- **切模型**：`session/set_model` extension method（params: sessionId, modelId, reasoningEffort?）實測可用；標準 `session/set_config_option` 反而 Method not found。
- **Context 與訂閱額度是兩條管線**：grok 不推 `usage_update`；context window 仍讀 `~/.grok/sessions/<url-encoded-cwd>/<sessionId>/signals.json`。週訂閱額度走已實測的 ACP extension `_x.ai/billing`，params `{}`，CLI 自行認證；回應需經 `src/shared/billing.ts` 容錯 normalize，不能讀 `auth.json`。
- **刪除對話**：`grok sessions delete <id>`，非互動、無 --force、成功印 `Deleted session <id>`。GUI 走這個 CLI，不自己 rm 目錄。
- **initialize `_meta.availableCommands`** 有 slash 命令清單（compact/context/session-info…），可直接餵 command palette。

## 驗證流程

- `npm test`（82 tests）＋ `npm run lint` ＋ `npm run typecheck`。
- 免額度 live 驗證：`node work/live_feature_smoke.mjs`（真 CLI 連線、建 session、切模型、刪 session，不發 prompt）。
- 花額度的完整 smoke：`node work/live_acp_smoke.mjs`（會發 3 個 prompt）。
- UI/a11y：`npm run smoke:ui`（真 Electron、axe serious/critical、會寫含本機路徑的 gitignored 截圖）。
- 打包：`npm run package` → `outputs/installer/Grok-Build-Control-Center-Setup-0.3.1.exe`；目前 `Get-AuthenticodeSignature` 為 `NotSigned`，不可誤稱已簽章。
