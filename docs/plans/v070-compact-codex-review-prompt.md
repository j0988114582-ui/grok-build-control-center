# Codex full-access integrated review — compact A+C + Preview C13 + 0.7.x

You are **codex** reviewing Grok Build Control Center (unofficial Windows GUI for Grok CLI) in this workdir.

## Mandate
- Flags already set: **write + full-access**. You may read/write the repo as needed for evidence.
- Do **not** push to remotes.
- Write the integrated review report to:
  **`docs/plans/v070-compact-and-preview-codex-fullaccess-review.md`**
- Also update/refresh **`docs/plans/v070-preview-codex-fullaccess-smoke-report.md`** to note C13 is now complete and point to the integrated review as superseding for this pass (keep prior content; add a top banner).

## Scope (single review)

### 1) Auto-compact visibility (Scheme A + Fallback C)
- Live probe: `work/_probe/compact-raw-probe.md` (+ jsonl). CLI 0.2.101: `/compact` emits `_x.ai/session_notification` with `auto_compact_completed` (`tokens_before`/`tokens_after`/`summary_preview`), **not** standard `session/update`.
- Implementation:
  - A: `src/main/acp-client.ts` stdout tee → `src/shared/xai-session-notification.ts` → `normalizeAcpUpdate` → `kind:'compact' source:'official'`
  - C: `src/shared/compact-infer.ts` + usage poll in `src/renderer/src/App.tsx` hedged 「可能已壓縮上下文」
  - UI 繁中 official 「已自動壓縮上下文」
  - Tests: `tests/xai-session-notification.test.ts`, `tests/compact-infer.test.ts`
  - AGENTS.md updated
- Commits: `a3eddab` (A+C), `8e47e6f` (C13 smoke)

### 2) Preview Dock C1–C14 with C13 screenshots complete
- Screenshots under `outputs/preview-smoke/` (gitignored):  
  preview-open, preview-rail, c13-{image,video,html,code}-{1040,1280}, c13-rail-1280, result.json  
- `result.json`: kinds all true, viewports 1040+1280, seriousA11y 0, ok true, 11 screenshots  
- Smoke: `work/preview_feature_smoke.mjs` + `window.__grokSmoke` harness in App (smoke only)

### 3) Overall 0.7.x readiness nits
- Note any P0/P1/P2; no invented P0 without evidence.
- Prior smoke report said C13 FAIL (evidence gap) — re-verify.

## Required verdict format
- **Verdict:** PASS | PASS-with-nits | FAIL
- **P0 count**
- Table for compact A/C (probe fidelity, SDK bypass correctness, spam/hedge, tests)
- Table for C1–C14 (C13 must be re-scored)
- Nits / follow-ups
- Evidence paths used

## Verification you may run (optional but preferred)
- `npx vitest run tests/xai-session-notification.test.ts tests/compact-infer.test.ts tests/event-adapter.test.ts tests/preview-path-policy.test.ts tests/preview-dock.test.tsx`
- Read `outputs/preview-smoke/result.json` and confirm screenshot files exist
- Spot-check Range 206 / HtmlView sandbox if time

Write the report files and exit with a clear verdict line.
