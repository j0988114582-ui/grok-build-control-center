# T4 並排穩定 — 檢查清單（白話）

目標：確認 **Agents Team 兩格** 不會互相搶、取消一格不會殺另一格。

## 自動化（本 repo 已測）

| 測項 | 位置 |
| --- | --- |
| 兩格並排出現 | `app.test.tsx` Agents Team |
| 草稿互不覆蓋 | `T4: team panes isolate drafts…` |
| 雙 running 只 cancel 焦點格 | 同上 |
| 送訊路由到正確 sessionId | `T4: sendPrompt routes…` |
| readiness / reconnect helpers | `session-readiness` / `team-reconnect` / `session-ready-gate` |

跑：`npm test`

## 真機手冊（約 2～3 次短 prompt，吃 Grok 額度）

### 準備
1. `npm run dev` 開 GUI  
2. CLI 已登入（`grok --version` 正常）  
3. 開啟 **Agents Team**  
4. 載入或建立 **兩個** session（不同專案資料夾更清楚）

### 步驟
| 步 | 做什麼 | 期望 |
| --- | --- | --- |
| 1 | 格 A 輸入：`回覆一字：A` 並送出 | A 顯示執行中 |
| 2 | **立刻** 格 B 輸入：`回覆一字：B` 並送出 | B 也執行中（兩格同時 busy） |
| 3 | 在 A 按 **停止** | 只有 A 停；B 仍繼續或正常結束 |
| 4 | 看 B 是否還有完整回覆 | B 不應被 A 的停止帶走 |
| 5 | 換焦點到 B，在 B running 時只停 B | A 不受影響 |

### 結果記錄

| 欄位 | 值 |
| --- | --- |
| 日期 | 2026-07-16 |
| CLI | grok 0.2.101（環境曾偵測） |
| 自動化 T4 proxy | **pass**（RTL，見上方） |
| 真機重疊 prompt | _站主可選填：pass / fail / 未跑_ |
| Cancel A ≠ 停 B | _同上_ |
| 備註 | 執行線以 RTL 加固為主；真機步驟供站主 2 分鐘點完 |

## 若真機失敗

記：哪一格、按了什麼、畫面文案；開 issue 或貼給執行線修。
