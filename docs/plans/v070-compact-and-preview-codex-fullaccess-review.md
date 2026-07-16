# Integrated Codex Full-Access Review — Compact A+C + Preview C13 + 0.7.x

**Date:** 2026-07-17  
**Reviewer:** Codex (GPT-5.6) via `model-exec.exe codex --write --full-access`  
**Workdir:** `C:\Users\demo\Documents\grok-build-GUI\work\_upstream`  
**Commits reviewed:** `a3eddab` (compact A+C), `8e47e6f` (C13 smoke matrix)  
**model-exec:** `ok:true`, `mode:unbounded-full-access`, `exitCode:0`, `backend:codex`  
**Evidence sidecar:** `docs/plans/v070-compact-and-preview-codex-fullaccess-review.md.events.jsonl`

## Verdict

| Field | Value |
| --- | --- |
| **Verdict** | **PASS-with-nits** |
| **P0** | **0** |
| Full verify | **PASS** — 238/238 tests; lint; typecheck; production build |
| Compact A+C | **PASS** (probe-backed) |
| Preview C1–C14 / C13 | **PASS-with-nit** (C13 matrix complete; video fixture evidence quality) |

No remote push performed.

---

## 1. Auto-compact (Scheme A + Fallback C)

### Probe fidelity (CLI 0.2.101)

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Emits `auto_compact_completed`? | **YES** on wire | `work/_probe/compact-raw-probe.md`, raw jsonl |
| 2 | JSON shape | `_x.ai/session_notification` params: `sessionId`, `update.sessionUpdate=auto_compact_completed`, `tokens_before`, `tokens_after`, `summary_preview` (+ `_meta.eventId`) | live line in `compact-raw-lines.jsonl` |
| 3 | `/compact` notification? | **Yes** (extension method). Tiny context no-op: before===after, summary null; prompt `totalTokens:0` | same |
| 4 | A-only vs A+C | **A+C required** (A primary) | probe recommendation |

**Critical finding:** compact is **not** on ACP `session/update`. Intercepting only SDK `session/update` would never see it — even without closed-union drop. Tee of raw stdout for `_x.ai/session_notification` is the correct primary path.

### Implementation table

| Area | Result | Notes |
| --- | --- | --- |
| Scheme A raw tee | **PASS** | `acp-client` PassThrough + line buffer → `parseXaiSessionNotificationLine` → `normalizeAcpUpdate` → `kind:'compact' source:'official'` |
| Adapter fields | **PASS** | `tokens_before`/`tokens_after`/`summary_preview` (null-safe); matches live shape |
| 繁中 official card | **PASS** | 「已自動壓縮上下文」; no-op title 「已執行上下文壓縮（用量未變）」 |
| Fallback C hedge | **PASS** | `compact-infer` token/percent/`compactionCount`; grace 15s + episode 60s; copy includes「非官方事件」 |
| Double-notice guard | **PASS** | official compact stamps `lastOfficialCompactAt` so C does not fire in grace window |
| Unit tests | **PASS** | `tests/xai-session-notification.test.ts` (live fixture), `tests/compact-infer.test.ts`, adapter/source |
| AGENTS.md | **PASS** | A primary / C fallback documented; probe path cited |
| Interject / readiness | **PASS** | No regressions in full suite (interject + readiness tests remain green) |

### Compact nits (non-P0)

- **P2:** Tee currently only forwards `auto_compact_completed`; other `_x.ai/session_notification` types (`turn_completed`, future) still unused (turn completion already via prompt response).
- **P2:** No live Electron UI screenshot of compact card (unit + probe only). Acceptable for this gate.

---

## 2. Preview Dock C1–C14 (C13 re-score)

Prior report (`v070-preview-codex-fullaccess-smoke-report.md`) marked **C13 FAIL** for evidence gap. **Superseded for this pass.**

### C13 evidence now present

