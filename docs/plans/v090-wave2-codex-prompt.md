# Codex review: v0.9.0 wave [2] r2 re-review

Plan: `docs/plans/2026-07-17-v0.9.0-remote-workable-fullaccess-plan.md` wave [2] + §2.4 ACL.

Review:
- `src/main/remote-server.ts`
- `tests/remote-server.test.ts`
- `src/main/index.ts` RemoteController composition + `applyAgentPermissionMode`
- `tests/remote-main-wiring.test.ts`

## Prior FAIL blocker (must re-verify fixed)

Real `index.ts` must inject loadSession/createSession/setModel/setMode/interject/setPermissionMode with SessionReadyGate.markReady, PreviewRootTracker.setSessionCwd, and restoreFocusAfterReconnect after YOLO reconnect — not just unit mocks.

## Deliverables claimed
- Full phone API routes (no upload)
- Host/Origin/cookie/header security
- Integration tests: elevate+cookie+restore+prompt; cwd reject; 72h; elevation lock; YOLO off keeps session
- Main composition wiring + regression test

## Verdict required
**PASS** / **PASS-with-nits** / **FAIL** for wave [3].

Write review to dispatcher output path. No product code for wave 3+. Run tests if needed.
