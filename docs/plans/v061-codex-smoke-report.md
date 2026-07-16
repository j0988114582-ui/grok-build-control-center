# v0.6.1 Codex full smoke report

執行時間：2026-07-16（Asia/Taipei）  
工作樹：`C:\Users\demo\Documents\grok-build-GUI\work\_upstream`

## 1. Verdict

**FAIL（verification/environment-blocked）**

指定流程未能全綠：`npm test`、`npm run build`、`npm run smoke:ui` 的本次指定入口皆為 exit 1。已確認主要阻擋是受管制執行環境，而不是已重現的產品測試失敗：esbuild 預設 config bundler 沿祖先目錄搜尋 package scope 時，讀取 `C:\Users\demo` 被 workspace sandbox 拒絕。Vitest 改用官方 `--configLoader runner` 後，**44 test files / 195 tests 全數通過**。不過 build 與完整 UI smoke 沒有等價的成功重跑，因此不能判為 PASS 或 PASS-with-nits。

## 2. Command results

| command | exit | notes |
|---|---:|---|
| `npm test` | 1 | PowerShell 的 `npm.ps1` 先被 ExecutionPolicy 阻擋；改用 Windows 等價入口 `npm.cmd test` 後，Vitest 仍在載入 `vitest.config.ts` 前因 sandbox 拒絕 esbuild 讀取祖先目錄而 exit 1，測試案例本身未開始。補充驗證 `npm.cmd test -- --configLoader runner` 為 exit 0：44 files、195 tests passed。 |
| `npm run lint`（以 `npm.cmd` 執行） | 0 | `eslint . --max-warnings=0` 通過，無 warning。 |
| `npm run typecheck`（以 `npm.cmd` 執行） | 0 | `tsc --noEmit` 的 node 與 web 兩份 tsconfig 皆通過。 |
| `npm run build`（以 `npm.cmd` 執行） | 1 | 內含 typecheck 再次通過；`electron-vite build` 在載入 `electron.vite.config.ts` 前遇到同一個 esbuild／sandbox ancestor-read denial。沒有編譯錯誤證據，但本次未產生可認定成功的新 build。 |
| `npm run smoke:ui`（以 `npm.cmd` 執行） | 1 | 依要求即使已有部分 build 仍執行；前置 `npm run build` 同上失敗，因此 `work/ui_feature_smoke.mjs` 未由此命令啟動。 |

補充 runner 證據：工作樹已有一份晚於受檢來源的 `out/`（renderer bundle 20:54:31；相關來源最後修改 20:46–20:47）。直接執行 `node work/ui_feature_smoke.mjs` 時，第一次 renderer crash；加入 `ELECTRON_DISABLE_SANDBOX=1` 後可啟動並操作到「連接本機 Grok」，但等待總額度列 90 秒逾時（本次環境禁用網路），exit 1，未走完整 a11y 與截圖流程。

## 3. smoke:ui JSON summary

`outputs/ui-smoke/result.json` **存在，但時間為 20:54:39，並非上述本次失敗命令所產生**；以下只能視為工作樹內既有證據，不冒充本次成功結果：

- `connected: true`
- `sessionAvailable: true`
- a11y serious/critical violations：`empty = 0`、`account-switch-confirmation = 0`、`session = 0`
- `renderer: "webgl"`（這是 Starfield renderer；StatusOrb 本身已是 2D canvas）
- 其他旗標：`beginner/focus/deep/reducedMotion/quota/quotaProducts/accountSwitch/cursor/modelPicker/commandPalette/shortcuts/sidebarFits = true`
- screenshots：
  - `outputs/ui-smoke/shortcuts-1440.png`
  - `outputs/ui-smoke/account-switch-confirmation.png`
  - `outputs/ui-smoke/canvas-webgl.png`
  - `outputs/ui-smoke/focus-1440.png`
  - `outputs/ui-smoke/palette-1440.png`
  - `outputs/ui-smoke/deep-1440.png`
  - `outputs/ui-smoke/reduced-motion-1440.png`

