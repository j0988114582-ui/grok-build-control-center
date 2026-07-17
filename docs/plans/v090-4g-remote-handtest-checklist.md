# v0.9.0 Remote 4G 手測清單（發行硬閘）

| 欄位 | 內容 |
| --- | --- |
| **狀態** | 本實作環境 **未完成** 真實 4G 手測（文件化） |
| **日期** | 2026-07-17 |
| **結論** | 單元／整合／`npm run verify` **不可**代替本清單。**未勾滿不得宣稱 0.9 Remote 完成**；失敗則 Remote 保持「實驗」。 |

## 環境紀錄（手測時填）

| 項目 | 值 |
| --- | --- |
| 桌面 OS / GUI 版本 | 0.9.0-pre / |
| Grok CLI 版本 | |
| cloudflared 路徑／版本 | |
| 隧道模式 | Quick（實驗）／僅 loopback |
| 手機 OS / 瀏覽器 | |
| 網路 | **真實 4G**（手機關閉 Wi‑Fi） |
| 測試者 | |
| 日期時間 | |
| 公網 URL 前綴（可脫敏） | `https://….trycloudflare.com` |

## A. 啟用與書籤

- [ ] 桌面啟用 Remote；若 YOLO 已開 → 風險確認後仍可開
- [ ] Quick Tunnel：風險文案含供應商可處理 HTTP 內容／無 SLA
- [ ] 桌面顯示本機 QR（`qrcode`，不上第三方 API）
- [ ] 「複製配對網址」可用；URL 為 `/#/pair?t=…`（secret 在 fragment）
- [ ] 文案含 **72h 絕對期限**、App 重啟須重配、Quick URL 變更需更新書籤
- [ ] 手機 4G 開書籤／掃碼；配對頁 PIN 鍵盤可用

## B. 配對與時鐘

- [ ] 掃碼後 fragment 被剝除（網址列不留 secret）
- [ ] 正確 PIN → cookie 配對成功 → 進主殼
- [ ] 錯 PIN 有中文錯誤；連續失敗行為符合 rate/lock（pairing）
- [ ] 頂欄顯示 72h 倒數（或剩餘時間）
- [ ] 切斷／disable 後舊 cookie 401；需重掃
- [ ] **App 重啟後**舊 cookie 失效，必須重掃（記憶體 session）

## C. Session／焦點／任務（DoD §7.1）

- [ ] 對話列表顯示 title + cwd 短顯 + running
- [ ] 點選對話 → 桌面 active **對齊**；`focusStatus` 就緒後可送
- [ ] 送出文字 prompt → 桌面 notice「來自手機遙控」
- [ ] transcript 為 T1 tail（無 thought 全文、工具僅 title+status）
- [ ] **插話**（執行中）成功；桌面可見
- [ ] **停止** cancel 成功
- [ ] **排隊下一輪**（手機）→ 回合結束後自動送；桌面顯示 provenance「手機」
- [ ] **立刻改做**（執行中）取消後新 prompt
- [ ] 桌面與手機排隊 **最後寫入者勝**（各寫一次驗證）

## D. 模型／模式／新建

- [ ] 切 model / mode（溢位選單）成功
- [ ] 新建 session：cwd **∈ 聯集** 成功並聚焦
- [ ] cwd **∉ 聯集** 被拒（中文錯誤）
- [ ] 無上傳 UI／API

## E. YOLO 共存（0.9 契約）

- [ ] 手機開 YOLO：需 **PIN**；成功後 cookie **仍有效**
- [ ] YOLO 重連後 focus 自動 ready，**同一 cookie** 可再 prompt
- [ ] 手機關 YOLO：無 PIN；**Remote 仍連線**
- [ ] 桌面 YOLO 切換 **不**撤銷 Remote session
- [ ] elevate PIN 連錯 5 次 → elevation 鎖；session 仍在；regenerate 後可再 elevate

## F. 切斷與安全負面（4G 上抽樣）

- [ ] 切斷二次確認文案含「需回電腦重新配對」
- [ ] 切斷後公網／loopback API 不可用或 401
- [ ] 無 cookie → snapshot 401
- [ ] 無 `X-Grok-Remote` mutation → 403

## 本環境已完成（非 4G）

- 單元／整合：72h、PIN elevate、cwd-union、T1、YOLO 共存、focus/queue E9、server 負面
- `npm run verify`：326 tests + lint + typecheck + build（wave [6]）
- **未完成**：真實 4G 手機 + Quick Tunnel 全程勾選

## 發版策略

| 4G 結果 | 宣稱 |
| --- | --- |
| 全勾通過 | 可稱 0.9 workable remote（仍標單人高風險／Quick 實驗） |
| 未測或失敗 | **Remote = 實驗**；不可寫「0.9 遠端完成」 |

測試者簽名：____________  日期：____________
