# Codex review: v0.9.0 wave [1] only (r9 re-review)

Plan: `docs/plans/2026-07-17-v0.9.0-remote-workable-fullaccess-plan.md` wave [1] + E2/E4/E9.

Review only `src/main/remote-controller.ts`, `tests/remote-controller.test.ts`, `src/shared/remote-protocol.ts`. HEAD includes r9.

## Prior r8 FAIL blocker (must re-verify fixed)

- Single oversized non-`text` field must not bypass T1: `toRemoteTranscriptItem` caps id/status; `enforceTailPayloadBudget` drops oldest, strips optionals, trims text, and **fail-closed drops** the item if JSON wire still > 64_000 bytes.

## Prior blockers (still fixed)

- Desktop invalidates pending remote focus (`intentId <= latestValidated`)
- JSON escape expansion counted
- enableEpoch, intent order, optimistic create/snapshot
- invalid focus no strand; YOLO; queue; do-now

## Verdict required
**PASS** / **PASS-with-nits** / **FAIL** for wave [2].

Write full review to the dispatcher output path. No product code for wave 2+. Run tests if needed; prefer probes for any remaining T1 edge.