## 4. Read-only code checks and P0/P1

四項指定核對皆符合：

1. **Settings live preview：符合。** `src/renderer/src/App.tsx:189-192` 的 `update()` 同步更新 draft 並呼叫 `onLiveChange`；`src/renderer/src/App.tsx:1459-1469` 立即把 theme、immersion、effects、fontSize、lineHeight、contentWidth 等寫入 App render state；`src/renderer/src/App.tsx:1321` 直接以該 state 套用 theme 與字型 CSS variables。無需先 Save 才看到預覽。
2. **StatusOrb 不依賴 WebGL：符合。** `src/renderer/src/fx/StatusOrb.tsx:12-25` 明確使用 `canvas.getContext('2d')`；`src/renderer/src/fx/StatusOrb.tsx:77-100` 說明並組裝 CSS + 2D canvas，沒有 R3F/WebGL 呼叫。
3. **Session readiness dual gate：符合。** main 的 `SessionReadyGate` 位於 `src/main/session-ready-gate.ts:6-47`；`src/main/index.ts:246-278` 僅在 create/load 成功後 markReady，並在 prompt/interject/cancel 前 assertReady。renderer 的 generation-aware map/guard 位於 `src/shared/session-readiness.ts:30-72`，App 在 create/load 後 mark、失敗時 clear，並於 send/interject/do-now/cancel 前呼叫 `sessionActionAllowed`（例如 `src/renderer/src/App.tsx:949-1050`）。
4. **Agents Team T4 tests：存在且本次替代 loader 實跑通過。** `tests/app.test.tsx:1014` 驗證雙 pane；`tests/app.test.tsx:1035` 驗證草稿隔離與 cancel 只命中 focused running session；`tests/app.test.tsx:1091` 驗證兩 pane ready 後 prompt 路由到正確 session id。

**Confirmed P0 bugs：無。**  
**Confirmed P1 bugs：無。**

但有一個發布驗證 blocker：本次受管制環境無法讓指定 build/UI smoke 完整結束，因此「未發現 P0/P1」不等於已證明 UI/build 可發布。

## 5. Manual scope

可以略過人工重做：

- 不必人工逐條重跑 unit/component assertions；替代 config loader 已證明 195/195 通過，含指定 T4。
- 不必人工重查 lint、TypeScript 型別，以及四項指定程式碼存在性；本次已有直接輸出與 read-back。

仍需在一般（非 Codex workspace sandbox、可連本機 Grok）終端完成：

- 原樣重跑 `npm test`、`npm run build`、`npm run smoke:ui`，確認三者 exit 0；這是把 verdict 轉成 PASS 的必要條件。
- 確認新產生的 `result.json` 為本次時間、`connected: true`、所有 a11y state 的 serious/critical violations 為 0，並逐張看新截圖。
- 人眼仍應看 titlebar/StatusOrb、Settings 即時 theme/font 變化、focus/deep/reduced-motion、命令面板，以及 Agents Team 兩／三 pane 在實際 Windows DPI 下是否重疊、截斷或閃爍。自動 smoke 不能完整取代視覺判斷。

## 6. 給站主

站主您好：這輪程式面沒有抓到 P0/P1，lint、typecheck 皆綠，Vitest 改走不需 esbuild bundling 的官方 runner 後是 195/195 全過，四個指定功能也都有程式與測試證據；但 Codex 受管制環境會阻擋 esbuild 往上讀 `C:\Users\demo`，且 UI runner 連 Grok 額度列時又遇到網路封鎖，所以本報告必須誠實判 **FAIL（環境阻擋、尚未完成發布驗證）**。請在一般本機終端原樣跑完 test/build/smoke:ui 三個未綠項並看新截圖；三者 exit 0、a11y 仍為零後，才可把這輪改判 PASS。
