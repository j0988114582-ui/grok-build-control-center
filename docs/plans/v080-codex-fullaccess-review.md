## Verdict：Request-changes

Remote 目前是 **NO-GO**；桌面版也尚未達到 `Remote-NO-GO-desktop-OK`，因為仍有 session、拖放、Esc 與 smoke gate 的 P1。若先砍 Remote，仍需修完這些桌面 P1 才建議發布。

## P0 / Critical

1. **Quick Tunnel health check 會被自己的 Host allowlist 擋下**

   啟動時 allowlist 只有 loopback，health 成功後才加入 `*.trycloudflare.com`；但 server 在處理 `/api/health` 前就先驗證 Host。因此公開 URL 的 health request 會先得到 421，無法回傳 nonce。

   - [main/index.ts:540](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/index.ts:540)
   - [main/index.ts:563](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/index.ts:563)
   - [remote-server.ts:134](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/remote-server.ts:134)

   Cloudflare 官方文件顯示 `httpHostHeader` 預設為空、只有設定後才覆寫 origin Host；目前啟動參數沒有設定它。[Cloudflare origin parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/)

   最小修法：先把候選公開 host 放進暫時 allowlist，再做 nonce health；失敗立即移除、撤銷 auth，且成功前不產生 pairing／QR。

2. **R-SEC-20 checksum／版本釘選實際未執行**

   `verifyCloudflaredChecksum()` 存在但沒有任何 caller；IPC 還允許 renderer 傳入任意 executable path，隨後直接 `spawn()`。

   - [remote-tunnel.ts:25](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/remote-tunnel.ts:25)
   - [remote-tunnel.ts:50](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/remote-tunnel.ts:50)
   - [main/index.ts:517](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/index.ts:517)

   這不符合「釘版本 + checksum，驗證後才執行」。應移除公開 bridge 的自訂路徑，使用受控 binary manifest，驗證版本與 SHA-256 後才 spawn，並補錯 checksum 必須拒絕的整合測試。

## P1 / Important

3. **Remote auth 未在所有安全事件 fail-closed**

   Tunnel 啟動後若子程序退出，只清掉 `child`，沒有通知 controller、關 server 或撤銷 cookie；帳號重新登入也只斷 ACP，沒有關 Remote。這違反 R-SEC-4 的「隧道失敗／登出全撤銷」。

   - [remote-tunnel.ts:111](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/remote-tunnel.ts:111)
   - [main/index.ts:267](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/index.ts:267)
   - [main/index.ts:147](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/index.ts:147)

   此外 server 沒有明確設置 header/request/body timeouts；Origin 比對只看 host、不比對 scheme，R-SEC-0d 尚未完整落地。

4. **手機權限核准缺少足以安全判斷的摘要與完整 tuple 綁定**

   ACP 邊界只留下 title/options；snapshot 又把 title 當 summary，risk 只是從 option kind 猜測。手機看不到規格要求的操作類型、短命令／路徑與風險。

   當 `focusSessionId === null` 時，session 比對也會被略過，手機可能回覆任一 pending permission，沒有真正 fail-closed 地匹配完整 tuple。

   - [acp-client.ts:276](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/acp-client.ts:276)
   - [remote-controller.ts:281](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/remote-controller.ts:281)
   - [remote-controller.ts:330](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/main/remote-controller.ts:330)

5. **「手機 QR 遙控」沒有真正 QR、倒數與完整中文狀態**

   桌面只顯示完整 URL `<code>`，沒有 QR 元件；pairing TTL 沒有倒數，過期後桌面仍可能顯示舊 PIN。狀態直接呈現 `pairable`、`Experimental Tunnel`，手機焦點則顯示 session ID 前八碼而非對話標題。

   - [App.tsx:2279](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/renderer/src/App.tsx:2279)
   - [App.tsx:2287](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/renderer/src/App.tsx:2287)
   - [app.js:127](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/resources/remote-web/app.js:127)

   [4G checklist](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v080-4g-remote-handtest-checklist.md:1) 仍全部未勾。本環境無法補真實 4G 不算程式錯誤，但依計畫它是硬性發版閘，因此 Remote 必須 NO-GO。

6. **Session hygiene 沒有建議清理所有超過 10 天的 session**

   正式規則把「超過 10 天無活動」列為 suggested-cleanup；目前實作卻把每個 cwd 最新五個非空舊 session 重新標為 active。單一 20 天未活動的非空 session 也不會被建議，且 UI 文案宣稱會列出。

   - [session-hygiene.ts:74](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/shared/session-hygiene.ts:74)
   - [session-hygiene.test.ts:49](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/tests/session-hygiene.test.ts:49)

7. **Path chips 不是 session-scoped，圖片去重狀態可能吞掉路徑**

   `pathChips` 是全域陣列，切換 session 後會顯示上一個 session 的 chips；在另一個 session 送出還會清掉全部 chips。另若使用者移除 image attachment，對應 dedupe path 不會同步移除，送出時路徑仍被剝掉，甚至變成按「送出」完全沒有動作。

   - [App.tsx:337](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/renderer/src/App.tsx:337)
   - [App.tsx:1266](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/renderer/src/App.tsx:1266)
   - [App.tsx:2088](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/renderer/src/App.tsx:2088)

8. **Preview lightbox 的 Esc 仍會繼續清掉目前預覽**

   lightbox 與 App 都在 `window` 註冊 keydown；lightbox 只呼叫 `stopPropagation()`，無法阻止同一 target 的其他 listener。結果一次 Esc 可能同時關燈箱並清 active preview，違反「燈箱優先」。

   - [PreviewDock.tsx:88](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/renderer/src/components/PreviewDock/PreviewDock.tsx:88)
   - [App.tsx:731](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/src/renderer/src/App.tsx:731)

## 已通過與驗證缺口

- YOLO ↔ Remote 的雙向 main-process mutex 實作方向正確。
- 灰字 semantic tokens 的計算對比達標：paper meta 約 5.45–6.95:1，dark-panel meta 約 8.9:1；本次 dark/deep 截圖未見明顯死灰。
- `npm run verify`：**59 files／274 tests 全通過**，lint、typecheck、build 通過。
- `npm run smoke:ui`：**Exit 1**。三個 axe 狀態無 serious/critical violations，但 smoke 仍要求 Build／Imagine／API 三環必須出現，與 v0.8「無分項則隱藏」互相衝突：[ui_feature_smoke.mjs:59](/C:/Users/demo/Documents/grok-build-GUI/work/_upstream/work/ui_feature_smoke.mjs:59)。
- P-VIS 要求的 dark/light × main/Team × 四種狀態與 1040×680 截圖矩陣仍未提供；現有 smoke 只有部分 dark/deep 狀態，不能算完整視覺閘。

建議發布路徑：先修桌面 P1 與 smoke matrix；若要當日出 0.8.0，應硬關並移除 Remote 出貨宣稱。Remote 需完成上述 R-SEC 修正及真實 4G 清單後再重新評為 GO。