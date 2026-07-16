> **2026-07-17 更新 — C13 COMPLETE；本輪已由整合審查取代。** `8e47e6f` 已補齊四種類型在 1040／1280、rail 與共 11 張 screenshot；因此下方舊報告的 C13 FAIL 只保留作歷史紀錄，不再代表目前狀態。最新重評、compact A+C 與 0.7.x verdict 見 [`v070-compact-and-preview-codex-fullaccess-review.md`](./v070-compact-and-preview-codex-fullaccess-review.md)。整合審查將 C13 改評為 PASS-with-nit，並記錄 video fixture／pass condition 的證據品質 follow-up。

# Grok Build Control Center 0.7.0 Preview Dock — Codex Full-Access Smoke Report

**日期**：2026-07-17  
**基準 commit**：`ec825bc`（Preview Dock 變更位於本次工作樹）  
**Verdict**：**PASS-with-nits**  
**P0**：0

## 結論

0.7.0 Preview Dock 的既有 verify、Electron smoke、preview 單元測試、安全政策與 AGY 視覺 gate 均無 P0。指定抽查確認：標準單一 HTTP Range 會回 `206 Partial Content`、C14 四類拒絕都有中文理由、HTML iframe 不會同時取得 `allow-same-origin` 與 `allow-scripts`。

本報告保留一項驗收證據缺口：C13 目前只有 2 張 1480×940 的空狀態／rail 截圖，未滿足「四種類型 + 1040/1280」完整矩陣，因此 C13 記為 **FAIL（P1 evidence gap）**。這不構成產品 P0，故總 verdict 為 **PASS-with-nits**，但發布證據封存前應補圖。

## Gate 與本輪執行

| Gate | 結果 | 證據 |
| --- | --- | --- |
| 完整驗證 | PASS | Implementation session 已驗證 `npm run verify` exit 0：228 tests，lint、typecheck、build 全綠；本輪依指示未重跑長驗證。 |
| Preview Electron smoke | PASS | `outputs/preview-smoke/result.json`：`exitCode: 0`、`ok: true`，dock mounted、開／關、快捷鍵、CSP 全為 true。 |
| Preview 短測試組 | PASS | 本輪執行 `npx vitest run tests/preview-path-policy.test.ts tests/preview-discover.test.ts tests/preview-service.test.ts tests/preview-dock.test.tsx tests/preview-csp.test.ts`：5 files、32 tests、exit 0。 |
| AGY 視覺審查 | PASS-with-nits | `docs/plans/v070-preview-agy-visual-review.md`：Approve-with-nits、P0 = None。 |

## 指定抽查

### 1. Range seek / 206

`src/main/preview-protocol.ts` 的 `parseRange()` 支援 `bytes=start-end`、open-ended `bytes=start-` 與 suffix `bytes=-length`；有效範圍會限制在檔案尾端。`fileResponse()` 對有效 Range 回：

- status `206`
- `Content-Range: bytes start-end/size`
- `Content-Length` 為實際讀取 bytes
- `Accept-Ranges: bytes`
- 從指定 offset 讀取精確 chunk

`src/renderer/src/components/PreviewDock/VideoView.tsx` 使用原生 `<video controls preload="metadata">`；換 `src` 會 pause、歸零、reload，dock 收合或非 active 時會 pause。標準瀏覽器單一 Range seek 路徑成立。

Nit：目前 malformed、multi-range 或 unsatisfiable Range 會讓 `parseRange()` 回 `null`，接著降級為完整 `200`，未回 HTTP `416`；此外尚無直接鎖住 `206` headers/body 的 protocol 單元測試。這不阻擋一般 `<video>` seek，但建議後續補回歸鎖。

### 2. C14 中文拒絕理由

`src/shared/preview-path-policy.ts` 與 `src/main/preview-service.ts` 對必測輸入回傳非空中文理由：

| 輸入類型 | 中文理由 |
| --- | --- |
| `..` 穿越 | `路徑含有非法的上層目錄參照` |
| UNC | `不支援 UNC 網路路徑` |
| allowlisted root 外 | `路徑在允許的工作區外，僅能在檔案總管開啟` |
| 非白名單副檔名 | `此格式暫不支援預覽` |

`tests/preview-path-policy.test.ts` 鎖住穿越、UNC、device path、ADS、結尾點／空白、保留名、非絕對路徑與非白名單副檔名；`tests/preview-service.test.ts` 鎖住 root 外與 IPC-facing stat/register 拒絕。Renderer bridge 到 main handler 的接線可由 `src/preload/index.ts`、`src/shared/bridge.ts`、`src/main/index.ts` 追到同一組 helper。

### 3. HtmlView sandbox

`src/renderer/src/components/PreviewDock/HtmlView.tsx` 僅有兩種 sandbox 值：預設 `""`（全部限制）或逐檔逐次同意後的 `"allow-scripts"`。程式碼沒有加入 `allow-same-origin`；`tests/preview-dock.test.tsx` 對兩種狀態都有斷言，且本輪測試通過。

AGY 已記錄的 P1 仍成立：`srcdoc` 繼承主 renderer CSP，因此 inline script 即使取得 `allow-scripts` 仍可能被 `script-src 'self'` 擋下。C5 驗收要求的「預設不執行惡意 script + sandbox 正確」不受影響。

## C1–C14 驗收矩陣

證據層級：**R** = Electron/runtime、**U** = unit/RTL、**S** = source/static inspection、**P** = implementation session 提供的完整 verify 結果。

