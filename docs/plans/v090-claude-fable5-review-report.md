# v0.9.0 Claude（Fable 5）Code Review 報告 — 給 GROK 4.5

日期：2026-07-19（第二輪同日補完，見「五、第二輪」）。審查範圍：前後端交互邏輯（main ↔ renderer ↔ remote-web）、桌面 UX、手機遙控端 UX/畫面。
審查對象：`work/_upstream` working tree（含 Wave A/B 未 commit 修正）。
**兩輪修復全部落地於 working tree，最終驗證綠燈**：`npm test` 62 檔 348 測試、`npm run lint`、`npm run typecheck`、`npm run build`、`node work/ui_feature_smoke.mjs`（axe serious/critical = 0）、**`npm run smoke:remote-e2e`（真 cloudflared 隧道＋Playwright 模擬手機，23/23）** 全過；installer 已重打包。

## 一、已修復（附回歸測試）

### P1-1　BODY_LIMIT 32KB 擋掉合法的 12,000 字 CJK 提示
`remote-server.ts` 的 `BODY_LIMIT=32_768`，但 `REMOTE_PROMPT_MAX_CHARS=12_000` 且手機 textarea `maxlength=12000`。CJK 每字 UTF-8 3 bytes，12k 字 JSON body ≈ 36KB → 約 10,700 字就 413「請求過大」，與 UI 承諾矛盾。
**修**：`BODY_LIMIT=131_072`（涵蓋最壞 6 bytes/char 逸出 + envelope）。
**測**：`remote-server.test.ts`「accepts a full 12k-char CJK prompt」。

### P1-2　`/api/prompt` 等整輪結束才回應（隧道 ~100s 逾時必炸）
`GrokAcpClient.prompt()` 於 stopReason 才 resolve；`handlePrompt` await 它 → HTTP 回應被吊住整輪。Cloudflare Quick Tunnel 代理逾時約 100 秒：任何長回合，手機端都會收到 524/網路錯誤並誤報「操作失敗」，實際回合仍在跑（4G 實測清單很可能只覆蓋短回合）。
**修**：改為「accepted-then-run」：`handlePrompt`／`handlePromptForSession`（queue drain、do-now 同路徑）先做完所有前置驗證（focus/ready/in-flight/長度），標記 `inFlightPrompt` 後即回 `{ok:true}`；`firePrompt()` fire-and-forget，失敗時清 in-flight、寫 notices（`提示送出失敗：…`）並 emit。回合進度本來就靠 snapshot 輪詢與 turn 事件（`pushEvent` 清 in-flight）傳遞，語義自洽。
**⚠ 語義變更**：`POST /api/prompt` 200 現在代表「已接受」而非「已完成」。錯誤改由 notices + tail turn/error 事件呈現。
**測**：`remote-controller.test.ts`「prompt responds accepted before the turn completes; failure surfaces via notices」（含 in-flight 拒絕第二發、失敗後可重送）。

### P1-3　權限卡三向不同步
1. 桌面點掉權限 → `grok:permission` IPC 只呼叫 ACP，`remoteController.pending` 沒清 → 手機卡片殘留至 5 分 TTL；再點會打到 ACP「Permission request is no longer active」（英文原文直出）。
2. 手機回覆 → 桌面 modal 不關，掛到回合結束；點了才報錯。
3. 回合結束/取消 → renderer 會清卡，remote pending 不清。
**修**（三處對齊桌面語義）：
- `remote-controller.pushEvent`：turn 非 running → `clearPermissionsForSession(sessionId)`。
- `index.ts` `grok:permission` handler：ACP respond 後 `remoteController.clearPermission(requestId)`。
- `index.ts` remote deps `respondPermission`：ACP respond 後 `send('grok:permission-resolved',{requestId})`；新增 bridge/preload `onPermissionResolved`，`App.tsx` 收到即 filter 掉該 modal。
- `handlePermissionRespond` catch 改回 `permission_mismatch`＋中文訊息（不再 server_error 帶英文）。
**測**：「turn end clears pending permission cards like the desktop」。

