# Grok Build GUI — agent notes

狀態（2026-07-12，v0.3.2 已發布）：官方 OAuth 重新登入、確認後一鍵安裝 Grok CLI、真實產品額度列已完成；第三輪終審後推上 GitHub（repo + Release，見下方終審紀錄）。全套測試、live CLI、UI/a11y smoke、打包實跑皆通過；installer 仍為未簽章測試版。

狀態補充（2026-07-12）：啟動／連線競態、快捷鍵、Esc 優先序、prompt 失敗復原、額度提醒、task 合併與視窗導覽已完成審查加固。

**下一輪升級 backlog（2026-07-15，僅記錄未實作）**：`docs/backlog/2026-07-15-next-upgrade.md`  
P0 側欄主頁無法重開、composer 固定高度；P1 專案標題層級、批次刪除；P2 ACP 貼圖／多模態（本機 0.2.101 實測 `image:false`/`audio:false`/`embeddedContext:true`）。

## 發布前第二輪複審（2026-07-12，Claude 雙 agent 對抗式審查）

- 修正 24 項:IME isComposing 防護（composer/改名/命令面板/全域鍵盤）、send() 對已銷毀視窗防護＋closed 清 null、electron-store clearInvalidConfig（settings.json 損壞不再變磚）、loadSession 重入鎖＋過期回應防護、formatDate 壞日期防白屏、Virtuoso computeItemKey=event.id（reducer 合併保留原 id）、回合結束/斷線清 pending 權限 modal、切 session 重置 followTail/unread、connect() caps 合併不再清空 commands/mode、load/create 回應的 modes 套用、EventCard memo＋搜尋計數 useMemo、靜態星空 resize 重繪、WebGL context lost/restored 處理、星空時間精度 wrap、respondPermission 先驗證再刪、export/usage sessionId 驗證、打包版忽略 ELECTRON_RENDERER_URL、asar 排除 node_modules（-49MB）、退出時停掉連線中 client、附件圖 20MB 上限、刪除運行中 session 先取消、ModelPicker 空清單防護、setMode/export/setModel 失敗回饋、SettingsPanel 儲存合併 live drafts。測試 83→85。
- **已知限制（未修，勿當 bug 重查）**:ACP SDK 1.2.1 的 zSessionUpdate 是封閉 union,`subagent_spawned`/`task_backgrounded`/`session_recap`/`retry_state`/`auto_compact_completed`/`turn_completed` 等自訂 update 會在 SDK 層被 parse-fail 丟棄,event-adapter 對應 case 實際收不到（已用 memory-stream 實驗證實）。turn 完成不受影響（走 prompt response 的 stopReason）。要修得攔原始 notification 或換 SDK 版本——排入下一功能輪。
- grok CLI 在 stdin EOF 後是否自行退出未驗證;quit 中斷連線可能短暫留孤兒程序（已在 window-all-closed 停掉 connecting client 降低機率）。

## 發布前終審（第三輪，2026-07-12，Claude；審 GPT 的 0.3.2 功能 commit 0b71350）

- **審查結論**：grok-lifecycle 模組（安裝/OAuth/互斥閘）、SingleLifecycleOperation、QuotaRings 固定三產品列、focus trap、notices 產生器、README/SHARE-MESSAGE 誠實揭露——全部通過。外部事實已實測：`https://x.ai/cli/install.ps1` HTTP 200（text/plain 12KB）、`grok login --oauth` 為 0.2.93 真實旗標。
- **終審修正 4 項**（commit 隨附）：
  1. `acp-client` 快取 capabilities 即時同步（`setModel`/`setMode`/`session new+load` 回寫 modelState、currentModeId）。原因：`start()` 對活連線是冪等回快取，renderer 又改成全量替換（GPT 為了「空清單要能取代舊值」），已連線時再點 Connected 藥丸會把 UI 模型顯示重設回 initialize 預設值。主程序當唯一真相源，兩邊需求同時滿足；新增 `tests/acp-capability-sync.test.ts` 鎖行為。
  2. 公開庫隱私：tests 與 work/ui_smoke.py 的 `C:\Users\111`、WORDPRESS-Workspace 個人路徑全數改中性 demo 路徑。
  3. `settings:save` 換執行檔時改走 `disconnectAcp()`（原內聯版漏掉 `acpConnecting = null`），並補發 connected:false 通知讓 UI 立即反映。
  4. a11y：`.event-head em`/`.event-content li small` 亮色主題 contrast 3.0→4.7（#89867d→#6b6759），deep 模式補上原本缺的淺色覆寫——此違規在 axe 是間歇出現（取決於稽核時卡片是否渲染），別當 flaky 忽略。
