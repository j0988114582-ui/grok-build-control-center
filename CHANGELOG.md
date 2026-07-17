# Changelog

All notable user-visible changes to Grok Build Control Center are documented here.

The format follows Keep a Changelog principles and the project uses semantic versioning where practical.

## [Unreleased]

### Added

- GitHub Actions quality checks and Windows UI smoke evidence.
- Structured bug, feature, and beta feedback forms.
- Pull request validation and risk-review checklist.
- Public roadmap, beta testing guide, support guidance, and release metrics script.

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
