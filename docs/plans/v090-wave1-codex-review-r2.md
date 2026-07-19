**FAIL** — wave [2] should not proceed yet.

Review written to [v090-wave1-codex-review.md](</C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave1-codex-review.md:1>).

Blocking findings:

- `handleDoNow` can send an s1 replacement prompt to newly focused s2.
- Concurrent focus requests can let an older request overwrite the latest focus.
- cwd normalization accepts relative paths and mishandles drive roots.
- Focus authorization can use stale sessions after list refresh failure.

Verification passed: targeted 15/15 tests, full 288/288 tests, typecheck, and targeted lint. Only the review document was modified.