- **發布動作**：重打 0.3.2 installer（NotSigned 不變）、SHA256SUMS/SBOM/VERIFICATION/SHARE-MESSAGE 同步新雜湊；GitHub repo + Release 上傳 exe＋SHA256SUMS＋SBOM。雜湊以 `outputs/release/SHA256SUMS.txt` 為準，文件不寫死舊值。
- **公開位址**：repo https://github.com/j0988114582-ui/grok-build-control-center ；Release https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.3.2 。push 需要 gh token 有 `workflow` scope（repo 含 CI workflow；已於 2026-07-12 用 device flow 補上）。
- **CI 坑（已修）**：electron-builder 26 在 CI 偵測到環境會隱式觸發 publish、缺 GH_TOKEN 就整跑失敗——package script 必須帶 `--publish never`；workflow 的 SBOM/上傳步驟不可寫死版本檔名（v0.3.0 時代寫死導致 0.3.2 必掛），已改 glob。首兩次 CI run 失敗即此因，修復 commit 之後為準。
- **給 GPT**：宣傳影片若拍到雜湊或 0.3.1 畫面需更新；Release 連結見 README 安裝節。SDK 封閉 union 限制（下一節）仍未動，排功能輪。

## 實測驗證過的 grok CLI (0.2.93) ACP 事實（別重新猜）

- **模型清單**：`session/new` 回應的 `models` 會給完整清單（grok-4.5 含 high/medium/low effort、grok-composer-2.5-fast 無 effort）；`initialize._meta.modelState` 07-11 只回單一 `grok-build`、07-12 已回完整清單——行為不穩定，不可依賴；`session/load` 也不保證帶 models。UI 優先使用 session 回應，connect modelState 只當 fallback。
- **切模型**：`session/set_model` extension method（params: sessionId, modelId, reasoningEffort?）實測可用；標準 `session/set_config_option` 反而 Method not found。
- **Context 與訂閱額度是兩條管線**：grok 不推 `usage_update`；context window 仍讀 `~/.grok/sessions/<url-encoded-cwd>/<sessionId>/signals.json`。週訂閱額度走已實測的 ACP extension `_x.ai/billing`，params `{}`，CLI 自行認證；回應需經 `src/shared/billing.ts` 容錯 normalize，不能讀 `auth.json`。
- **刪除對話**：`grok sessions delete <id>`，非互動、無 --force、成功印 `Deleted session <id>`。GUI 走這個 CLI，不自己 rm 目錄。
- **initialize `_meta.availableCommands`** 有 slash 命令清單（compact/context/session-info…），可直接餵 command palette。
- **帳號**：CLI 0.2.93 只有 `grok login` / `grok logout`，沒有 `whoami`、帳號清單或 profiles；GUI 的「切換帳號」只跑 `grok login --oauth` 並重建 ACP，不保存或讀取憑證。
- **首次安裝**：一般使用者只需要 Grok CLI，不需要 Node；Windows Terminal 僅是 TUI fallback。官方 PowerShell installer URL 是 `https://x.ai/cli/install.ps1`，GUI 必須先明確確認再下載執行，並以 `grok --version` 驗證。
- **產品額度**：`productUsage` 可能是空陣列；Build/Imagine/API 無資料時顯示 `—`，不得用 fixture、總額度或 0% 代替。

## 驗證流程

- `npm test`＋ `npm run lint` ＋ `npm run typecheck`（測試數以當次輸出為準，不在本檔寫死）。
- 免額度 live 驗證：`node work/live_feature_smoke.mjs`（真 CLI 連線、建 session、切模型、刪 session，不發 prompt）。
- 花額度的完整 smoke：`node work/live_acp_smoke.mjs`（會發 3 個 prompt）。
- UI/a11y：`npm run smoke:ui`（真 Electron、axe serious/critical、會寫含本機路徑的 gitignored 截圖）。
- 打包：`npm run package` → `outputs/installer/Grok-Build-Control-Center-Setup-0.3.2.exe`；目前 `Get-AuthenticodeSignature` 為 `NotSigned`，不可誤稱已簽章。
