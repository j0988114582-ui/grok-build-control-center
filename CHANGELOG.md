# Changelog

All notable user-visible changes to Grok Build Control Center are documented here.

The format follows Keep a Changelog principles and the project uses semantic versioning where practical.

## [Unreleased]

### Added

- **側欄「僅顯示活躍的對話」**：資料夾篩選下方新增核取方塊，只列出最後活動在 N 天內的對話（**N 預設 4 天**，設定頁「側欄對話」區可調 1–30 天）。**預設關閉**，開關與天數都寫進 `settings.json`，重開程式仍記得。就算超過天數，**目前開啟的對話、已釘選、Agents Team 槽一律保留**，不會發生「篩選把自己正在看的對話藏起來」。搜尋、資料夾篩選與多選刪除都作用在篩完之後的清單；標題列數字改成 `31 · 活躍 4 天`（未開啟時維持原本的純數字），資料夾下拉的「全部資料夾」也跟著算篩選後的數量，不會出現「全部資料夾（245）」配「31」的落差。這是**檢視**功能，不會刪除任何對話——「建議清理」名單仍看全部 session、仍用既有的 10 天規則，兩個數字互不影響。

### Changed

- **功能矩陣誠實度（CLI 1.0.3 探針）**：Compact 與 Rewind 拆開——Compact 為官方通知＋推斷卡片；Rewind 為 `_x.ai/rewind/points` 可查詢、GUI 尚未接上（無底線的 `x.ai/rewind/points` 回 `-32601`，未呼叫 execute）。Subagents 改為部分原生（派出／完成可見，無 ACP 控制台）；`_x.ai/subagent/list_running`／`get` 可呼叫，官方無底線形式回 `-32601`。`/loop` 在 session 的 `available_commands_update` 有廣播（initialize 清單沒有），既有能力閘門維持不變。本波未實作 Rewind UI 或子代理 ACP 控制台。
- **背景任務面板**：活動清單改到上方；建立定時任務／自主任務預設收合。
- **對話流**：不再顯示 Commands／模式／用量列；`session_info_update` 改為靜默，不再變成 Unsupported Grok event。
- **Toast**：改到標題列右下，不再擋住插話／排隊／立刻改做／停止。
- **側欄清理**：建議清理改為次要文字按鈕，建議面板仍預設關閉。
- **命令面板**：常見 slash 命令說明改為繁中，未知命令保留官方英文。

### Fixed

- **插話**：接受 CLI 1.0.3 `ExtMethodResult` 包層（`{ result: { status: "queued" } }`），成功後清草稿、顯示「已排入」並在對話留下 `YOU · 插話`；官方 `_x.ai/session/interjection` 回聲以 `interjectionId` 去重，不再併進上一則使用者提示。使用者錯誤改為繁中並去掉 Electron IPC 前綴；method-not-found 仍只提示更新 CLI，絕不改走取消。
- **子代理**：`spawn_subagent` 完成只代表衍生握手，面板改顯示「執行中」；raw tee 轉送 `_x.ai/session_notification` 的 `subagent_spawned`／`subagent_finished`（`child_session_id`）。`get_command_or_subagent_output` 仍不自成卡片，但會把匹配的 `TaskOutput` 狀態與輸出寫回同一張子代理卡。

### Added

- GitHub Actions quality checks and Windows UI smoke evidence.
- Structured bug, feature, and beta feedback forms.
- Pull request validation and risk-review checklist.
- Public roadmap, beta testing guide, support guidance, and release metrics script.

## [0.13.0] - 2026-08-13（Grok 4.6 · 對話閱讀位置）

### Changed — 最新 Grok 相容性

