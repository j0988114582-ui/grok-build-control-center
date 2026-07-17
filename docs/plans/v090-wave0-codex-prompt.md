# Codex review: v0.9.0 wave [0] only

## Scope
Review **only wave [0]** implementation against plan:
`docs/plans/2026-07-17-v0.9.0-remote-workable-fullaccess-plan.md` (§6 wave [0], E1/E3/E7/E8 contract pieces in auth/mutex/protocol).

Workdir: `C:\Users\demo\Documents\grok-build-GUI\work\_upstream`

## Wave [0] intended deliverables
1. `remote-protocol.ts`: 72h absolute, no idle disconnect, tail 120/64KB, elevation/focus snapshot fields
2. `remote-auth.ts`: 72h session; elevation PIN after pair; 5-fail lock; regenerate unlocks
3. `remote-yolo-mutex.ts`: coexistence (not hard block); PIN elevation helper copy
4. Controller/index: mode change **must not** revoke remote session; remove yolo_conflict hard refuse on pair/prompt
5. `qrcode` dependency added
6. CHANGELOG 0.9.0 draft risk language
7. Tests green for remote-auth, remote-yolo-mutex, remote-controller, remote-server

## Do
- Read the changed files and tests; run `npm test -- tests/remote-auth.test.ts tests/remote-yolo-mutex.test.ts tests/remote-controller.test.ts` if useful
- Verdict: **PASS** / **PASS-with-nits** / **FAIL** for advancing to wave [1]
- List P0 that block wave [1]; P1 nits optional
- Write result to `docs/plans/v090-wave0-codex-review.md`
- Do **not** implement wave [1]+; do not push

## Focus checks
- E1: onPermissionModeChanged does not revokeAll
- Elevation PIN retained after pair closed
- canEnableYolo(remote) is ok (coexistence)
- Absolute 72h constants match plan
- No idle expiry in validateSession