### P1-4　手機 YOLO 開/關沒有「執行中」防護
桌面 `permissionControlsLocked = lifecycleBusy||running||anyRunning||sessionLoading||yoloBusy` 擋切換；手機 `handleYoloEnable/Disable` 直接 `applyAgentPermissionMode` → disconnect+reconnect ACP，執行中的回合被無聲砍掉。
**修**：controller 新增 `hasRunningActivity()`（任一 running 或 in-flight prompt）→ 兩個 handler 先擋，回 `{code:'in_flight', message:'有回合執行中：請先停止（或等它完成）再切換 YOLO'}`（HTTP 409）。
**測**：「yolo toggle is refused while a turn is running (parity with desktop lock)」。

### P2-5　手機「切斷」桌面不知情
`/api/logout` 只 `auth.revokeAll()`，controller.banner 停在 `paired`、不 emit → 桌面面板持續顯示「已配對」。
**修**：controller 新增 `handleLogout()`：revokeAll + `pending.clear()` + banner=`expired` + notices（手機端已切斷…）+ emit；server route 改用它。
**測**：controller「phone logout expires desktop banner…」＋ server「phone logout flips desktop banner to expired…」。

### P2-6　`remote:focus-changed` 缺 `focusStatus`（renderer 有死碼）
`bridge.RemoteFocusChangedPayload.focusStatus` 是合約的一部分，`App.tsx` 的 loading/error 分支依賴它，但 main 只送 `{sessionId}` → 分支永不執行。
**修**：`handleFocus` 在呼叫 `onFocusChanged` 前先定 `focusStatus`（ready/loading）；deps 簽名改 `(sessionId, focusStatus?)`；`index.ts` 帶進 payload。`setFocusSession` 同步帶出。
**測**：「focus change reports focusStatus to onFocusChanged」。

### P2-7　桌面關遙控/斷網後，手機端靜默凍結
`fetchSnapshotOnce` 失敗只加 pollMs，畫面停在舊資料＋「已配對」。
**修**：`noteSnapshotFailure()` 連續 3 次失敗 → banner「連線中斷：連不上電腦（遙控可能已關閉或網路變更），畫面非最新」；成功即復原。輪詢照常持續（可自癒）。
**測**：SPA 字串測試「signals dropped desktop connection…」。

### P2-8　手機端每 2.5s 全量重建 DOM
sessions/permissions/tail 每輪 `innerHTML=''` 重建：閃爍、長按選字被打斷、`aria-live` 重複播報。
**修**：各區塊以 JSON 為 render key（`lastSessionsKey/lastPermissionsKey/lastTailKey`），未變更即跳過重建；tail 抽成 `renderTail()`，捲動跟隨邏輯只在真正重建時評估。
**測**：「skips DOM rebuilds when snapshot sections are unchanged」。

### P2-9　執行中送出鈕仍可按（按了必 409）
**修**：`renderSnapshot` 依 `snap.running` 設 `sendBtn.disabled` 並顯示「執行中…」；`sendPrompt` finally 依 `lastSnap.running` 決定是否維持 disabled；CSS 補 `button:disabled` 樣式。執行中的操作入口本來就是插話/排隊/立刻改做列。
**測**：「disables send while a turn is running」。

### P3-10　YOLO PIN 流程與明碼
首按即出現錯誤字樣（其實只是展開輸入框）、輸入框明碼、成功後不收合。
**修**：兩段式——首按展開＋notices 引導（非錯誤語氣）＋focus；有值才送；成功後清空並收合。`index.html` 的 `#yolo-pin` 改 `type="password"`（保留 `inputmode="numeric"`）。
**測**：「YOLO PIN is a two-step reveal with masked input」。

### P3-11　其他小修
- `listCwdUnion()` 顯示值保留原大小寫（新增 `normalizeCwdDisplay()`；等值判斷仍走小寫 key）。手機「新建對話」選單不再全小寫。測：「cwd union keeps original casing…」。
- snapshot 限流 30→60/min：2.5s 輪詢基線 24/min＋動作後即時刷新，30 貼邊會間歇 429 造成畫面卡頓。
- 隧道 health 驗證重試最長約 2 分鐘、桌面只有「啟動中…」：每次重試（第 2 次起）以 `setStatusNotice('隧道啟動驗證中（第 N/10 次）…')` 推 toast。

