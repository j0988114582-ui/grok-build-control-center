# Fable 5 計畫審查任務（只審計畫，不寫產品碼）

你是 **claude-fable-5**，對 Grok Build Control Center 的 **v0.9.0 可作業遙控計畫**做獨立計畫審查。

## 權威計畫

`docs/plans/2026-07-17-v0.9.0-remote-workable-fullaccess-plan.md`

## 工作目錄

`C:\Users\demo\Documents\grok-build-GUI\work\_upstream`

## 你必須做的事

1. **精讀**計畫全文（一次讀完即可）。
2. **對照現行程式**（用 Read/Grep，控制在必要範圍，勿無限探索）：
   - `src/main/remote-auth.ts`、`remote-controller.ts`、`remote-server.ts`、`remote-tunnel.ts`
   - `src/main/index.ts` 中 remote / permission-mode 相關
   - `src/shared/remote-protocol.ts`、`remote-yolo-mutex.ts`
   - `resources/remote-web/app.js`（現況能力）
3. **不寫任何產品碼**。
4. **在結束前**把完整審查**寫入檔案**（必須用 Write 工具，勿只聊天）：

`C:\Users\demo\Documents\grok-build-GUI\work\_upstream\docs\plans\v090-remote-plan-FABLE5-REVIEW.md`

5. 時間有限：讀夠就下結論；P0/P1 要具體可改條文。

## 審查輸出格式（必須）

```markdown
# v0.9.0 Remote 可作業計畫審查（Fable 5）

| 欄位 | 內容 |
| 結論 | GO / yes-after-edits / Request-changes / NO-GO |
| GO 建議 | ... |

## 一句話

## P0（擋 GO）
## P1
## P2
## 與現碼落差（計畫可行？）
## 安全取捨是否站主知情且可接受
## 波次是否可執行
## 必改條文清單（若 yes-after-edits / Request-changes）
```

## 特別檢查

- 72h 無 idle + 遠端 YOLO + Quick Tunnel 公網：是否有未寫明的致命洞（例如 elevate PIN 生命週期、YOLO 重連與 Remote cookie、health Host allowlist）。
- 手機 focus 權威 vs 桌面 loadSession 就緒閘。
- cwd 聯集新建是否 path 注入／跳脫 allowlist。
- T1 redaction 是否真擋 tool output。
- 「App 重開必重掃」與「72h 重算」是否一致。
- 波次 [7] 4G 是否被寫成可 SKIP 的假完成。

## 禁止

- 不要因「單人高風險」空泛 NO-GO；若風險可接受須寫清前提；若不可接受給**最小**收斂。
- 不要修改產品原始碼。
- 不要 push。
