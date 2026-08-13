# ACP 1.0.3 capability probe

**Date:** 2026-08-13T14:29:57.926Z  
**CLI:** `grok 1.0.3 (1a29d5bc12) [stable]`  
**agentVersion:** `1.0.3`  
**Transport:** JSON-RPC NDJSON over grok agent --no-leader stdio (no SDK closed union)  
**CWD:** `<probe-cwd>` (os.tmpdir mkdtemp)  
**SessionId:** redacted  
**Error:** none

## Method

1. Spawn `grok agent --no-leader stdio` (same as `buildAgentArgs()`; no `--always-approve`)
2. Speak JSON-RPC NDJSON **without** `@agentclientprotocol/sdk` closed-union parse
3. `initialize` → `session/new` (empty temp cwd, no prompt)
4. Probe rewind **points** and subagent **list_running / get** (official `x.ai/…` and GUI underscore forms)
5. **Not called:** `x.ai/rewind/execute`, `x.ai/subagent/cancel`
6. Best-effort session cleanup via ACP `session/delete` or CLI `grok sessions delete`

## Probe table

| Method | Result | Detail |
| --- | --- | --- |
| `x.ai/rewind/points` | method-not-found | `-32601` Method not found |
| `_x.ai/rewind/points` | ok | `{"type":"object","keys":["rewind_points"],"rewind_pointsCount":0}` |
| `x.ai/subagent/list_running` | method-not-found | `-32601` Method not found |
| `_x.ai/subagent/list_running` | ok | `{"type":"ext-method-result","keys":["subagents"],"wrap":"result","subagentsCount":0}` |
| `x.ai/subagent/get` | method-not-found | `-32601` Method not found |
| `_x.ai/subagent/get` | ok | `{"type":"ext-method-result","keys":["snapshot"],"wrap":"result","snapshot":null}` |
| `x.ai/rewind/execute` | not probed | destructive |
| `x.ai/subagent/cancel` | not probed | could affect other sessions |

## Loop advertised?

| Source | `loop` present | Command names |
| --- | --- | --- |
| `initialize._meta.availableCommands` | no | `compact`, `always-approve`, `context`, `session-info`, `deep-research`, `workflow`, `goal` |
| `session/new` response | no | _(none in response)_ |
| `available_commands_update` | yes | `compact`, `always-approve`, `context`, `plugins`, `reload-plugins`, `session-info`, `feedback`, `deep-research`, `workflow`, `goal`, `loop`, 40 other commands (local skills/plugins; names redacted) |

**Advertised on this live session:** yes

Incoming notification methods observed: `_x.ai/mcp/servers_updated`, `_x.ai/models/update`, `_x.ai/settings/update`, `_x.ai/announcements/update`, `_x.ai/mcp/init_progress`, `session/update`, `_x.ai/session_notification`, `_x.ai/mcp/server_status`, `_x.ai/mcp/tools_changed`, `_x.ai/mcp_initialized`

Initialize `agentCapabilities` keys: `loadSession`, `promptCapabilities`, `mcpCapabilities`, `sessionCapabilities`, `auth`, `_meta`

## Session cleanup

deleted via CLI `grok sessions delete` (no ACP session/delete)

## Honesty implications (evidence only)

- Rewind UI / execute was **not** implemented from this probe. Classification of `*/rewind/points` is the only rewind reachability signal.
- Subagent ACP console / cancel was **not** implemented. `list_running` / `get` classification is the only control-method signal; spawn/finish cards remain a separate notification path.
- `loop` is a slash command advertisement, not an ACP method. This probe did not invent or call a loop RPC.

## Artifacts

- Sanitized report: `work/_probe/acp-103-capability-probe.md`
- Raw dump (gitignored, may contain session ids / local paths): `work/_probe/acp-103-capability-probe.local.json`
