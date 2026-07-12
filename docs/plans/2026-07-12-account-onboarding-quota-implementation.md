# Account Onboarding and Quota Clarity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Safely reauthenticate Grok accounts, give beginners a confirmed one-click Grok CLI setup, enlarge truthful quota details, and close the six fresh-review findings.

**Architecture:** Keep credentials and process execution in Electron's main process behind a typed preload bridge. Add pure/injectable lifecycle helpers for TDD, reset account-scoped ACP state on reauthentication, and render only normalized billing data. Preserve the sandboxed renderer and existing ACP/session architecture.

**Tech Stack:** Electron 43, React 19, TypeScript, Vitest, Testing Library, electron-vite, electron-builder/NSIS.

---

### Task 1: Fix review-gate state and permission regressions

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/fx/starfield.ts`
- Modify: `tests/app.test.tsx`
- Modify: `tests/starfield.test.tsx`

1. Write failing tests for explicit empty capability replacement, safe permission focus, new-session follow-tail reset, and WebGL restore failure.
2. Run the focused tests and confirm each fails for the intended missing behavior.
3. Implement connection-scoped capability replacement, safe modal focus, session reset, and renderer fallback/stop.
4. Run focused tests and then `npm test`.

### Task 2: Add testable official Grok lifecycle operations

**Files:**
- Create: `src/main/grok-lifecycle.ts`
- Create: `tests/grok-lifecycle.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/bridge.ts`
- Modify: `src/preload/index.ts`

1. Write failing tests for the fixed official URL, safe temporary installer lifecycle, version verification, OAuth reauthentication, failure cleanup, and concurrent-operation rejection.
2. Confirm RED with `npm test -- tests/grok-lifecycle.test.ts`.
3. Implement the minimal injectable lifecycle module.
4. Add typed IPC/preload methods and account-scoped ACP/cache invalidation.
5. Confirm GREEN with focused tests and typecheck.

### Task 3: Add beginner install and account-switch UX

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `tests/app.test.tsx`

1. Write failing UI tests for missing-CLI install confirmation, successful status refresh, failed install retry, account-switch confirmation, and OAuth failure messaging.
2. Confirm RED with the focused App tests.
3. Add the two confirmation flows, progress-disabled controls, and plain-language notices.
4. Confirm GREEN and run accessibility-focused UI tests.

### Task 4: Enlarge truthful Total/Build/Imagine/API quota presentation

**Files:**
- Modify: `src/renderer/src/components/QuotaRings.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `tests/quota-rings.test.tsx`

1. Write failing tests requiring all four fixed buckets and missing-data labels.
2. Confirm RED.
3. Render larger fixed rings sourced only from normalized billing data and update responsive layout.
4. Confirm GREEN and verify no context/billing conflation.

### Task 5: Restore public-package license compliance and documentation

**Files:**
- Create: `scripts/generate-third-party-notices.mjs`
- Create: `THIRD_PARTY_NOTICES.txt`
- Create: `tests/package.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `AGENTS.md`

1. Write a failing package test requiring LICENSE, PRIVACY, and third-party notices in the builder files plus a non-empty notice artifact.
2. Confirm RED.
3. Generate notices from production dependency metadata and include the legal files in the package.
4. Bump to v0.3.2 and document account/setup behavior, missing quota buckets, unsigned installer, and beginner usage.
5. Confirm GREEN and inspect the produced asar.

### Task 6: Release verification, commit, integration, and handoff

**Files:**
- Update only verification outputs ignored by git.

1. Run `npm run verify`.
2. Run `node work/live_feature_smoke.mjs` without sending a prompt.
3. Run `npm run smoke:ui` and require zero serious/critical axe findings.
4. Run `npm run package`, launch `outputs/installer/win-unpacked/Grok Build Control Center.exe`, and inspect asar/legal files.
5. Confirm `Get-AuthenticodeSignature` remains `NotSigned` and report it honestly.
6. Review `git diff`, commit the feature branch, merge it into `main`, rerun a post-merge smoke, and provide a beginner-facing sharing message.
