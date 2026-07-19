# Codex review: v0.9.0 wave [4] r3 re-review

Review `resources/remote-web/*` + `tests/remote-web-spa.test.ts`. HEAD `2593395`.

## Prior r2 FAIL (must re-verify fixed)

1. Network failures on status/actions show user-visible errors (try/catch + banners).
2. `elevationLocked` surfaced via YOLO badge text「PIN 已鎖」.
3. Tests assert `fetchSnapshotOnce` in postAction and **not** `void pollSnapshot` there; nearBottom; logout failure copy.

Also re-check r1: single poll loop, sticky scroll, logout errors.

## Verdict required
**PASS** / **PASS-with-nits** / **FAIL** for wave [5].

Write to dispatcher output path. No product code for wave 5+.
