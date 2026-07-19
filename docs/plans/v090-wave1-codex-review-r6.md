**FAIL** for wave [2].

Review written to [v090-wave1-codex-review.md](C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave1-codex-review.md).

Three Important findings:

- Pre-disable focus can revive after disable→re-enable.
- Concurrent valid focus requests can violate last-writer-wins.
- `getSnapshot()` hides an optimistic newly created session while disk indexing lags.

Prior blockers 1 and 4 are fixed; blocker 3’s create/focus path is fixed. Verification passed: 26/26 targeted tests, ESLint, and typecheck. Product/test code was not modified.