# AGY Frontend Handoff — v0.6.1（read this first）

Executor completed **backend contracts** in `src/shared/**` + main reveal IPC.  
**You (AGY Gemini 3.5 Flash) own ALL `src/renderer/**` writes** for this wave.

## Visual authority
`docs/plans/v06-drafts/agy-draft-galaxy-l1l2.html`

## Plan
`docs/plans/2026-07-16-v0.6.1-one-shot-completion.md` — sections V1–V9, T1/T5 UI, F1/F2/F3/F4 frontend.

## Contracts to wire (do not reimplement logic)

### Readiness — `src/shared/session-readiness.ts`
- State: `connectionGeneration` (number, start 0→bump on connect), `sessionReady: SessionReadyMap`
- On **successful** `createSession` / `loadSession`: `markSessionReady(..., generation)`
- On disconnect / reauth / before reconnect: `invalidateAllReadiness()` + bump generation after new connect
- Before send/interject/do-now/cancel: `sessionActionAllowed(...)`; if not ok → notice + return
- Disable composers when not ready; show `SESSION_NOT_READY_NOTICE` etc.

### Team reconnect — `src/shared/team-reconnect.ts`
- Before permission reconnect: `snapshotTeamReconnect(team, activeId, teamEnabled)`
- Invalidate readiness; reload slots **without** leaving focus on last peer
- After peers reloaded: `restoreTeamAfterReconnect(snapshot, successfulIds)` then set team + active

### Search — `src/shared/session-search.ts`
- Replace simple sidebar filter with `buildSessionSearchIndex` + `filterSessionsBySearch` (title, local title, cwd, drafts)

### Export reveal — bridge
- `exportSession` still returns path string
- New: `window.grokApi.revealExport(path)` after successful export
- UI: button or notice action「在資料夾顯示」

### Templates T1
- `PROMPT_TEMPLATES` in Team panes (`SessionTeamPane`) same chips as main composer

### Capabilities F3
- `probeSessionCapabilities(caps)` → show matrix rows in features drawer (native vs TUI)

## Visual Must (V1–V9)
Tokenize A palette; hierarchy; empty state cockpit; command rail; media; quota readability; L1 motion+reduced-motion; L2 orb + titlebar denoise; Team pane styling focus>running.

## Tests
Keep existing testids: `interject-button`, `do-this-now-button`, `stop-button`, `agents-team-toggle`, `team-pane`, `status-orb`, `path-chip`, etc.

## Deliver
1. Implement all above in renderer  
2. `npm test` / typecheck / lint must stay green (run if you can)  
3. Write `docs/plans/v061-agy-alignment-checklist.md` with §5 yes/no  
4. Screenshots under `docs/plans/v061-screenshots/` if possible (dark/light/2pane/3pane) — if environment cannot screenshot, note why  

## Forbidden
- Fake billing product %  
- L3 / multi themes  
- Arbitrary path reveal  
- Changing interject semantics (never cancel for interject)