| # | 結果 | 證據與判定 |
| --- | --- | --- |
| C1 開關預覽台 | **PASS** | **R/U/S**：`outputs/preview-smoke/result.json` 的 `toggleOpen`、`toggleClose`、`shortcut` 全為 true；`tests/preview-dock.test.tsx` 鎖 open/rail；`src/renderer/src/App.tsx` 將 `preview.open` 寫回 settings，`tests/settings.test.ts` 鎖 normalization。 |
| C2 拖曳寬度 | **PASS** | **S/U**：`src/renderer/src/components/PreviewDock/PreviewDock.tsx` pointer resize 強制 clamp 至 `PREVIEW_MIN_WIDTH..PREVIEW_MAX_WIDTH`（260–480）；`src/shared/settings.ts` 載入時再次 clamp，`tests/settings.test.ts` 驗證 999 → 480。 |
| C3 點路徑預覽圖片 | **PASS** | **S/U**：`src/main/preview-service.ts` 明定 ≤8MB 使用 base64、>8MB 使用 `grok-preview://` protocol；`tests/preview-service.test.ts` 驗證圖片註冊與 protocol 媒體註冊，`src/renderer/src/App.tsx` 將 register 結果交給 image view。大圖分流為靜態抽查，未在本輪另造 >8MB fixture。 |
| C4 預覽影片 | **PASS** | **S**：`src/renderer/src/components/PreviewDock/VideoView.tsx` 有原生 controls、src 切換 reset/pause、inactive pause；`src/main/preview-protocol.ts` 的標準單一 Range 回 `206` 與完整 seek headers。未重跑真影片互動；416/multi-range 為上述 nit。 |
| C5 預覽 HTML | **PASS** | **U/S**：`src/renderer/src/components/PreviewDock/HtmlView.tsx` 預設全限制 sandbox，允許腳本時僅 `allow-scripts`；`tests/preview-dock.test.tsx` 明確禁止 `allow-same-origin` + `allow-scripts`。 |
| C6 預覽 code fence | **PASS** | **U/S**：`tests/preview-discover.test.ts` 驗證 fenced code discovery；`src/renderer/src/components/PreviewDock/CodeView.tsx` 於 ≤200KB 使用 highlight.js，並提供 clipboard 複製與 >200KB 純文字降級。 |
| C7 清單多項切換 | **PASS** | **S**：`src/renderer/src/components/PreviewDock/PreviewDock.tsx` 以 active id 切 view；`VideoView.tsx` 對 src change 執行 pause/reset/load，對 inactive 執行 pause，避免殘留播放。 |
| C8 檔案不存在 | **PASS** | **U/S**：`src/main/preview-service.ts` 與 protocol serve-time check 回 `找不到檔案，可能已被移動或刪除`；`tests/preview-dock.test.tsx` 驗證中文錯誤態。 |
| C9 超大檔 | **PASS** | **S**：`src/main/preview-service.ts` 依圖片／影片上限標記 `tooLarge`，register 回 `檔案過大（上限 …MB），請用系統程式開啟`；Preview Dock error actions 提供外部開啟／檔案總管退路。 |
| C10 設定即時預覽不回歸 | **PASS** | **P/S**：完整 `npm run verify` 已通過；`src/renderer/src/App.tsx` 保留 SettingsPanel 的 `onLiveChange` 與已存 settings 分流，Preview settings 併入同一 normalization/persistence 路徑。 |
| C11 readiness／插話不回歸 | **PASS** | **P/U**：完整 verify 228 tests 全綠；`tests/app.test.tsx` 覆蓋 failed prompt ready-to-retry、插話不取消、取消後清 queued 狀態，以及 Team panes ready 後依 session 路由。 |
| C12 axe serious/critical | **PASS** | **R**：`outputs/preview-smoke/result.json` 中 preview-open 與 preview-rail 的 `violations` 都是空陣列，`seriousA11y: 0`。 |
| C13 截圖 | **FAIL** | **R**：`outputs/preview-smoke/preview-open.png`、`preview-rail.png` 都是 1480×940，且 open 圖為空狀態。現有 evidence 未包含 image/video/HTML/code 四類，也沒有 1040 與 1280 寬度各一張。列 P1 evidence gap。 |
| C14 安全負面 | **PASS** | **U/S**：`tests/preview-path-policy.test.ts`、`tests/preview-service.test.ts` 的 adversarial cases 本輪通過；`src/preload/index.ts` → `src/main/index.ts` 的 `preview:stat/register/read-text` 均落到相同 policy/service，四類必測輸入皆有中文拒絕理由。 |

## Nits / 後續

1. **P1 — 補 C13 證據矩陣**：四種 view、rail，以及 1040/1280 寬度各至少一張；建議讓 `smoke:preview` 自動記錄 viewport 與 active kind，避免靠人工檔名判讀。
2. **P1 — 保留 AGY inline-script 說明**：目前「允許腳本」不等於 inline script 一定可執行；未改載入模型前，UI 文案不應承諾完整執行。
3. **P2 — protocol Range 回歸測試**：直接斷言 common Range 的 `206`、body slice、`Content-Range`，並決定 malformed/unsatisfiable Range 是否改回 `416`。
4. **P2 — 增加真媒體 fixture smoke**：將 >8MB 圖片與可 seek 的短影片納入可重現測試，讓 C3/C4 從 static inspection 升級為 runtime evidence。

## 最終判定

**PASS-with-nits，無 P0。** Preview Dock 的核心功能、安全邊界與現有 runtime smoke 可接受；C13 是明確但非阻斷產品功能的證據缺口，應在正式 release evidence 封存前補齊。
