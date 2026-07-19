# v0.9.0 Remote 可作業計畫審查（Fable 5）

| 欄位 | 內容 |
| --- | --- |
| **審查對象** | `docs/plans/2026-07-17-v0.9.0-remote-workable-fullaccess-plan.md` |
| **審查者** | claude-fable-5 · profile `fable5` · full-access |
| **審查日期** | 2026-07-17 |
| **驗證方式** | 計畫精讀 + 對照 remote-auth/controller/server/tunnel、index.ts permission/remote、remote-web、mutex |
| **結論** | **yes-after-edits**（E1–E9 已由實作代理併入計畫正文 2026-07-17） |
| **GO 建議** | 併入後 **GO** · 計畫狀態已標 **GO · 待站主開工令** · 不需整份重審 |
| **modelUsage** | `claude-fable-5` observed |

## 一句話

計畫可行、站主拍板可保留；但若不寫明「模式切換不撤銷 cookie」與「focus→ready 由 main 負責」，實作會沿用 0.8.0 互斥／revoke 語意，導致**人在外面開 YOLO 即自鎖**或 **focus 永遠 not_ready**。

## P0（擋 GO）

### P0-1 手機開 YOLO 即自鎖

現碼 `onPermissionModeChanged` 對任何模式切換 `auth.revokeAll()`。計畫只寫 YOLO off 保 session、桌面開 YOLO 不強制撤銷，**漏掉 elevate 成功不得撤銷 cookie**。人在外開 YOLO → cookie 作廢 → 需回桌面重配對。

### P0-2 focus→ready 生命週期無規格

`markReady` 只在 load/create；YOLO 切換 `disconnectAcp` 清空 ready。未定義誰 load、loading 狀態、重連後誰恢復 focus session ready。

## P1

1. `remote-yolo-mutex.ts` 與全呼叫點漏列 → 開 YOLO 後 prompt 403  
2. cwd-union 需請求當下重算 + normalize 精確比對 + markReady 副作用  
3. 手機 logout 二次確認（否則誤觸失聯）  
4. 無限頂部載入縮成加大 tail（勿偷長 transcript-reader）  
5. elevate rate limit + 失敗鎖入 snapshot  

## P2

§2.2 自相矛盾句、focus 雙寫 provenance、rate limit 預算、focus id 驗證、T1 邊界、QR 依賴名、Quick URL 變更=重配對。

## 與現碼

多數延伸骨架；T1 真擋 tool output；health Host 已修；重開/72h 自洽；4G 防假完成已寫。

## 安全取捨

站主知情可接受，前提：P0 修復 + 威脅模型寫清（手機被竊 + YOLO ≤72h）+ kill switch。

## 必改條文 E1–E9

見計畫 §14（已併入）。

## 特別檢查

| 點 | 結果 |
| --- | --- |
| 72h+YOLO+Quick | P0-1 致命洞需修 |
| focus vs ready | P0-2 |
| cwd 注入 | E4 後無面 |
| T1 | 真擋 |
| 重開 vs 72h | 自洽 |
| 4G SKIP | 已防呆 |
