# Codex review: v0.9.0 wave [1] only

Plan: `docs/plans/2026-07-17-v0.9.0-remote-workable-fullaccess-plan.md` wave [1] + E2/E4/E9.

Review only `src/main/remote-controller.ts` and `tests/remote-controller.test.ts` (and deps signatures).

## Deliverables claimed
- focus→ready: `handleFocus` main `loadSession`, `focusStatus` loading/ready/error, `restoreFocusAfterReconnect`
- cwd-union: `normalizeCwdKey`, exact match only, `handleCreateSession`
- YOLO: `handleYoloEnable` via `verifyElevationPin`, `handleYoloDisable`
- model/mode/interject/do-now/queue (main single-slot, last writer)
- Tests cover focus load, cwd reject, yolo PIN, queue drain

## Verdict required
**PASS** / **PASS-with-nits** / **FAIL** for wave [2].

Write `docs/plans/v090-wave1-codex-review.md`. No product code for wave 2+. Run tests if needed.