## 二、審查通過、值得保留的設計（不動）
- `handleFocus` 的 intent-seq / loadGeneration / enableEpoch 三層競態防護——測試覆蓋完整，wave5 r2–r4 的修正正確。
- Wave A/B 未 commit 修正：loopback QR 預警與啟用前 confirm、隧道 health 重試、手機 sticky composer、session 列表 ellipsis、桌面 session actions 改真欄位（不再絕對定位壓標題）、Starfield 延遲初始化（1×1 冷啟修復）——皆合理且測試在案。
- 安全面：Host/Origin 白名單、`X-Grok-Remote` + SameSite=Strict + Content-Type 三重 CSRF 防護、cookie HttpOnly/Path=/api、PIN scrypt+timingSafeEqual、5 次鎖定、tail 64KB wire budget、無上傳路由。本輪未發現新的安全問題。

## 三、第一輪遺留清單（→ 已於第二輪全數完成，見「五」）
1. ~~手機端無模型/模式清單~~ → B1。
2. ~~do-now 的殘留競態~~ → B2。
3. ~~optimisticSessions 不過期~~ → B3。
4. ~~手機 YOLO 路徑未走 `lifecycleOperation` mutex~~ → B4。
5. ~~installer 未重打包~~ → 第二輪已重跑 `npm run package`。
6. **`/api/prompt` 語義變更**（見 P1-2）：任何依賴「200=回合完成」的文件/測試敘述請同步更新——此項仍是給 GROK 的注意事項，非缺陷。

## 四、驗證紀錄（本機 2026-07-19，兩輪最終態）
```
npm test        → 62 files, 348 tests, all pass
npm run lint    → clean（--max-warnings=0）
npm run typecheck → clean（node + web）
npm run build   → ✓ built
node work/ui_feature_smoke.mjs → 全項 true；axe empty/account-switch/session 三態 violations=[]；renderer=webgl
npm run smoke:remote-e2e → OVERALL PASS 23/23（真 cloudflared Quick Tunnel）
npm run package → outputs/installer/Grok-Build-Control-Center-Setup-0.9.0.exe（NotSigned，見五-C）
```
異動檔案：`src/main/{remote-server,remote-controller,acp-client,index}.ts`、`src/shared/{bridge,remote-protocol}.ts`、`src/preload/index.ts`、`src/renderer/src/App.tsx`、`resources/remote-web/{app.js,index.html,app.css}`、`work/remote_tunnel_e2e.ts`（新）、`package.json`（scripts）、`.gitignore`、`tests/{remote-controller,remote-server,remote-web-spa,app}.test.*`。

## 五、第二輪：0.9.1 backlog 補完＋真隧道 E2E（同日 2026-07-19）

### A. Backlog 修復（全附回歸測試）

**B1　手機模型/模式選單（protocol 擴充）**
- `remote-protocol.ts`：`RemoteSnapshot` 新增 `models: RemoteModelState | null`、`modes: RemoteModeState | null`（有界投影：models ≤16、efforts ≤8、字串長度截斷）。
- `acp-client.ts`：新增 `getCachedCapabilities()` 唯讀 getter。
- `remote-controller.ts`：deps 新增 `getCapabilities?`；`snapshotModels()/snapshotModes()`。
- `index.ts`：wire `acpConnection.current?.getCachedCapabilities()`。
- 手機端：`更多` 面板改為 `model-select`＋`effort-select`＋`mode-select`（目前值預選、effort 隨所選模型連動、含「（預設）」空值）；無資料時自動退回原手動輸入框。
- **E2E 抓到的衍生 bug 已修**：pickers 原本共用一把 render key，套用模型後 snapshot 變動會連帶重建 mode 選單、把使用者剛選的值洗掉——已拆成 `lastModelsKey`／`lastModesKey` 各自重繪。
- 測：controller「snapshot projects models and modes…」＋ SPA「offers model/mode pickers…」。

**B2　do-now 競態根治**
`handleDoNow` 在 cancel 後先 `waitForTurnIdle(sessionId, ≤1.2s)`（50ms 輪詢 runningBySession/inFlight，等 cancelled turn stop 事件落地）再發新 prompt；逾時走原 force-clear fallback。舊 turn 的晚到事件不再清掉新 prompt 的 in-flight 旗標。
測：「do-now lets the late cancelled turn event land before firing the new prompt」（驗證 prompt 只發一次且後續請求正確 409 in_flight）。

