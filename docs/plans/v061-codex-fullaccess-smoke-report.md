# v0.6.1 Codex full-access real product smoke

日期：2026-07-16（Asia/Taipei）  
執行環境：Windows 真機、workspace write + danger-full-access  
工作目錄：`C:\Users\111\Documents\grok-build-GUI\work\_upstream`

## 1. Verdict

**PASS-with-nits**

兩個指定品質門均在真機 exit 0；本機 Grok CLI 0.2.101 可用，Electron smoke 實際連上 ACP 並取得 quota，並非未登入狀態。沒有確認到 P0/P1。

保留 nits 的原因不是測試失敗，而是既有 `smoke:ui` 明確「不送 prompt」：Agents Team 的隔離／路由由 RTL T4 測試證明，尚未在這一輪消耗額度做雙 prompt 真實重疊與 cancel 隔離。發版前若要把並發行為也列為 live-verified，仍需一次約 2 分鐘的人手或專用 live T4。

## 2. Command results

| Command | Exit | Duration | stdout/stderr summary |
| --- | ---: | ---: | --- |
| `npm.cmd run verify` | **0** | 43.0s | Vitest **44 files / 195 tests passed**；ESLint `--max-warnings=0` 通過；node/web typecheck 通過；main/preload/renderer production build 通過。沒有 error stderr。 |
| `npm.cmd run smoke:ui` | **0** | 18.7s | production build 通過；Electron 真機 smoke 回傳 `connected: true`、`sessionAvailable: true`、3 個 a11y 狀態零 violations，並寫出 7 張截圖與 `result.json`。沒有 error stderr。 |
| `npx.cmd vitest run tests/app.test.tsx --reporter=verbose -t "Agents Team\|T4: team panes\|T4: sendPrompt"` | **0** | 6.2s | 指定 Agents Team/T4 **3/3 passed**：雙 pane、草稿與 cancel 隔離、正確 sessionId 路由。 |
| Settings live-preview diagnostic（第一次，直接改 DOM range value） | 1 | 92.2s | 逾時；系統性定位後確認一次性腳本繞過 React controlled-input value tracker，不能當產品失敗。 |
| Settings live-preview diagnostic（真實 click + ArrowRight） | **0** | 2.2s | **未按 Save**：theme `dark → light`；font `15 → 16`；`.app` CSS `--font-size` 即時成為 `16px`；drawer 仍開啟。Electron 已關閉，沒有留下 dev/Electron process。 |

## 3. Fresh smoke JSON summary

`outputs/ui-smoke/result.json` 本身沒有 timestamp 欄位；以下以檔案系統 `LastWriteTime` 判斷 freshness：

- `result.json`：**2026-07-16T22:29:35.810+08:00**（本次 smoke 完成時間）
- `connected: true`
- `sessionAvailable: true`
- `setup: false`（CLI 已存在，不是未安裝頁）
- `renderer: "webgl"`：此欄來自 `.starfield-canvas[data-renderer]`，不是 StatusOrb renderer。
- a11y（axe 僅保留 serious/critical）：
  - `empty`: `violations: []`
  - `account-switch-confirmation`: `violations: []`
  - `session`: `violations: []`
- 其他 smoke flags：`beginner/focus/deep/reducedMotion/quota/quotaProducts/accountSwitch/cursor/modelPicker/commandPalette/shortcuts/sidebarFits = true`

Fresh screenshots（皆存在、非零大小、今天重寫）：

| Relative path | LastWriteTime (+08:00) | Bytes |
| --- | --- | ---: |
| `outputs/ui-smoke/shortcuts-1440.png` | 2026-07-16T22:29:29.593 | 158,770 |
| `outputs/ui-smoke/account-switch-confirmation.png` | 2026-07-16T22:29:31.426 | 181,864 |
| `outputs/ui-smoke/canvas-webgl.png` | 2026-07-16T22:29:32.134 | 514,537 |
| `outputs/ui-smoke/focus-1440.png` | 2026-07-16T22:29:32.415 | 514,177 |
| `outputs/ui-smoke/palette-1440.png` | 2026-07-16T22:29:32.618 | 201,440 |
| `outputs/ui-smoke/deep-1440.png` | 2026-07-16T22:29:34.738 | 201,262 |
| `outputs/ui-smoke/reduced-motion-1440.png` | 2026-07-16T22:29:35.809 | 507,322 |

抽看 `account-switch-confirmation.png`、`focus-1440.png`、`deep-1440.png`：對話框、空白首頁、session 畫面均完整出圖，沒有白屏或主要版面缺失。

## 4. Requested product checks

1. **Settings `onLiveChange` — confirmed in code and live without Save.** `src/renderer/src/App.tsx:189-192` 的 `update()` 同步更新 draft 並呼叫 `onLiveChange`；`src/renderer/src/App.tsx:1459-1469` 把 theme、effects、fontSize、lineHeight、contentWidth 等立即寫回 App state；`src/renderer/src/App.tsx:1321` 直接把該 state 套到 data attributes/CSS variables。補充 Playwright 短跑實際確認 theme 與 font 在 Save 前改變。
2. **StatusOrb 2D canvas only — confirmed.** `src/renderer/src/fx/StatusOrb.tsx:24` 唯一 context 是 `canvas.getContext('2d')`；元件內沒有 R3F/Three/WebGL。smoke JSON 的 `webgl` 來自 `work/ui_feature_smoke.mjs:71-72` 的 StarfieldCanvas。
3. **SessionReadyGate main + renderer dual gate — confirmed.** main gate 在 `src/main/session-ready-gate.ts:6-47`，連線 generation 變更會清 readiness；`src/main/index.ts:246-278` 只在 create/load 成功後 markReady，並在 prompt/interject/cancel 前 assertReady。renderer/shared gate 在 `src/shared/session-readiness.ts`，`src/renderer/src/App.tsx:949-1041` 在 cancel/send/interject/do-now 前呼叫 generation-aware `sessionActionAllowed`，pane 也以 `isSessionReady` 控制 ready 狀態。
4. **Agents Team T4 tests present and green — confirmed.** `tests/app.test.tsx:1014`、`:1035`、`:1091` 三項被聚焦重跑，3/3 passed；全套 verify 亦為 195/195 passed。
5. **Fresh smoke result — confirmed.** `connected: true`；三個 a11y entries 的 `violations` 均為空；7 個 screenshot path 全部存在且 `LastWriteTime` 為今天 22:29:29–22:29:35。

## 5. P0 / P1

- **P0：無確認問題。**
- **P1：無確認問題。**
- Coverage nit：本輪沒有送真實 prompt，因此沒有 live 驗證 Agents Team 雙 prompt 重疊與 cancel A 不影響 B；目前證據是 3 個綠色 RTL T4 tests。

## 6. 給站主

這版可以當日常 GUI 使用：真機可連 Grok、可讀 session／quota，完整 verify、Electron smoke、a11y 與 Settings 未儲存即時預覽都通過，沒有看到 P0/P1。一般日常使用不用再把 195 項測試手點一次；但如果今天要把 0.6.1 當正式發版簽核，建議仍人手點一次 Agents Team 兩格同時送最小 prompt，再取消其中一格確認另一格不中斷，順便在你實際 Windows DPI 看 1–3 pane 是否截斷。這是目前唯一仍未由本輪 live smoke 覆蓋的高價值檢查。