| Artifact | Present |
| --- | --- |
| `outputs/preview-smoke/preview-open.png` | yes |
| `outputs/preview-smoke/preview-rail.png` | yes |
| `c13-{image,video,html,code}-1280.png` | yes (4) |
| `c13-{image,video,html,code}-1040.png` | yes (4) |
| `c13-rail-1280.png` | yes |
| `result.json` | `ok:true`, `kinds` all true, `viewports` 1040+1280, `seriousA11y:0`, 11 screenshots |

Smoke harness: `work/preview_feature_smoke.mjs` + `window.__grokSmoke` (session activate / openPreviewPath without folder dialog). Free `session/new` only (no paid prompts).

### Matrix

| # | Result | Notes |
| --- | --- | --- |
| C1 open/close dock | **PASS** | smoke toggle + shortcut |
| C2 resize clamp | **PASS** | prior + settings tests |
| C3 image | **PASS** | register base64; `hasImg:true` in smoke |
| C4 video | **PASS-with-nit** | protocol register ok; **fixture is 32-byte MP4 shell** → UI shows「無法載入影片」while smoke still sets `kinds.video=true` via register-ok heuristic |
| C5 HTML | **PASS** | iframe present; sandbox policy unchanged |
| C6 code | **PASS** | pre/highlight + greet fixture visible |
| C7 multi-item list | **PASS** | list accumulates four items in UI text |
| C8 missing file | **PASS** | prior unit/service |
| C9 oversize | **PASS** | prior service |
| C10 settings live | **PASS** | full verify |
| C11 interject/readiness | **PASS** | full verify 238 |
| C12 axe serious/critical | **PASS** | 0 violations on open/rail + 1280 kinds |
| **C13 screenshots** | **PASS-with-nit** | matrix complete (was FAIL); video decode not proven by fixture quality |
| C14 security negatives | **PASS** | path policy + service tests |

### C13 P1 nit (evidence quality, not product P0)

Smoke treats `previewRegister().ok === true` as sufficient for `kinds.video` even when `<video>` fails to decode. Follow-up: ship a real minimal playable MP4/WebM fixture and require `hasVideo` (or absence of the Chinese load-error string) for video kind success.

---

## 3. 0.7.x readiness nits

| Severity | Item |
| --- | --- |
| P0 | **None** |
| P1 | C13 video smoke pass condition too wide (decode failure still green) |
| P2 | Range unsatisfiable → 200 instead of 416 (prior nit) |
| P2 | HTML `allow-scripts` still subject to parent CSP `script-src` (prior AGY nit) |
| P2 | `__grokSmoke` global is always installed (smoke-only API; low risk, consider DEV/env gate) |
| P2 | Compact card not covered by RTL screenshot/UI test |

**Overall 0.7.x readiness:** suitable for continue / evidence archive; no P0 blockers from this integrated pass.

---

## Verification executed (Codex full-access)

- Focused: `xai-session-notification`, `compact-infer`, `event-adapter`, preview policy/dock — **34/34**
- Full: `npm run verify` — **238 tests**, lint, typecheck, build — **PASS**
- Read probe + implementation + `outputs/preview-smoke/result.json` + screenshot file presence
- Updated banner on `docs/plans/v070-preview-codex-fullaccess-smoke-report.md` (C13 COMPLETE; point here)

---

## Evidence index

| Path | Role |
| --- | --- |
| `work/_probe/compact-raw-probe.md` | Live ACP compact answers 1–4 |
| `work/_probe/compact-raw-lines.jsonl` | Raw NDJSON tee |
| `src/main/acp-client.ts` | Scheme A tee |
| `src/shared/xai-session-notification.ts` | Parse extension notification |
| `src/shared/compact-infer.ts` | Fallback C |
| `src/renderer/src/App.tsx` | 繁中 cards + C poll + smoke hook |
| `outputs/preview-smoke/*` | C13 screenshots + result.json (local/gitignored) |
| `work/preview_feature_smoke.mjs` | C13 smoke matrix |
| model-exec JSON | full-access ok, exit 0 |

## Commits (local only; no push)

- `a3eddab` — feat: auto-compact A+C  
- `8e47e6f` — test: C13 preview smoke matrix  