**B3　optimisticSessions TTL**
map 值改 `{ summary, addedAt }`；`mergeOptimisticIntoLastSessions()` 先清 >10 分鐘未落盤者。
測：「optimistic session expires after TTL when disk never shows it」。

**B4　手機側 ACP 操作納入 lifecycle mutex（與桌面對稱）**
`index.ts` remote deps 的 `prompt/cancel/loadSession/createSession/setModel/setMode/interject/setPermissionMode` 全部包 `lifecycleOperation.runShared`（label 與桌面 IPC 一致）。exclusive 操作（安裝/切帳號）期間，手機請求會得到與桌面相同的「…正在進行中」失敗，經 firePrompt catch → notices 呈現。`runShared` 為共享池，無巢狀死鎖。

**B5　對話刪除的遙控端清理**
`grok:session:delete` 成功後：`sessionReadyGate.clear(id)`＋新方法 `remoteController.onSessionDeleted(id)`（清 running/inFlight/tail/optimistic/該 session pending 權限/佇列；若為焦點 → 焦點歸零並廣播 `focus-changed(null,'none')`）。
測：「session delete clears remote focus, tail, queue and running flags」。

**B6　手機 tail 呈現修飾**
turn 事件不再顯示裸英文卡片（「running」「completed」）→ 置中細字「─ 回合開始／完成／已取消 ─」；error 事件紅字樣式。（E2E 截圖驅動的修正）

**B7　sticky composer 疊影**
`.composer-dock` 背景由半透明 card 漸層改為不透明頁底色漸層——抽屜捲動時內容不再從輸入 dock 後面透出。（E2E 截圖驅動的修正）

### B. 真隧道＋模擬手機 E2E（本輪新增的常設驗證）

新增 `work/remote_tunnel_e2e.ts`＋`npm run smoke:remote-e2e`：真 `cloudflared` Quick Tunnel、真 `RemoteServer`/`RemoteController`（ACP 以行為等價 fake 模擬 acp-client 事件契約：prompt 呼叫即發 turn:running、8 秒後 assistant message＋turn completed）、Playwright iPhone 視窗（390×844、touch、mobile UA）從**公網 URL**走完整流程。連跑兩次皆 **23/23 PASS**（不同 trycloudflare URL）：

```
cloudflared-found / tunnel-started / public-health-nonce(attempt 4) / api-status-200 /
api-snapshot-401-unauth / pair-page-loaded(keys=12, secretStripped) / paired-main-shell /
auto-focus-ready / session-list-rendered(2) / prompt-accepted-fast(97–208ms vs 8000ms turn) /
send-disabled-while-running / tail-shows-reply / send-reenabled-after-turn /
cjk-12k-accepted / cjk-12k-turn-completed / permission-roundtrip(allow-once) /
model-picker-visible(grok-4.5) / model-apply(composer) / mode-apply(chat) /
yolo-blocked-while-running / yolo-enable-after-idle / logout-back-to-pair /
desktop-banner-expired
```

實測直接證明第一輪的三個 P1 修復在真隧道下成立：`prompt-accepted-fast` 97–208ms（accepted-then-run，不再撞 Cloudflare ~100s 逾時）、`cjk-12k-*`（BODY_LIMIT）、`yolo-blocked-while-running`（執行中防護）。證物：`outputs/remote-e2e/result.json`＋10 張截圖（gitignored）。
注意：harness 以 `bypassCSP: true` 執行（SPA 的 `script-src 'self'` 會擋 Playwright 字串求值；CSP 本身由 `tests/remote-server.test.ts` 把關）。

### C. Installer 重打包
`npm run package`（notices → test → build → electron-builder NSIS）→ `outputs/installer/Grok-Build-Control-Center-Setup-0.9.0.exe`；`Get-AuthenticodeSignature` 維持 **NotSigned**（與歷輪一致，不得宣稱已簽章）。SHA256／release 資產由 GROK 發佈流程負責。
