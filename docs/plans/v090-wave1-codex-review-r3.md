**FAIL** — wave [2] should not proceed yet.

Review: [v090-wave1-codex-review.md](</C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave1-codex-review.md:1>)

Blocking findings:

- Older delayed focus requests can overwrite the latest focus.
- Drive-root cwd such as `C:\` becomes `C:` and fails E4 authorization.
- `handleDoNow` sends a prompt while the session is idle, contrary to the running-turn ACL.

Verification passed: targeted 17/17 tests, full 290/290 tests, typecheck, and scoped lint. Only the review document was modified.