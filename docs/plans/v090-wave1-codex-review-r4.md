**FAIL** for wave [2].

Review written to [v090-wave1-codex-review.md](C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave1-codex-review.md).

Four Important blockers:

- Rejected focus requests still replace the authoritative focus.
- Existing drive-root cwd such as `C:\` is rejected.
- Interject/do-now can act while focus is loading or not ready.
- Queue reports success but silently drops items during loading.

Verification passed: targeted 19/19 tests, full 292/292 tests, typecheck, and targeted ESLint. No product or test code was changed.