- 依 [Grok 4.6 官方公告](https://x.ai/news/grok-4-6)與[官方模型規格](https://docs.x.ai/developers/grok-4-6)，以 Grok Build CLI `1.0.3` 的即時 ACP 模型清單驗證 GUI；帳號目前提供 `grok-4.6`（預設）與 `grok-4.5`，Grok 4.6 的 500k context 與 `xhigh`／`high`／`medium`／`low` 推理強度可由既有模型選單完整呈現。
- live CLI smoke 改為先切到 Grok 4.5、再切回 Grok 4.6；不再把已不在目前帳號模型清單中的 Composer 2.5 當成驗收條件。
- 設定頁更新說明改用官方 `grok update`，仍保留首次安裝的官方 PowerShell 來源。

### Fixed — 修正

- **對話回看不再一直跳回「Reasoning／Grok 正在工作」**：往上滾動會同步鎖定閱讀位置，不再等待 160ms；串流內容高度變動造成的暫時到底訊號也不能取消這個使用者意圖。
- 滾輪、觸控、捲軸拖曳、Page Up／Home／方向鍵與對話書籤共用相同的閱讀暫停規則；使用者往下回到底部或按「跳到最新」時才恢復自動跟隨。

### 驗證

- 67 個測試檔、441 項自動測試、ESLint、TypeScript 與 production build 全部通過。
- 真實官方 CLI 驗證：`grok 1.0.3` stable、`grok update --check` 無可用更新；ACP 即時清單預設為 Grok 4.6，並可由 GUI 切到 Grok 4.5 再切回 4.6；[1.0.3 新增的 `/session-info`](https://x.ai/build/changelog)也會出現在 GUI 命令面板，全程不送出 prompt。
- 真實 Electron 與正式 `win-unpacked` 程式各跑一次長對話滾動測試：滑鼠往上滾後連續加入 14 段 Reasoning，閱讀位置保持不動；按「跳到最新」後才回到底部，renderer console 無錯誤。
- Windows x64 NSIS 安裝檔成功產出；目前仍未程式碼簽章，需以 SHA-256 核對。

## [0.12.0] - 2026-08-04（背景任務面板 · 自主任務入口）

### Added — 新功能

- **背景任務／Loop 面板**：新面板彙整這個對話的排程迴圈、監視器、子代理與背景指令（沿用既有的 tool_call／subagent／task 通知，非新的 ACP 呼叫），並可一鍵**建立定時任務**（`/loop`）。排程迴圈以送出 `scheduler_delete` 指示停止——`session/cancel` 停不掉已分離的迴圈，面板文案已明說；無可靠個別終止方式的項目不提供假的停止鍵。順帶顯示 Context／回合數／工具呼叫用量（單回合成本服務未提供，照實顯示「—」）。
- **自主任務入口**：同一面板新增 Workflow（`/workflow`）、Goal（`/goal`，可帶 `--budget`）、深度研究（`/deep-research`）三個一等入口卡，各含啟動表單、指令預覽、管理指令（暫停／繼續／停止／狀態／清除）與能力偵測（CLI 未廣播該命令時停用並說明）。進度沿用既有的工具卡與對話流顯示。

### 行為 / 誠實界線

- 面板送出的所有指令都走**不動主輸入框草稿與附件**的專用路徑，成功或失敗都不會清掉或蓋掉你正在打的字。
- 面板只負責啟動與送出管理指令，不追蹤個別執行狀態；工作流即時分階段檢視、以及 goal/workflow 大規模 fan-out 的專屬顯示列為後續項目。

### 驗證

- 439 項自動測試、ESLint、TypeScript、建置全綠。
- 真機驗證：對本機 Grok CLI 實跑 `/loop`（scheduler_create／scheduler_delete）、`/goal --budget`、`/deep-research`、`/workflow`，確認命令經 prompt 觸發、事件形狀與清理皆正確。
- 審查鏈：Sonnet／Grok 實作 → Codex／Grok 獨立審查 → 逐條 grep 驗證 → 真機 smoke。

## [0.11.0] - 2026-07-25（捲動、書籤與遙控加固）

### Added — 新功能

- **對話書籤**：對話窗左上角新增書籤按鈕，列出你在這個對話裡發出過的每一則指令（新到舊、附序號），點一下就跳回去，不用再無限往上滾。跳過去之後會停在那裡，不會被新訊息拉回最新。
- **收合輸入框**：草稿有多行時，狀態列會出現「收合輸入框」，一鍵縮回預設高度先看對話，再展開繼續打。

### Changed — 行為調整

- **輸入框高度不再卡在半個畫面**：上限改為依實際可用空間計算，長指令可以一路長到對話區剩下最低高度為止（原本固定 50vh）。
- **上下文壓縮提示看得見了**：壓縮卡片改為金色左軌＋金色底、專用圖示、預設展開，標題直接寫出壓縮前後的 token 數，並同步跳出提示訊息。手機遙控端顯示相同文字。

### Fixed — 修正

- **輸入框變高時最新訊息被蓋住**：輸入框長高會壓縮對話區，但捲動位置不動，最後一段訊息就被蓋在輸入框後面，而且連「跳到最新」都不會出現。現在版面一變動就會重新貼齊底部。
- **視窗縮放後「跳到最新」按鈕不消失**：明明已經在最新訊息，按鈕卻還留著。改為只在真的往上捲時才顯示。
- **進入對話保證停在最新訊息**：不再依賴載入時序的競爭結果。
- **書籤跳轉在長對話落錯位置**：改為在列表尺寸穩定後再對齊一次。

### Security — 手機遙控加固

- 配對 PIN 改用密碼學安全亂數產生（原本用 `Math.random()`）。
- 修正未選定對話時，`/api/snapshot` 會把**所有**對話的權限請求標題送給已配對手機的問題。
- 錯誤的配對密鑰不再累計鎖定次數——原本任何人只要有隧道網址，丟五次無效請求就能讓你的手機配不上線。
- 未認證的 `/api/status` 加上流量限制，且不再於每次呼叫時掃描本機對話清單。
- 插話與排隊套用與提示相同的長度上限；取消與排隊加上流量限制。
- 靜態檔案路徑改為明確收斂在網頁根目錄內，並擋掉 Windows 磁碟機代號、UNC、裝置路徑與資料流等寫法。
- 畸形 Cookie 不再造成伺服器錯誤。
- 移除兩個從未被使用的 IPC 通道，縮小暴露面。

## [0.10.0] - 2026-07-21（Obsidian Voyage 視覺總改版）

### Fixed — 開機就看得到的問題

- **冷啟動不再卡在灰白畫面**：開場動畫改為由暗漸現的「曲速抵達」（不再有大面積淡藍白閃光），畫面停格的最壞情況也是深色。
- **放大／縮放視窗不再變灰白**：部分顯示卡會在重配大緩衝區時丟失 WebGL context，而失效的畫布在某些 Windows 驅動下會被合成成白色雜訊。現在 context 一失效立即隱藏畫布（露出 CSS 星空底），每 4 秒重建一次（永不放棄，且每次都配全新畫布元素），連續三次失敗則永久降級到不會失去 context 的 Canvas2D 引擎。
- **切換主題後星空正常運作**：`loseContext()` 會永久毒化該 `<canvas>`，舊版重建時沿用同一元素只會拿回死掉的 context——主題切換、resize 復原、watchdog 自癒、Canvas2D 降級四條路徑因此全部失效。引擎生命週期現在綁定 `<canvas>` key。

### Added / Changed — 視覺

- **深色「Obsidian Voyage」**：香檳金屬漸層按鈕與鍍邊、玻璃質感面板與 pills、金色 hairline 焦點環、對話列表選中金條、細金捲軸；雙色帶星雲（冰藍＋香檳金）、5 層視差星深、金色星點、偶發流星。模糊效果控制在 3 個大面，側欄與預覽台改純色以提升對比與效能。
- **亮色「晨光星雲 Dawn Nebula」**：暖白晨霧底、墨藍字（正文對比 13–17:1）、金色依用途分為文字／邊框／填色三階；**亮色現在也有專屬星空**（晨霧微塵＋金色晨光暈，數學上不可能過曝）。
- **歡迎頁 3D 曜石稜鏡**：three.js／R3F 即時渲染，物理材質＋程序化棚燈反射；不支援 WebGL、減少動態或亮色時自動降級為平面裝飾。
- **全新程式圖示「曲速艦首」**：黑曜燕尾稜鏡＋香檳金稜線＋冰藍曲速尾流，16–256px 全尺寸；標題列標誌同步更新。
- **手機遙控頁同語言**：珠寶盒質感 PIN 鍵盤、金屬按鈕、金色 hairline 權限卡、你／Grok 以冰藍／金色左緣區分。

### Fixed — 發行前互動審查（真實操作、真實 Grok 對話）

- **手機端不再把回覆切成碎片**：Grok 逐塊串流回覆，桌面會合併成一則、手機卻每塊各自成泡泡，長回覆更會擠爆傳輸上限而丟失前文。遠端改為比照桌面合併同角色連續訊息。
- **工具權限選單可用且看得懂**：新增「工具權限」標籤；忙碌時不再靜默停用（Chromium 對停用控制項不顯示提示），改為變淡但可點並說明原因。
- **通知不再擋住按鈕**：改為 `pointer-events: none`（自身按鈕除外）並於 12 秒自動消失。
- **隧道錯誤訊息對症下藥**：區分「找不到 cloudflared」與「隧道已啟動但公網暫時連不上」，後者提示稍候重試；同時移除外洩的 IPC 技術前綴。
- 設定頁移除過時說明（亮色已有星空）、設定頁新增前往手機遙控的入口、手機端在無可用模型／工作模式時改為說明而非要求輸入代號。

### 驗證

352 項自動測試、ESLint、TypeScript、建置、axe 無障礙（三種畫面狀態 0 項 serious/critical）全綠；另有冷啟動、亮色主題、視窗放大、遠端 tail 與真 Cloudflare 隧道端對端等實機煙霧測試。

## [0.9.0] - 2026-07-17（可作業遙控 · **Remote 仍實驗**）

### Review hardening（2026-07-19，Fable 5 兩輪對抗式審查後併入）

- 修復：手機 12,000 字 CJK 提示被 32KB body 上限誤拒；`/api/prompt` 改 **accepted-then-run**（200＝已受理，隧道 ~100 秒逾時不再誤報失敗）；權限卡桌面⇄手機三向同步；執行中禁止切換 YOLO（與桌面防呆一致）；手機登出桌面同步顯示過期；桌面失聯時手機顯示「連線中斷」；快照未變不重繪 DOM（不閃爍、不中斷選字）；模型／工作模式改下拉選單（effort 連動、手動備援）；「立刻改做」競態、樂觀 session 10 分鐘 TTL、刪除對話的遙控端清理、手機側操作納入 lifecycle 互斥。
- 驗證：新增真 cloudflared 隧道＋Playwright 模擬手機 E2E（`npm run smoke:remote-e2e`，23 檢查全過）；348 測試／lint／typecheck／build／axe 全綠。
- 報告：`docs/plans/v090-claude-fable5-review-report.md`。

### Added / Changed

- **可作業遙控契約（單人高風險）**：72h 絕對連線、不因閒置斷線；App 重開記憶體清空必重配對。
- **Remote 與 YOLO 可並用**：手機開 YOLO 需 PIN；可只關 YOLO 保留遙控；模式切換不撤銷 remote cookie。
- **手機 SPA**：PIN 鍵盤、session 列表／焦點、T1 transcript、插話／立刻改做／排隊、model／mode、cwd 聯集新建、切斷二次確認。
- **桌面 Remote 面板**：本機 `qrcode`、複製配對 URL、中文狀態／72h／書籤文案。
- **main 經紀**：focus→ready 載入、單槽 queue（桌面／手機最後寫入者勝）、YOLO 重連後恢復 focus。
- 計畫：`docs/plans/2026-07-17-v0.9.0-remote-workable-fullaccess-plan.md`（Fable 5 GO）
- 4G 手測清單：`docs/plans/v090-4g-remote-handtest-checklist.md`（**本環境未完成真 4G**）

### Security（誠實聲明）

- 單人自用；Quick Tunnel **實驗**、書籤 URL 常變更；Cloudflare 可處理 HTTP 內容。
- 手機遺失且已 YOLO → 至多 72h 高權限風險；桌面切斷為 kill switch。
- **真 4G 手測未完成前，不得宣稱「0.9 遠端完成」**；Remote 預設關、標實驗。
- Installer：`outputs/installer/Grok-Build-Control-Center-Setup-0.9.0.exe`（**NotSigned**）。

## [0.8.0] - 2026-07-17

### Added

- **語意文字 token（P-VIS）**：paper / dark-panel 正文與 meta 分離；Team 長路徑可讀；深色卡片不再整塊死灰。
- **額度環（P-QUOTA）**：無分項資料時隱藏 Build／Imagine／API 環，保留總額度。
- **權限 notice + YOLO↔Remote 互斥**：已是「每次詢問」再選有說明；Remote 與 YOLO 不可同時啟用。
- **預覽關閉目前項目（P-CLOSE）**：清 active／idle；Esc 順序：燈箱 → modal → 清 Preview 項目 → cancelTurn。
- **拖放任意本機檔／資料夾（P-DRAG）**：多 path chips；絕對路徑；image capability 時附件去重。
- **Composer 自動長高**：主輸入整塊 max 50vh；Team 另套 min(120px, 28% pane)。
- **Session 治理**：完整 cwd 篩選；10 天活動／釘選／Team 保護；建議清理區（更亮按鈕）；不自動刪。
- **手機 QR 遙控（實驗）**：本機 `127.0.0.1` HTTP + 可選 Quick Tunnel；fragment 配對；HttpOnly cookie；物件級權限綁定；SPA + CSP。

### Security / Privacy

- Remote 預設關；不開機自啟；配對 PIN 僅記憶體；DTO 精簡（session 列表預設無 cwd）。
- 誠實隱私：Cloudflare 終止訪客 TLS，技術上可處理 HTTP 內容。
- Quick Tunnel = **Experimental / best-effort**（無 SLA；polling 非 SSE）。
- **4G 真實手測**：見 `docs/plans/v080-4g-remote-handtest-checklist.md`。本實作環境**未完成真 4G**，Remote 以 **Experimental** 出貨（預設關）；產品 Codex 審為 Request-changes / Remote NO-GO（見 `docs/plans/v080-codex-fullaccess-review.md`）。桌面 UX/session 功能可獨立使用。
- cloudflared **未釘版本 checksum 自動下載**；Quick Tunnel 僅在本機已安裝 cloudflared 時嘗試，失敗不阻斷桌面功能。

### Notes

- 計畫：`docs/plans/2026-07-17-v0.8.0-ux-session-remote-plan.md`
- Codex 計畫審：`docs/plans/v080-plan-codex-review.md`
- Codex 產品審：`docs/plans/v080-codex-fullaccess-review.md`（Remote NO-GO；桌面需關注 path-chip / hygiene 文案等 P1）
- Installer：`outputs/installer/Grok-Build-Control-Center-Setup-0.8.0.exe`（NotSigned）
- Codex 產品審：`docs/plans/v080-codex-fullaccess-review.md` — **Remote NO-GO** until 4G hand-test + remaining R-SEC items; **desktop path ships**.
- Installer：**NotSigned**（`outputs/installer/Grok-Build-Control-Center-Setup-0.8.0.exe`）。
- cloudflared：**未完整**版本+checksum 釘選（R-SEC-20 部分）；Quick Tunnel 僅實驗路徑，不接受 renderer 任意執行檔路徑。

## [0.7.0] - 2026-07-16

### Added

- **Preview Dock（右側可收合預覽台）**：圖片／影片／HTML（srcdoc）／程式碼四種預覽。
- **自動發現**：對話完成時掃描路徑、Markdown 圖、code fence；清單上限 50。
- **`grok-preview://` protocol**：影片與 >8MB 圖；HTTP Range seek；≤8MB 圖 base64。
- **強制 multi-root allowlist**：session cwd／paste tmp／dialog 選檔。
- **CSP P-SEC-6**：`img-src` 含 data/grok-preview/https；`media-src` 含 grok-preview。
- **隱私鐵則**：transcript 永不自動載遠端圖（chip 點擊後才在 Dock 載入）。
- **HTML 安全**：預設無腳本；「允許腳本」逐檔逐次不持久化；永不 same-origin+scripts。
- **快捷鍵** `Ctrl+Shift+V`（`togglePreview` ∈ DEFAULT_SHORTCUTS）。
- **設定**：自動預覽最新媒體、HTML 進階按鈕、圖／影片 MB 上限。
- **smoke:preview** + 對抗單元測試 + RTL（Escape 燈箱、sandbox、遠端圖）。

### Notes

- 計畫：`docs/plans/2026-07-16-preview-pane-full-plan.md`
- Fable 審查：`docs/plans/2026-07-16-preview-pane-full-plan-FABLE5-REVIEW.md`
- 本版不做 HTML 同目錄資源解析；不做 data: 內嵌影片。

## [0.6.1] - 2026-07-16

### Added

- **T5 readiness**：ACP connection generation；create/load 後才可送訊；handler + UI 雙重閘門。
- **T6 team reconnect**：權限重連保 slots／active／focus。
- **F1** 匯出後 `revealExport`（僅 allowlist 絕對路徑）。
- **F2** 跨專案搜尋（title／本地標題／cwd／draft haystack）。
- **F3** 有界 session capability 矩陣（功能抽屜）。
- **T1** Agents Team 格內 Prompt 範本。
- Galaxy token／拖放區視覺微調（AGY）。

### Notes

- 計畫：`docs/plans/2026-07-16-v0.6.1-one-shot-completion.md`
- T4 重疊 live smoke：見 `docs/plans/v061-t4-live-smoke.md`（手冊／結果欄）
- 視覺對齊：`docs/plans/v061-agy-alignment-checklist.md`（部分 partial 已知）

## [0.6.0] - 2026-07-16

### Added

- **Agents Team**：多 session 並排（最多 3 格），每格獨立 draft／插話／立刻改做／停止。
- **L2 Status Orb**：titlebar 程序化狀態球（R3F + drei；jsdom/無 WebGL 時 canvas fallback）。
- **Prompt 範本**：composer 開場白 chips（審查／修錯／解釋／計畫／測試）。
- 銀河座艙文案與 team 側欄控制；匯出成功提示含路徑。

### Changed

- 版本 **0.6.0** 合併原 0.5.2 功能波次與 0.6 視覺（Style A Galaxy L1+L2）。
- 依賴：`three`、`@react-three/fiber`、`@react-three/drei`。

### Notes

- L3 角色 glTF、fork 官方 harness、假多模態仍不做。
- 計畫權威：`docs/plans/2026-07-16-v0.6-mega-upgrade.md`。

## [0.5.1] - 2026-07-16

### Added

- **F-MED-2**: path chip optional thumbnail preview for paste/drag-drop images.
- **F-INT-4**: local **排隊下一輪** (client-side next-turn queue). Official research has no `x.ai/queue/*` prompt API; drains via `session/prompt` when the turn ends.
- **F-RT-4**: Chinese session mode labels（計畫模式／執行模式…）and 工作模式 control copy.
- **F-RT-5**: command palette consumes full `availableCommands` (name, description, `inputHint`).
- **F-UX-1**: OS notification on turn complete when the main window is not focused.
- **F-TOOL-3**: settings CLI update hint (official install script).
- Interject / process-kill manual smoke checklist in `BETA_TESTING.md`.

### Changed

- Quit path **awaits** process-tree kill (`before-quit`) so grok children are less likely to orphan.
- `GrokAcpClient.stop()` is async and awaits `killProcessTree`.

### Notes

- Heavy items slipped to **0.5.2**: multi-session side-by-side (F-SES-2), deep session admin (`x.ai/session/*`), headless side jobs, inspect panel, prompt templates.
- No official `x.ai/queue/*` wrapper — local queue only (documented above).

## [0.5.0] - 2026-07-16

### Added

- Mid-turn **插話** via ACP `_x.ai/interject` (never cancels the active turn); status copy「已排入，下一個安全點生效」.
- **立刻改做** control: `session/cancel` then a fresh `session/prompt` (separate from interject).
- Composer stays usable while a turn is `running` (type, paste, drag-drop, interject).
- Unified weekly quota notice when Build／Imagine（Image）／API product breakdown is absent (not a read failure).
- Windows process-tree termination on disconnect/quit/executable swap (`taskkill /PID /T /F`).
- Spawn env `GROK_CLIENT_VERSION` set to the app version.
- Drag-and-drop images into the composer use the same paste → temp path pipeline; path chip retained.

### Changed

- Context window pill is explicitly labeled **Context** and separated from subscription quota rings.
- Quota popover header wording clarifies 訂閱週額度 vs session context.

### Notes

- Session cancel remains ACP-level and does **not** kill the grok process tree.

## [0.4.1] - 2026-07-16

### Added

- Clipboard paste fallback when ACP does not advertise image support: save to `%TEMP%\grok-build-gui-paste\` and insert the absolute path into the draft (path chip + notice; no auto “請讀取此圖” phrase).
- Pre-decode paste size gate, optional magic-byte check, and automatic cleanup of paste files older than 7 days (on save and app start).
- UI regression locks for permission-mode busy states, YOLO confirm, pin group, batch delete, sidebar reopen, and paste-path behavior.

### Changed

- Permission-mode select also disables while a session is loading (React state, not only a ref).
- Composer busy copy distinguishes an active turn from lifecycle/session-loading busy.
- Session multi-select checkbox is no longer nested inside the session open button (valid HTML).

### Fixed

- YOLO confirm button is disabled while the mode switch is in flight to prevent double-submit.
- Permission-mode tooltips distinguish “stop the turn” vs “system busy”.

## [0.4.0] - 2026-07-16

### Added

- Global pinned sessions group at the top of the sidebar (local preference only).
- Multi-select batch delete with per-item success/failure summary (`grok sessions delete`).
- Runtime tool-permission mode control: ask every time (default) or always-approve (YOLO) via `grok agent --always-approve`.
- Sidebar toggle shortcut (`Ctrl+B` by default) and a collapsed rail expand control that works on the home empty state.
- Automatic cleanup of orphan local titles, drafts, and pins when sessions disappear or are deleted.

### Changed

- Project group titles are larger and clearer; session titles are visually secondary.
- Composer height is fixed with internal scrolling so long drafts no longer steal transcript space.
- YOLO mode always starts as “ask every time” on each app launch (not persisted) and requires a confirmation dialog plus a persistent warning banner.

### Fixed

- Collapsing the sidebar on the home screen left no way to reopen it.
- Permission-mode select is disabled while a turn or lifecycle is busy, so reconnect cannot silently kill the active turn.
- Batch/single delete confirmation closes before the delete loop, with a re-entry lock against double-submit.

## [0.3.2] - 2026-07-12

### Added

- Traditional Chinese-first README with an English appendix.
- Weekly quota summaries for Total, Build, Imagine, and API without fabricating unavailable values.
- Confirmed first-time Grok CLI installation flow using xAI's documented Windows installer source.
- Browser-based account reauthentication, project-grouped sessions, search, Markdown export, persistent drafts, command palette, model picker, and accessibility controls.

### Changed

- Clarified unsigned community-build status, checksum verification, privacy boundaries, and reproducible build instructions.

### Fixed

- Release audit issues involving cached capability truthfulness, fixture privacy, accessibility contrast, IME behavior, shutdown robustness, and CLI startup handling.

## [0.3.1] - 2026-07-12

### Fixed

- Hardened CLI startup, shortcut settings, Escape-key priority, shutdown behavior, and other release-gate defects.

## [0.3.0] - 2026-07-11

### Added

- Initial public Windows desktop GUI for Grok Build CLI.
- ACP-native sessions, streaming messages, tool cards, permission confirmation, modes, models, local session indexing, Electron packaging, automated tests, and UI smoke coverage.

[Unreleased]: https://github.com/j0988114582-ui/grok-build-control-center/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.4.0
[0.3.2]: https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.3.2
[0.3.1]: https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.3.1
[0.3.0]: https://github.com/j0988114582-ui/grok-build-control-center/releases/tag/v0.3.0
