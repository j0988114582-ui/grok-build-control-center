# v0.8.0 Remote 4G 手測清單（發版閘）

CI 可 SKIP live tunnel，**不可**當作發版豁免。Remote 若出貨，須完成下列手測並勾選。

## 環境紀錄

| 欄位 | 填寫 |
| --- | --- |
| 日期 | |
| 桌面 OS / 版本 | Windows / GUI 0.8.0 |
| 手機 / 瀏覽器 | |
| 網路 | 4G（關閉 Wi‑Fi） |
| Tunnel | Quick（Experimental） / Named+Access |
| cloudflared 版本 | |
| 測試者 | |

## 正向

- [ ] 桌面權限為「每次詢問」；YOLO 關閉
- [ ] 啟用遙控後出現 PIN；QR / 配對 URL 僅在 health 通過後
- [ ] 手機掃碼 → fragment 立刻消失 → 輸入 PIN 成功
- [ ] snapshot 輪詢可見焦點對話精簡 tail（無 thought / 完整 tool output）
- [ ] 送出提示；桌面標記「來自手機遙控」
- [ ] 停止回合
- [ ] （若開啟「允許手機核准權限」）權限卡可核准/拒絕正確選項
- [ ] 切斷後手機立即 401；桌面 PIN/配對作廢

## 負向

- [ ] YOLO 開啟時無法啟用 Remote；Remote 開啟時無法開 YOLO
- [ ] 錯 PIN ×5 → 配對作廢，需桌面重產
- [ ] 無 cookie 呼叫 `/api/snapshot` → 401
- [ ] 無 `X-Grok-Remote` 的 POST → 403
- [ ] 偽造 `requestId` / `optionId` → 拒
- [ ] 關桌面遙控 / 關 tunnel / 重啟 app → 舊 cookie 失效
- [ ] Host/Origin 異常請求被拒（若可構造）

## 隱私誠實

- [ ] UI 文案說明 Cloudflare 終止 TLS、可處理 HTTP 內容（非「僅 SNI」）

## 結論

- [ ] **Remote GO**（可出 Remote）
- [ ] **Remote NO-GO**（桌面功能仍可出 0.8.0；CHANGELOG 註明 Remote 未出或實驗）

### 本次結果

（實作環境若無法完成真實 4G：勾 NO-GO 或「本機 loopback 已驗證、4G 待補」並在 CHANGELOG 誠實記載。）
