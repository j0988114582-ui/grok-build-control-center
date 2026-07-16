# T4 並排穩定 — 真機雙 prompt（已跑）

## 自動化（RTL）

| 測項 | 位置 |
| --- | --- |
| 兩格並排 | `app.test.tsx` Agents Team |
| 草稿隔離 + cancel 只打焦點格 | `T4: team panes isolate drafts…` |
| 送訊路由 sessionId | `T4: sendPrompt routes…` |

`npm test` 覆蓋。

## 真機腳本（live ACP）

```bash
npx tsx scripts/t4-live-dual-prompt.ts
```

- 同一 Grok ACP 連線  
- 兩個 session 各送較長中文說明 prompt（可重疊）  
- **只 cancel A**  
- 期望：A `cancelled`、B `completed`  

### Live 結果（2026-07-16）

| 欄位 | 值 |
| --- | --- |
| 時間 | 2026-07-16T14:46:49Z → 14:46:56Z |
| CLI | `C:\Users\demo\.grok\bin\grok.exe`（0.2.101 環境） |
| 重疊 running | **是**（aRunning + bRunning，cancel 前 A 未結束） |
| A 最終 | **cancelled** |
| B 最終 | **completed** (`end_turn`) |
| strongCancel | **true** |
| 判定 | **PASS（STRONG）** |
| 產物 | `outputs/t4-live/result.json` |

備註：agent process 結束時可能印 `exited (1)`，不影響本輪判定（兩 turn 已各達終態）。

## 手冊（可選再點 GUI）

1. `npm run dev` → 開 Agents Team → 兩格  
2. 兩格幾乎同時送短任務  
3. 只停 A，看 B 是否繼續到完成  
