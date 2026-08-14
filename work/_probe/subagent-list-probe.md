# `_x.ai/subagent/list_running` shape probe
**Date:** 2026-08-14T03:06:59.941Z  •  **poll:** every 1500ms
- baseline (before the turn): `{"subagents":[]}`
- non-empty samples: **11**, peak concurrent: **1**
- turn: stopReason=end_turn
## Entry fields
| field | type |
| --- | --- |
| `subagentId` | string |
| `parentSessionId` | string |
| `childSessionId` | string |
| `subagentType` | string |
| `description` | string |
| `startedAtEpochMs` | number |
| `durationMs` | number |
| `turnCount` | number |
| `toolCallCount` | number |
| `tokensUsed` | number |
| `contextWindowTokens` | number |
| `contextUsagePct` | number |
| `toolsUsed` | array |
| `errorCount` | number |
**`_x.ai/subagent/get` snapshot keys:** `snapshot`
**Session update kinds seen:** `available_commands_update`, `model_changed`, `user_message_chunk`, `agent_thought_chunk`, `session_summary_generated`, `session_info_update`, `agent_message_chunk`, `tool_call_delta_chunk`, `response_completed`, `tool_call`, `pending_interaction`, `tool_call_update`, `interaction_resolved`, `subagent_spawned`, `subagent_progress`, `turn_completed`, `subagent_finished`
