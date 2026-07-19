**FAIL** — wave [6] should not proceed.

Review written to [v090-wave5-codex-review.md](C:/Users/demo/Documents/grok-build-GUI/work/_upstream/docs/plans/v090-wave5-codex-review.md).

Blocking findings:

- Stale asynchronous focus alignment can overwrite and echo over the latest main-owned focus.
- Remote-on text plus attachments splits into two competing prompts.
- A local text queue created before enabling Remote never drains.
- All 53 renderer tests fail because the new bridge listener is absent from the shared mock.

Additionally, desktop queue provenance becomes incorrectly labeled as phone-originated after drain.

Typecheck, targeted lint, and diff checks passed. No product/test code was changed.