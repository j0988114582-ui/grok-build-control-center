**FAIL** for wave [2].

One Important blocker remains: a single oversized non-`text` field such as tool `status` can bypass T1 trimming. Reproduction yielded a 140,049-byte JSON tail despite the 64,000-byte limit.

Full review: [v090-wave1-codex-review-r8.md](C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave1-codex-review-r8.md)

Verification passed: targeted 31/31, full 304/304, lint, and typecheck. No product code changed.