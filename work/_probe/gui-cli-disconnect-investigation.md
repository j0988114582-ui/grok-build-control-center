# 「GUI↔CLI 連線會掉」調查報告

**日期：** 2026-08-14
**CLI：** grok 1.0.3 (stable)
**起因：** `HANDOFF-next-session-20260813.md` §1 記載「一個 session 內斷線 5 次，本身就是 v13 GUI 的 bug 訊號——CLI 端全程正常，是 GUI↔CLI 那條連線在掉」。

---

## 結論（兩件事，要分開看）

1. **原始那次事故不是 GUI 造成的。** 出事的 session 從頭到尾沒有走過 ACP，GUI 沒參與。原假設證偽。
2. **但同一個區域確實有一個真的 GUI bug：** GUI 沒有實作 `_x.ai/exit_plan_mode`，所以**任何**在 GUI 裡進入規劃模式的對話，最後都會靜默失敗。已修復並經真機 GUI 驗證。

---

## 1. 原假設證偽

出事的 session：`<sessionId>`（本機 id 已遮蔽），cwd 為本專案根目錄。

`chat_history.jsonl` 裡確實有 4 筆 `exit_plan_mode` 的 tool_result：

> Plan approval could not be completed because the client disconnected. Plan mode remains active; the approval will reappear on reconnect.

但 `~/.grok/logs/unified.jsonl`（CLI 自己的日誌，事故時段 13:00–16:00 UTC）顯示：

| 事實 | 證據 |
| --- | --- |
| 該 session 全程只在 **pid 28228** 上執行 | 702 筆日誌全部同一 pid |
| pid 28228 **從未做過 ACP initialize** | `auth: initialize() built auth_methods for ACP response` 不曾出現在該 pid |
| pid 28228 同時服務 **18 個 session** | 是常駐處理程序，不是 GUI 派生的 `grok agent stdio` |
| 事故時段真正的 ACP 連線共 7 條 | 5 條 `GROK_CLIENT_VERSION=0.13.0`（GUI）、2 條 `acp-103-capability-probe` |
| 這 7 條**沒有任何一條碰過**出事的 session | 逐 pid 比對 sid 集合，交集為空 |
| 5 條 GUI 連線全部是稽核腳本，且 **0 錯誤 0 警告** | cwd 分別為 `grok-gui-v013-audit-*`(×2)、`grok-gui-wave1-*`、`grok-gui-wave2-*`、`grok-gui-wave3-*` |

另外，`chat_history.jsonl` 內 5 筆 `Grok Build GUI` 字串**全部是代理在讀本專案原始碼**（`acp-client.ts`、`AGENTS.md`），不是 CLI 記錄到有 GUI 用戶端連上。

> **判定：** 那是一個終端（TUI）driven 的 session。CLI 二進位內的字串
> `crates/codegen/xai-grok-pager/src/app/acp_handler/interactions.rs` 顯示 TUI 自己也是 leader 的 ACP client，
> 另有 `exit_plan_mode for a session with no local view; parked for leader replay-on-attach`。
> 「client disconnected」指的是那條 TUI↔leader 連線，與 Grok Build GUI 無關。

---

## 2. 真正的 GUI bug（已修）

### 根因

`GrokAcpClient` 只註冊了一個 client 端請求處理器：

```ts
.onRequest(acp.methods.client.session.requestPermission, …)
```

代理規劃完成時會對 client 送出**擴充方法** `_x.ai/exit_plan_mode`。沒有處理器 → `@agentclientprotocol/sdk`
以 `-32601 Method not found` 回應 → CLI 判定用戶端不在了。

CLI 二進位內對應字串：

```
[exit_plan_mode] intercepted, sending ext_method to client
exit_plan_mode: client disconnected mid-approval; plan mode stays active
Plan approval could not be completed because the client disconnected. …
```

### 線上實測（`work/plan_mode_acp_probe.mjs`）

用**與 GUI 完全相同的 client 形狀**（`clientCapabilities: { fs, terminal: false, plan: {} }`，只註冊
`session/request_permission`，其餘一律回 `-32601`）對真 CLI 跑規劃模式：

| 對 `_x.ai/exit_plan_mode` 的回應 | 回合結果 |
| --- | --- |
| `-32601`（＝修復前的 GUI） | **`stopReason=cancelled`**，規劃模式卡在 Active |
| `{"approved":true}` | `stopReason=end_turn` |
| `{"approved":false,"feedback":…}` | `stopReason=end_turn` |

### 線路契約

```
request   _x.ai/exit_plan_mode  { sessionId, toolCallId, planContent }
response  ExitPlanModeExtResponse { approved: boolean, abandoned: boolean }
```

`planContent` 可能為空字串（代理可以不寫 plan.md 就退出規劃模式）。
回應欄位名取自二進位 rodata：`approvedabandoned` 緊鄰
`ExitPlanModeExtResponse serialization should not fail` 與
`crates/codegen/xai-grok-pager/src/views/plan_approval_view.rs`。

三個決定對應 CLI 自己的核准畫面（Approve / Request changes / Quit）：

| GUI 按鈕 | 回應 | 語意 |
| --- | --- | --- |
| 核准，開始實作 | `{ approved: true, abandoned: false }` | 離開規劃模式開始實作 |
| 請它修改 | `{ approved: false, abandoned: false }` | 退回規劃，規劃模式續留 |
| 放棄這個計畫 | `{ approved: false, abandoned: true }` | 丟掉計畫並關閉規劃模式 |

### 安全預設

連線中斷、切換權限模式（會 disconnect/reconnect）、`session/cancel`、關閉程式時，
未回答的核准一律以 `PLAN_APPROVAL_FALLBACK = 'request-changes'`（`approved: false`）結案。
**絕不因為連線掉了就視為同意開工。**

---

## 3. 驗證

- 單元：`tests/plan-approval.test.ts`、`tests/app.test.tsx`（68 檔 / 490 項全過，lint + typecheck + build 綠）
- 真機 GUI：`work/wave_plan_approval_gui_audit.mjs` → `output/playwright/wave-plan-approval/`（6/6）
  計畫內容以 markdown 呈現、三個選項齊備、核准後對話框關閉、逐字稿無斷線訊息。
- 迴歸：`work/wave_active_filter_gui_audit.mjs` 18/18 仍全過。

## 4. 沒做的事

- 沒有改動 leader／TUI 那條連線的行為（不是本專案的程式）。
- 手機遙控端沒有計畫預覽介面，`onPlanApproval` 目前只送桌面端。
- 「請它修改」不會自動送出意見文字：ACP 回應只有兩個布林欄位，CLI 是把意見當成下一則 prompt 收。使用者按完可以直接在對話框打字。
