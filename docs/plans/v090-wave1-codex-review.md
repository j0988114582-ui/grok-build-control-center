**FAIL** — wave [2] should not proceed yet.

Review written to [v090-wave1-codex-review.md](</C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave1-codex-review.md:1>).

Four Important blockers:

- Queue can send an `s1` prompt to newly focused `s2`.
- cwd-union authorization uses stale cache when listing fails.
- Session creation reports success despite focus/ready failure.
- Reconnect restoration can overwrite a newer focus state.

Verification passed: targeted 13/13 tests, full 286/286 tests, typecheck, and targeted lint. No product code was changed.