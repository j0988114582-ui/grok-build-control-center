# v0.8.0 Remote 4G 手測清單（發版閘）

| 欄位 | 內容 |
| --- | --- |
| **狀態** | 本實作環境 **未完成** 真實 4G 手測（文件化） |
| **日期** | 2026-07-17 |
| **結論** | CI / 本機可 SKIP live tunnel；**不得**當發版豁免。Remote 出貨前必須補完本清單並勾選。 |

## 環境紀錄（手測時填）

| 項目 | 值 |
| --- | --- |
| 桌面 OS / 版本 | |
| Grok Build GUI 版本 | 0.8.0 |
| cloudflared 版本 / 雜湊 | |
| 隧道模式 | Quick（Experimental） / Named+Access |
| 手機 OS / 瀏覽器 | |
| 網路 | 真實 4G（關閉 Wi‑Fi） |
| 測試者 | |
| 日期時間 | |

## 正向

- [ ] 桌面 YOLO=每次詢問；啟用 Remote；Quick 風險確認文案含「供應商可處理 HTTP 內容」
- [ ] nonce health 通過後才顯示 QR／公網 URL
- [ ] 手機掃碼 → fragment 剝除 → PIN 配對 → Set-Cookie 成功
- [ ] snapshot 輪詢：狀態、簡化 session 列表（無 cwd）、tail、權限卡
- [ ] 送出 prompt（伺服端焦點 session）；桌面標記「來自手機遙控」
- [ ] cancel 停止回合
- [ ] （若開「允許手機核准權限」）permission.respond 正確選項通過；錯 option 拒
- [ ] 切斷／disable：tunnel 殺、HTTP 關、token 全撤

## 負面

- [ ] 無 cookie 呼叫 `/api/snapshot` → 401
- [ ] 無 `X-Grok-Remote` mutation → 403
- [ ] 錯 PIN ×5 → pairing 作廢需桌面再產
- [ ] 過期 pairing → 失敗，不自動無限換碼
- [ ] 偽造 requestId / 他 session option → 拒
- [ ] client 帶 sessionId 不能改焦點（prompt 不信任 client sessionId）
- [ ] YOLO 開啟時無法 enable Remote；Remote 開啟時無法 YOLO
- [ ] 關 Remote 後公網 URL 失效

## 本環境實作時已完成（單元／本機）

- 單元：TTL、PIN 作廢、allowlist、物件級 permission、YOLO 互斥、DTO redaction
- 本機 HTTP：`remote-server` 負面測試（cookie / header / pair / CSP）
- **未完成**：真實 4G 手機 + Quick Tunnel 錄影

## 建議發版策略

若 4G 未完成：文件註明 **Remote = 實驗**；桌面 §1.1–1.5 仍可出 0.8.0；勿宣稱生產級外網遙控。
