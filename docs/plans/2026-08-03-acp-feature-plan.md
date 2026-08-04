# Post-CLI-0.2.118 功能更新計畫（ACP 探針實證版）

| 欄位 | 內容 |
| --- | --- |
| **狀態** | **R2／R3 執行中**：Sonnet 5 subagent 實作 · Codex(gpt-5.6-sol) 審查 · Opus 4.8 驗收＋escalation；**R1 延後**（0.2.118 無 ACP 叫用路徑） |
| **日期** | 2026-08-03 |
| **基準** | 桌面 **0.11.0** 已出；本機 Grok CLI 真機實測 **agentVersion 0.2.118** |
| **Repo** | `work/_upstream` |
| **決策來源** | 2026-08-03 對話：Grok 4.5 官方研究（窄範圍＋逐條自驗）＋真機唯讀 ACP 能力探針 |
| **產物** | Grok 研究報告與 ACP 能力面 dump 存於本機暫存（未進版控）；探針腳本 `work/acp_capability_probe.ts` |
| **方法論** | 官方文件 5/5 頁實地驗證；**能力主張一律以真機 ACP 探針為準，非文件推測**。牽涉串流／背景的行為驗收必用真 CLI（假 ACP 一回合只送一則完整訊息）。 |

---

## 0. 決策摘要

| ID | 決策 |
| --- | --- |
| D-THEME | 站主複選四主題：權限智慧化 / 操作安全網 / 額度透明 / 進階整合 |
| D-PROBE | 先做真機 ACP 探針再定案（已完成，見 §1） |
| D-CUT | 探針判「權限智慧化（Auto/Plan）」本版不可行 → 下修（見 §3）；其餘扶正 |
| D-TIER1 | 本版**兩支箭**：**R2 背景任務／Loop 面板**、**R3 Workflows／Goal／Deep-research 入口**；「額度透明」併入 R2。**R1 Rewind 延後**——2026-08-03 探針：0.2.118 無 ACP 叫用路徑（11 個候選方法全 `-32601`、`/rewind` 只在 TUI 不在 ACP `availableCommands`、`cancelRewind` 旗標≠可叫用方法），移至 §4 |
| D-ASSIGN | 執行層面由站主指定對象；本檔為交付規格 |

---

## 1. 探針實證的能力基線（本機 CLI 0.2.118）

| 能力 | ACP 實測證據 | 可達性 |
| --- | --- | --- |
| CLI 版本 | `initialize._meta.agentVersion = 0.2.118` | 實測 |
| 模型／效能 | `grok-4.5`、500k context、effort **high/medium/low** | 實測（效能已上線）|
| 貼圖 | `promptCapabilities.image = false`、`embeddedContext = true` | 證實「存暫存檔＋插絕對路徑」設計正確 |
| MCP | `mcpCapabilities.http = true`、`sse = true` | 可達 |
| Session | `sessionCapabilities.list`、`loadSession = true` | 可達（可取代 shell `grok sessions`）|
| **ACP 廣播命令** | `compact`、`always-approve(on\|off)`、`context`、`session-info`、`plugins(list/reload/trust/add/remove)`、`deep-research`、`workflow(launch/pause/resume/stop/save)`、`goal(objective/--budget/status…)`、`loop([interval] prompt)` | 可達（我方 palette 已吃進 `availableCommands`）|
| **能力旗標** | `cancelRewind`、`sessionRecap`、`voiceMode`、`schedulerBackgroundLoops`、`fs_notify`、`hooks(pre_tool_use/stop/subagent_stop)` | 可達 |
| agent 端工具 | `enter_plan_mode`/`exit_plan_mode`（agent 自驅）、`scheduler_create/delete/list`、`monitor`、`spawn_subagent`、`kill_command_or_subagent`、`get_command_or_subagent_output`、`image_gen/image_edit/image_to_video/reference_to_video` | 供判斷驅動方式 |

---

## 2. Tier 1 任務卡（本版要做）

### R1 — Rewind 回溯（**本版延後**）

> **2026-08-03 探針結論：0.2.118 無 ACP 叫用路徑。** 11 個候選方法（`session/rewind`、`_x.ai/rewind`、`…/checkpoints`…）全回 `-32601 Method not found`；`/rewind`、`/undo` 只在 TUI、不在 ACP `availableCommands`；`cancelRewind: true` 是 TUI 提示、非可叫用方法。無法照原設計接進 GUI，移至 §4 Backlog。價值仍在（GUI 使用者的安全網），待 xAI 把 rewind 搬上 ACP，或改採 GUI 端自製快照再評估。探針腳本：`work/acp_rewind_probe.ts`。

### R2 — 背景任務／Loop／排程面板（進階整合＋額度透明）

