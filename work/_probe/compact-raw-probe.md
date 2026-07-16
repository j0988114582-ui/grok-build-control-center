# Compact raw ACP probe report

**Date:** 2026-07-17  
**CLI:** `C:\Users\demo\.grok\bin\grok.exe` (0.2.101)  
**Probe:** `work/_probe/compact-raw-probe.mjs` (JSON-RPC NDJSON **without** SDK closed-union parse)  
**SessionId:** `019f6bc5-67b9-7312-b285-ff55a382e537`  
**Artifacts:** `work/_probe/compact-raw-lines.jsonl` (63 lines)

## Method

1. Spawn `grok agent --always-approve --no-leader stdio`
2. Raw JSON-RPC over stdio (no `@agentclientprotocol/sdk` parse)
3. `initialize` → `session/new` → seed prompt (`PROBE_OK`) → prompt `/compact`
4. Tee all NDJSON; classify session updates + extension methods

## Answers (mission 1–4)

### 1. Does Grok emit `auto_compact_completed` (or equivalent) on wire?

**YES.**

Observed on `/compact` (manual slash). Not on standard ACP `session/update` — on the **xAI extension notification**:

```
method: "_x.ai/session_notification"
```

Standard `session/update` types seen in this run only:

- `available_commands_update`
- `user_message_chunk`
- `agent_thought_chunk`
- `agent_message_chunk`

### 2. Exact JSON shape / field names

Live capture (verbatim):

```json
{
  "jsonrpc": "2.0",
  "method": "_x.ai/session_notification",
  "params": {
    "sessionId": "019f6bc5-67b9-7312-b285-ff55a382e537",
    "update": {
      "sessionUpdate": "auto_compact_completed",
      "tokens_before": 15967,
      "tokens_after": 15967,
      "summary_preview": null
    },
    "_meta": {
      "eventId": "019f6bc5-67b9-7312-b285-ff55a382e537-29",
      "agentTimestampMs": 1784219532340
    }
  }
}
```

| Field | Notes |
|---|---|
| `method` | `_x.ai/session_notification` (not `session/update`) |
| `params.sessionId` | string |
| `params.update.sessionUpdate` | `"auto_compact_completed"` |
| `params.update.tokens_before` | number |
| `params.update.tokens_after` | number |
| `params.update.summary_preview` | string \| null (null on no-op compact) |
| `params._meta.eventId` | string |
| `params._meta.agentTimestampMs` | number |

Related: `turn_completed` is also on `_x.ai/session_notification` (same envelope), not on standard `session/update` — matches AGENTS.md note that SDK closed-union cases never fire for those custom types; the deeper truth is they may never be on `session/update` at all.

`event-adapter` already maps:

```ts
case 'auto_compact_completed':
  → kind: 'compact', before: tokens_before, after: tokens_after, summary: summary_preview
```

### 3. Does `/compact` emit a notification? Or only disk/signals change?

**Emits a notification** via `_x.ai/session_notification`.

- Seed prompt: normal turn (`agent_*` chunks + `stopReason: end_turn`, `totalTokens ≈ 15967`)
- `/compact`: **no** agent message/thought chunks; `session/prompt` result `stopReason: end_turn` with `totalTokens: 0`
- Immediately before prompt result: `auto_compact_completed` with `tokens_before === tokens_after` (no-op compact on tiny context) and `summary_preview: null`
- Also: `_x.ai/queue/changed`, `_x.ai/session/prompt_complete`, `_x.ai/sessions/changed`

Disk/signals: session deleted after probe; not required for conclusion because wire event was definitive. `signals.json` still useful for Fallback C (sharp usage drop without wire).

### 4. Recommendation: A-only vs A+C required

**A+C required (A primary).**

- **A:** Intercept raw NDJSON for `_x.ai/session_notification` with `sessionUpdate === 'auto_compact_completed'` **before** any SDK handler (SDK will never deliver this method to `session/update` handlers). Map through existing `normalizeAcpUpdate` → `kind: 'compact'`. Manual `/compact` and auto-compact share this path if both emit the same notification.
- **C:** Poll `signals.json`; if context usage drops sharply without a recent A event, show hedged 繁中 notice（「可能已壓縮上下文」）. Covers silent auto-compact / missed wire / future transport changes.

## Implementation implication

Do **not** only wrap `onNotification(session/update)`. Must tee `child.stdout` lines (or equivalent) and handle:

```
method === '_x.ai/session_notification'
  && update.sessionUpdate === 'auto_compact_completed'
```

Optional bonus: same tee can surface `turn_completed` on `_x.ai/session_notification` if product wants it later (turn completion already works via prompt response).
