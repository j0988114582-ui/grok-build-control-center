# T4 Live smoke — overlapping dual-session prompts

## Procedure (manual / operator)

1. Same Grok ACP connection in GUI (or CLI equivalent).
2. Load session A and session B (or create two).
3. Start minimal prompt on A and B so turns **overlap**.
4. Verify events route by sessionId; runningMap independent.
5. Cancel A; confirm B continues to stopReason independently.
6. Record CLI version, timestamps, result.

## Automated unit coverage (proxy)

- `session-readiness.test.ts` — generation / create-or-load ready
- `team-reconnect.test.ts` — focus restore
- App RTL Agents Team two panes

## Live run result (fill when executed)

| Field | Value |
| --- | --- |
| Date | _pending operator_ |
| CLI version | |
| Overlap prompts | not run in this CI wave (optional live) |
| Cancel A ≠ stop B | |
| Notes | Unit/RTL green; full T4 live deferred to operator with Grok quota |

Plan allows documenting live outcome; core gates are verify + readiness tests.