| 欄位 | 內容 |
| --- | --- |
| 目標 | 把 CLI 的背景任務、子代理、監視器、定時迴圈變成看得到、可停可查的面板；順帶把 context/turns 透明化。 |
| ACP 證據 | `loop` 命令；`schedulerBackgroundLoops = true`；agent 工具 `scheduler_*`/`monitor`/`spawn_subagent`/`kill_command_or_subagent`/`get_command_or_subagent_output`；`context`、`session-info` 命令。 |
| 做 | 背景任務列表（狀態／種類）、停止、查看輸出；`/loop` 建立定時任務；context 用量與 turns 顯示（沿用 palette 已吃進的 `availableCommands` 通道）。 |
| 不做 | **單回合美金成本**（ACP 未提供）；UI 只顯示 token／turns／context，成本欄比照現有額度環顯示「服務未提供」。 |
| 狀態 | ✅ **已完成並通過審查（2026-08-04）**。Sonnet 實作 → Codex 審（抓到草稿清空 bug＋title 啟發式誤判）→ 依真機 `/loop` 擷取改寫 → 我驗收 → Grok 複審（再修 M1 停止鈕在回合中的一致性＋m2 LOOP badge 誤掛）。423 測試綠。 |
| 已解 | **Q2** 命令叫用＝送 `/cmd` prompt 文字；進度＝`tool_call`/`tool_call_update` 事件（工具真名取自 `_meta["x.ai/tool"].name`）。 |
| 驗收 | 能建立 `/loop` 並在面板看到（模型為 recurring running）、停止＝送 `scheduler_delete` 指示、查輸出；context/turns 正確。**殘留真機 smoke**（併入收斂）：`monitor`/`spawn_subagent`/`workflow` 的 rawOutput 形狀、`scheduler_delete` 中文措辭的真機往返。 |

### R3 — Workflows／Goal／Deep-research 入口（進階整合門面）

| 欄位 | 內容 |
| --- | --- |
| 目標 | 把三個自主能力做成一等入口，讓小白用白話啟動並看進度。 |
| ACP 證據 | `workflow(launch/pause/resume/stop/save)`、`goal(<objective> [--budget <tokens>] / status / pause / resume / clear)`、`deep-research(<query>)` 三命令已廣播。 |
| 做 | 三個入口卡＋參數表單（workflow 名稱、goal 目標＋token 預算、research query）；啟動後把進度／子代理狀態接到 R2 背景面板；pause/resume/stop 控制。 |
| 不做 | 自建 workflow 腳本編輯器（讀既有 saved workflow 即可）；**不碰 MCP OAuth 憑證**（維持 CLI 保管，不存 token）。 |
| 未決 | **Q3：workflow/goal 進度事件走哪個 `session/update` 型別**（與 R2 共用顯示，先探再接）。 |
| 驗收 | 能用 goal 啟一個帶預算的目標並在面板看到狀態；能列出並啟動一個 saved workflow；deep-research 能出報告；真 CLI smoke。 |

---

## 3. 本版「不做」與原因（探針後的誠實下修）

| 項目 | 探針結論 → 為何不做 |
| --- | --- |
| **Auto 權限模式** | ACP **無**分類器 Auto 這個 mode；session 只給 model＋effort，權限只有 `always-approve on\|off`（＝現有 YOLO）。Auto 是 TUI 概念，ACP 端叫不動。待官方把權限模式搬上 ACP 再評估。 |
| **Plan 審批面（a/s/c/q）** | plan mode 由 agent 工具 `enter_plan_mode`/`exit_plan_mode` 自驅；ACP **無** `/plan` 命令、**無** session mode 可主控。日後最多做「被動呈現 agent 產出的計畫」，非本版。 |
| **Sandbox 檔位 / Worktrees** | 只有 `--sandbox` 啟動旗標 / `grok worktree` 子命令，**非 per-session ACP**；需多包一層 spawn 旗標／子命令，成本較高，延後。 |

---

## 4. Backlog（非本版候選）

- **R1 Rewind 回溯**（原 Tier 1，2026-08-03 延後）——0.2.118 無 ACP 叫用路徑（探針：11 方法全 `-32601`、`/rewind` TUI-only、`cancelRewind` 旗標≠方法）。待 xAI 把 rewind 搬上 ACP；或改採 **GUI 端自製快照**（每回合前對 cwd 做 git-stash 式快照＋還原 UI，獨立於 CLI，但較重、需處理大檔／二進位／非 git 目錄）。
- 媒體生成入口（`image_gen`/`image_edit`/`image_to_video`/`reference_to_video`）——我方有預覽台卻無生成入口。
- `voiceMode` 語音輸入。
- 以 ACP `session/list` 取代 shell `grok sessions`（穩定性）。
- hooks 系統整合（deny 規則／pre_tool_use）。
- 多會話 Dashboard（待官方提供 ACP fleet API）。
- Sandbox／Worktree（見 §3，等值得做時再包 spawn 旗標）。

---

## 5. 共通驗收與防呆

| ID | 規則 |
| --- | --- |
| G-TEST | 每項：單元測試＋**真 CLI smoke**；串流／背景行為不得只靠假 ACP 驗。 |
| G-DESTRUCT | 毀滅性動作（R1 還原）一律毀滅性二次確認。 |
| G-PROBE-FIRST | 動 UI 前先用唯讀探針釘住命令叫用／事件型別（§6 三題）。 |
| G-GREEN | 全程 `npm run verify`＋`smoke:ui`（axe）＋`smoke:coldstart` 綠。 |
| G-PRIV | 進 repo 檔案不得含個人絕對路徑／私有 skill 名／主機名／session id。 |

---

## 6. 動工前要釘的未決問題（各一次唯讀探針可解）

| ID | 問題 | 建議 |
| --- | --- | --- |
| Q1 | rewind 的 ACP 觸發方式（method／擴充簽名） | 列為 R1 首個子任務 |
| Q2 | `availableCommands` 的叫用路徑（文字 vs 結構化） | 列為 R2 首個子任務 |
| Q3 | workflow/goal 進度事件走哪個 `session/update` 型別 | 列為 R3 首個子任務 |

> 三題共用既有探針腳本 `work/acp_capability_probe.ts` 擴充即可，不需重寫。
