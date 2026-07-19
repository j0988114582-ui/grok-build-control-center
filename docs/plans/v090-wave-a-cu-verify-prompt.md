# Wave A desktop computer-use verification (GPT / Codex)

Workdir: this repo (`work/_upstream`). You have full access. Use **computer use / browser / desktop control** tools you have; do not only read code.

## Goal

Verify two hard gates after Wave A fixes:

1. **Starfield cold start**: dark theme + galaxy on → first paint must NOT be flat iron-gray forever. Stars / nebula should appear without requiring light→dark theme toggle.
2. **Pinned pin layout**: pinned session pin must NOT overlay the title text; actions sit in a trailing flex column (`.session-actions`). Narrow sidebar / long title still OK; pin stays visible when pinned.

## How to run the app

```powershell
cd C:\Users\demo\Documents\grok-build-GUI\work\_upstream
npm run dev
```

Or if build is preferred: `npm run build` then start Electron from the built main. Prefer `npm run dev` for speed.

Wait until the Galaxy Cockpit window is interactive (title bar GROK BUILD).

## Hard gate checks (PASS/FAIL each)

### Gate 1 — Starfield cold start
- Quit any existing Grok Build GUI instance first if possible.
- Cold-start the app once (do not open settings and toggle theme first).
- Within ~3s of UI ready: background should show starfield (stars / blue nebula), not a solid flat iron-gray plate.
- Optional: note `canvas[data-testid=starfield-canvas]` `data-renderer` if you can inspect (webgl or canvas2d preferred over none).
- FAIL if only solid gray until you switch light→dark.

### Gate 2 — Pin does not cover title
- Ensure at least one session is pinned (or pin one).
- In **已釘選** group, long title row: pin icon must sit in the **right action rail**, not on top of title characters.
- Resize window / narrow sidebar if possible: pin should reflow with the row (flex), not float over text.
- PASS if title ellipsis + pin are separate; FAIL if pin overlaps glyphs of the title.

## Freestyle (optional, short)
- Hover unpinned row: pin/rename/delete appear in the same rail.
- Toggle pin on/off once.

## Output

Write markdown report to:

`C:\Users\demo\Documents\grok-build-GUI\work\_upstream\docs\plans\v090-wave-a-cu-verify-report.md`

Must include:
- Gate 1: PASS or FAIL + evidence (what you saw / screenshot paths if any)
- Gate 2: PASS or FAIL + evidence
- Overall: PASS only if both gates PASS
- Any extra UI bugs found (brief)

Do not push git. Do not change product code unless a one-line fix is required to complete the test harness (prefer report-only).
