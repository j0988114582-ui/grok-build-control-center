# v0.9.0 wave [1] Codex r6 re-review

## Verdict

**FAIL** for wave [2].

HEAD is `6fb8bdb701fb52fa4d99726972c49fbb45b224b2` and includes the requested r6 commit. Prior blockers 1 and 4 are fixed, and blocker 3's create/focus success path is fixed. Prior blocker 2 is still bypassable across a disable→re-enable lifecycle, and two additional E2/E4 regressions remain in the reviewed scope.

## Findings

### Important — a pre-disable focus request revives after disable→re-enable

[`disable()` advances `loadGeneration`](../../src/main/remote-controller.ts#L163), and [`handleFocus()` re-checks `enabled` after refresh and load](../../src/main/remote-controller.ts#L306), so the two new tests cover a controller that stays disabled. However, `handleFocus()` captures no lifecycle generation before its first `await`. If Remote is disabled and re-enabled while `listSessions()` is pending, `enabled` is true again when the stale request resumes; it then claims a fresh generation, commits focus, and returns success.

Reproduced on HEAD: start `handleFocus('s1')` with `listSessions` gated, call `disable()`, call `enable()`, release the list gate. The stale request returned `{ ok: true, sessionId: 's1' }`; focus became `s1` / `ready` in the newly enabled lifecycle.

Consequence: revocation is not a durable boundary for an already-authenticated focus operation. This is still the substance of prior blocker 2; `enabled` checks alone cannot distinguish the old enable lifetime from the new one.

Smallest fix: add a monotonic lifecycle/enable epoch, capture it at `handleFocus()` entry, advance it in `disable()`, and require the captured epoch to match after every await and before committing focus. Add a disable→re-enable-during-refresh regression test; keep the existing disable-during-refresh and disable-during-load cases.

### Important — concurrent valid focus requests violate E2 last-writer-wins when refreshes resolve out of order

[`handleFocus()` assigns generation only after `refreshSessions()` and validation](../../src/main/remote-controller.ts#L309). The declared [`focusRequestId`](../../src/main/remote-controller.ts#L99) is incremented only after validation and is never compared. Therefore invocation order is lost while requests await their independent list refreshes.

Reproduced on HEAD: invoke valid `s1`, then valid `s2`; resolve `s2`'s list refresh first and `s1`'s last. Both calls returned success, but final focus was `s1`. The existing stale-focus test only delays `s1` in `loadSession`, after it has already validated, so it does not cover this race.

Consequence: an older phone focus intent can overwrite a newer one, violating E2's explicit last-writer-wins contract and potentially loading the wrong desktop session.

Smallest fix: preserve call-order IDs separately from committed `loadGeneration`. On successful validation, reject a request older than the newest already-validated focus intent; invalid/refresh-failed requests must not update the committed generation or cancel an incumbent valid load. Add an out-of-order-refresh test with two valid IDs.

### Important — `getSnapshot()` discards the optimistic create row while disk indexing still lags

The r6 [`optimisticSessions` merge in `refreshSessions()`](../../src/main/remote-controller.ts#L784) lets `handleCreateSession()` focus the authoritative create result even when disk still returns the old index. But [`getSnapshot()` calls `listSessions()` independently and assigns its result directly to `list`/`lastSessions`](../../src/main/remote-controller.ts#L726), bypassing the optimistic merge in both the synchronous and asynchronous branches.

Reproduced on HEAD with disk fixed at `[s1]` and `createSession()` returning `s2`: create returned success and focus was `s2`, but the immediately following snapshot exposed sessions `[s1]` only. The new create regression test asserts success and focus, not snapshot visibility.

Consequence: the phone can successfully create and focus `s2` while its authoritative session drawer omits `s2` until disk catches up. This defeats the user-visible purpose of the optimistic index and leaves an internally inconsistent snapshot.

Smallest fix: make snapshot list refresh use the same merge path, or merge `optimisticSessions` into both sync and async `getSnapshot()` results before assignment/exposure. Add an assertion that snapshots retain `s2` until a disk list contains `s2` (at which point the optimistic entry may be dropped).

## Prior blocker re-verification

| Prior blocker | Result |
| --- | --- |
| 1. Invalid focus must not bump `loadGeneration` / strand valid load | **Fixed.** Validation precedes generation claim, and the valid-loading → invalid request → ready/prompt regression passes. |
| 2. `disable()` cancels in-flight focus | **Not fully fixed.** Staying-disabled refresh/load cases pass; disable→re-enable lets the stale pre-disable request commit. |
| 3. Create succeeds while disk index lags | **Core path fixed.** Create returns success and focuses `s2`; snapshot visibility remains broken by the finding above. |
| 4. T1 uses UTF-8 byte budget | **Fixed.** `REMOTE_TAIL_MAX_BYTES` and `Buffer.byteLength(..., 'utf8')` are used. The multibyte probe retained 25 items and serialized to 61,476 bytes. |

## Deliverable assessment

| Area | Assessment |
| --- | --- |
| E2 focus→ready / reconnect restore | Basic loading→ready/error and generation checks are present; restore re-checks lifecycle after awaits. **Blocked** by disable→re-enable resurrection and pre-validation valid-focus ordering. |
| E4 cwd-union / create | Absolute normalized exact-match and fail-closed refresh behavior are present. Optimistic create allows focus success, but **snapshot merge is incomplete**. |
| YOLO PIN enable / disable | PIN elevation is enforced; disable switches to `ask` without revoking Remote. |
| Model / mode / interject / do-now | Reviewed controller delegates with ready/running guards; do-now checks focus again after cancel. |
| E9 queue | Main owns one slot; replacement implements last writer; mobile→desktop regression proves only the final text drains. |
| T1 tail | Item count and UTF-8 byte accounting are implemented. The current test's `+ 4096` allowance is looser than the contract, but the implementation/probe stayed under 64,000 bytes. |

## Verification

- `npx vitest run tests/remote-controller.test.ts` — **26/26 passed**.
- `npx eslint src/main/remote-controller.ts tests/remote-controller.test.ts src/shared/remote-protocol.ts` — passed.
- `npm run typecheck` — passed.
- Read-only `tsx` probes reproduced all three findings and measured the T1 multibyte tail; no probe files were created.

Only this review document was overwritten. Product and test code were not modified.
