**FAIL** for wave [5].

The three prior blockers are fixed, but review found:

- Network failures during initial status or ordinary actions remain silent/unhandled.
- `elevationLocked` is not surfaced in the mobile UI.
- Regression tests only check string presence, not the repaired behavior.

Review: [v090-wave4-codex-review-r2.md](C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave4-codex-review-r2.md)

Verification: 324/324 tests passed. No product code changed.