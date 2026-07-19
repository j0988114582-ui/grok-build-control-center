**FAIL** for wave [2].

Review written to [v090-wave1-codex-review.md](C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave1-codex-review.md:1).

Four Important blockers:

- Invalid focus requests can strand a valid session in `loading`.
- Disabling Remote does not cancel pending focus operations.
- Successful session creation can be reported as failure if disk indexing is delayed.
- T1 tail enforces characters, not the planned 64 KiB payload bound.

Verification passed: targeted 19/19 tests, full 292/292 tests, typecheck, and scoped ESLint. Three temporary probes reproduced the behavioral failures and were removed. No product or test code was changed.