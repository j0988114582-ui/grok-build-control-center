# Wave B 驗證報告（cloudflared + Quick Tunnel + 手機比例 SPA）

| 欄位 | 內容 |
| --- | --- |
| **日期** | 2026-07-18 |
| **Overall** | **PASS**（B0–B3） |
| **cloudflared** | `2026.7.2` @ `%USERPROFILE%\.cloudflared\cloudflared.exe`（並複製到 `%USERPROFILE%\.grok\bin\`） |
| **煙測** | `npx tsx work/wave_b_remote_smoke.ts` → `outputs/wave-b-smoke/result.json` |

## 閘門

| 閘 | 結果 | 說明 |
| --- | --- | --- |
| **B0 cloudflared 安裝** | **PASS** | GitHub release `2026.7.2` windows-amd64；兩候選路徑皆有 |
| **B1 Quick Tunnel health** | **PASS** | 公網 `/api/health?nonce=` 約第 4 次重試成功（URL 印出後需數秒） |
| **B2 手機比例配對頁** | **PASS** | viewport 390×844；PIN 鍵盤可見；fragment secret 剝除 |
| **B3 配對進主殼** | **PASS** | PIN 配對 → 主殼；可開對話列表、送出 |

## 截圖

- `outputs/wave-b-smoke/b2-pair-page.png` — 配對 PIN 鍵盤
- `outputs/wave-b-smoke/b3-main-shell.png` — 主殼
- `outputs/wave-b-smoke/b3-sessions.png` — 對話列表
- 其餘 after-pair / focused / after-send

## 產品修正（本波）

| 項目 | 檔案 |
| --- | --- |
| 隧道 health **重試**（Quick Tunnel 延遲可達） | `src/main/index.ts` |
| 配對後**自動聚焦**第一個 session | `resources/remote-web/app.js` |
| composer **sticky 底欄** | `resources/remote-web/index.html` + `app.css` |
| session 標題／cwd **ellipsis** | `resources/remote-web/app.css` |

## 環境

- 本機手動 tunnel 探針：`http://127.0.0.1:origin` → trycloudflare **200**
- 首次煙測 health 失敗原因：URL 剛印出尚未路由；改 12 次 × 2s 重試後穩定

## 誠實邊界

- 本波為 **Chromium 手機比例 + 公網 Quick Tunnel**，**不是**真 4G 手測清單全勾。
- Remote 仍標 **實驗** 直至真人 4G checklist。
- Quick Tunnel 無 SLA；URL 每次啟用會變。

## 如何重跑

```powershell
# cloudflared 已裝在：
#   %USERPROFILE%\.cloudflared\cloudflared.exe
npx tsx work/wave_b_remote_smoke.ts
```

桌面 GUI：設定 → 勾 **Quick Tunnel** → 啟用 → 掃 `https://….trycloudflare.com` QR。
