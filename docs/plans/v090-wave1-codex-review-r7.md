**FAIL** for wave [2].

Review written to [v090-wave1-codex-review-r7.md](C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave1-codex-review-r7.md).

The three r6 blockers are fixed. Two Important issues remain:

- A later desktop focus can be overwritten by an older pending remote focus.
- JSON escaping can expand the public tail to 122,361 bytes despite the 64,000-byte limit.

Verification: targeted 29/29, full 302/302, ESLint, and typecheck passed. No product or test code changed.