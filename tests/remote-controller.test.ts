import { describe, expect, it, vi } from 'vitest'
import { RemoteController } from '../src/main/remote-controller'
import type { SessionSummary } from '../src/shared/types'

const sessions: SessionSummary[] = [
  { id: 's1', cwd: 'C:\\repo', title: 'Alpha', updatedAt: '2026-07-17T00:00:00Z' }
]

function makeController(overrides?: Partial<ConstructorParameters<typeof RemoteController>[0]>): RemoteController {
  return new RemoteController({
    getPermissionMode: () => 'ask',
    listSessions: () => sessions,
    isSessionReady: () => true,
    prompt: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    respondPermission: vi.fn(),
    now: () => 1_000_000,
    ...overrides
  })
}

describe('remote-controller (v0.9 coexistence)', () => {
  it('allows enable while YOLO is active', () => {
    const controller = makeController({ getPermissionMode: () => 'always-approve' })
    const result = controller.enable()
    expect(result.ok).toBe(true)
  })

  it('allows YOLO while remote enabled (PIN elevation is separate)', () => {
    const controller = makeController()
    expect(controller.enable().ok).toBe(true)
    expect(controller.assertCanEnableYolo().ok).toBe(true)
  })

  it('mode change does not revoke remote session', () => {
    const controller = makeController()
    controller.enable()
    const opened = controller.regeneratePairing()!
    const paired = controller.auth.pair(opened.pairingSecret, opened.pin, 1_000_000)
    expect(paired.ok).toBe(true)
    controller.onPermissionModeChanged('always-approve')
    expect(controller.isEnabled()).toBe(true)
    expect(controller.auth.hasActiveSession(1_000_001)).toBe(true)
  })

  it('prompt uses server-side focus session only', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const controller = makeController({ prompt })
    controller.enable()
    controller.setFocusSession('s1')
    const result = await controller.handlePrompt('hello from phone')
    expect(result.ok).toBe(true)
    expect(prompt).toHaveBeenCalledWith('s1', 'hello from phone')
  })

  it('prompt allowed under YOLO mode', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const controller = makeController({ prompt, getPermissionMode: () => 'always-approve' })
    controller.enable()
    controller.setFocusSession('s1')
    const result = await controller.handlePrompt('yolo prompt')
    expect(result.ok).toBe(true)
  })

  it('permission respond requires allowPhonePermissions and exact option', () => {
    const respondPermission = vi.fn()
    const controller = makeController({ respondPermission })
    controller.enable({ allowPhonePermissions: false })
    controller.setFocusSession('s1')
    controller.onPermissionRequest({
      requestId: 'permission:1',
      sessionId: 's1',
      title: 'Run shell',
      options: [{ optionId: 'once', name: 'Allow once', kind: 'allow_once' }]
    })
    expect(controller.handlePermissionRespond('permission:1', 'once').ok).toBe(false)

    const controller2 = makeController({ respondPermission })
    controller2.enable({ allowPhonePermissions: true })
    controller2.setFocusSession('s1')
    controller2.onPermissionRequest({
      requestId: 'permission:2',
      sessionId: 's1',
      title: 'Run shell',
      options: [{ optionId: 'once', name: 'Allow once', kind: 'allow_once' }]
    })
    expect(controller2.handlePermissionRespond('permission:2', 'forged').ok).toBe(false)
    expect(controller2.handlePermissionRespond('permission:2', 'once').ok).toBe(true)
    expect(respondPermission).toHaveBeenCalledWith('permission:2', 'once')
    expect(controller2.handlePermissionRespond('permission:2', 'once').ok).toBe(false)
  })

  it('permission respond fails closed without focus session', () => {
    const respondPermission = vi.fn()
    const controller = makeController({ respondPermission })
    controller.enable({ allowPhonePermissions: true })
    controller.onPermissionRequest({
      requestId: 'permission:3',
      sessionId: 's1',
      title: 'Run shell',
      options: [{ optionId: 'once', name: 'Allow once', kind: 'allow_once' }]
    })
    expect(controller.handlePermissionRespond('permission:3', 'once').ok).toBe(false)
    expect(respondPermission).not.toHaveBeenCalled()
  })

  it('snapshot includes cwd for single-user list', () => {
    const controller = makeController()
    controller.enable()
    const snap = controller.getSnapshot()
    expect(snap.sessions[0]).toEqual(expect.objectContaining({ id: 's1', title: 'Alpha', cwd: 'C:\\repo' }))
    expect(snap.focusStatus).toBe('none')
    expect(snap.elevationLocked).toBe(false)
  })

  it('does not put thoughts in tail', () => {
    const controller = makeController()
    controller.enable()
    controller.setFocusSession('s1')
    controller.pushEvent({ id: 't1', sessionId: 's1', kind: 'thought', text: 'secret chain' })
    controller.pushEvent({ id: 'm1', sessionId: 's1', kind: 'message', role: 'assistant', text: 'hello' })
    const snap = controller.getSnapshot()
    expect(snap.tail).toHaveLength(1)
    expect(snap.tail[0]?.text).toBe('hello')
    expect(snap.focusStatus).toBe('ready')
  })

  it('handleFocus loads unready session via main loadSession', async () => {
    const loadSession = vi.fn().mockImplementation(async () => {
      /* mark ready via isSessionReady after call — use mutable flag */
    })
    let ready = false
    const controller = makeController({
      isSessionReady: () => ready,
      loadSession: async (id, cwd) => {
        await loadSession(id, cwd)
        ready = true
      }
    })
    controller.enable()
    await controller.refreshSessions()
    const result = await controller.handleFocus('s1')
    expect(result.ok).toBe(true)
    expect(loadSession).toHaveBeenCalledWith('s1', 'C:\\repo')
    expect(controller.getSnapshot().focusStatus).toBe('ready')
  })

  it('cwd union exact match only', async () => {
    const controller = makeController()
    controller.enable()
    await controller.refreshSessions()
    expect(controller.isCwdInUnion('C:\\repo')).toBe(true)
    expect(controller.isCwdInUnion('C:\\repo\\nested')).toBe(false)
    expect(controller.isCwdInUnion('C:\\other')).toBe(false)
    const bad = await controller.handleCreateSession('C:\\evil')
    expect(bad.ok).toBe(false)
  })

  it('yolo enable requires elevation PIN', async () => {
    const setPermissionMode = vi.fn().mockResolvedValue('always-approve')
    const controller = makeController({ setPermissionMode })
    controller.enable()
    const opened = controller.regeneratePairing()!
    const paired = controller.auth.pair(opened.pairingSecret, opened.pin, 1_000_000)
    expect(paired.ok).toBe(true)
    if (!paired.ok) return
    const v = controller.auth.validateSession(paired.value.sessionToken, 1_000_001)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const fail = await controller.handleYoloEnable('000000', v.value.tokenHash)
    expect(fail.ok).toBe(false)
    const ok = await controller.handleYoloEnable(opened.pin, v.value.tokenHash)
    expect(ok.ok).toBe(true)
    expect(setPermissionMode).toHaveBeenCalledWith('always-approve')
  })

  it('queue last-write drains after turn ends', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const controller = makeController({ prompt })
    controller.enable()
    controller.setFocusSession('s1')
    controller.setRunning('s1', true)
    expect(controller.handleQueue('next job').ok).toBe(true)
    controller.setRunning('s1', false)
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledWith('s1', 'next job'))
  })

  it('queue is dropped if focus changes before drain', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const controller = makeController({
      prompt,
      listSessions: () => [
        { id: 's1', cwd: 'C:\\repo', title: 'Alpha' },
        { id: 's2', cwd: 'C:\\repo', title: 'Beta' }
      ]
    })
    controller.enable()
    await controller.refreshSessions()
    controller.setFocusSession('s1')
    controller.setRunning('s1', true)
    expect(controller.handleQueue('for s1').ok).toBe(true)
    controller.setFocusSession('s2')
    controller.setRunning('s1', false)
    await new Promise((r) => setTimeout(r, 20))
    expect(prompt).not.toHaveBeenCalled()
    expect(controller.getQueue()).toBeNull()
  })

  it('create session fails closed when list refresh fails', async () => {
    const controller = makeController({
      listSessions: () => { throw new Error('disk down') }
    })
    controller.enable()
    const result = await controller.handleCreateSession('C:\\repo')
    expect(result.ok).toBe(false)
  })

  it('rejects relative cwd paths', async () => {
    const controller = makeController()
    controller.enable()
    await controller.refreshSessions()
    expect(controller.isCwdInUnion('repo')).toBe(false)
    expect(controller.isCwdInUnion('..\\repo')).toBe(false)
  })

  it('do-now rejects when session is idle', async () => {
    const controller = makeController()
    controller.enable()
    controller.setFocusSession('s1')
    const result = await controller.handleDoNow('nope')
    expect(result.ok).toBe(false)
  })

  it('stale focus request does not overwrite newer focus', async () => {
    let releaseS1: () => void
    const s1Gate = new Promise<void>((r) => { releaseS1 = r })
    const loads: string[] = []
    let readyId: string | null = null
    const controller = makeController({
      listSessions: () => [
        { id: 's1', cwd: 'C:\\repo', title: 'A' },
        { id: 's2', cwd: 'C:\\repo', title: 'B' }
      ],
      isSessionReady: (id) => id === readyId,
      loadSession: async (id) => {
        loads.push(id)
        if (id === 's1') await s1Gate
        readyId = id
      }
    })
    controller.enable()
    const p1 = controller.handleFocus('s1')
    await new Promise((r) => setTimeout(r, 5))
    const p2 = controller.handleFocus('s2')
    releaseS1!()
    await Promise.all([p1, p2])
    expect(controller.getFocusSessionId()).toBe('s2')
    expect(controller.getSnapshot().focusStatus).toBe('ready')
  })

  it('do-now aborts if focus changes during cancel', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    let resolveCancel: () => void
    const cancel = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveCancel = r }))
    const controller = makeController({
      prompt,
      cancel,
      listSessions: () => [
        { id: 's1', cwd: 'C:\\repo', title: 'A' },
        { id: 's2', cwd: 'C:\\repo', title: 'B' }
      ]
    })
    controller.enable()
    await controller.refreshSessions()
    controller.setFocusSession('s1')
    controller.setRunning('s1', true)
    const pending = controller.handleDoNow('replacement')
    controller.setFocusSession('s2')
    resolveCancel!()
    const result = await pending
    expect(result.ok).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
  })

  it('invalid focus does not strand a valid loading session', async () => {
    let releaseLoad: () => void
    const loadGate = new Promise<void>((r) => { releaseLoad = r })
    let ready = false
    const controller = makeController({
      isSessionReady: () => ready,
      loadSession: async () => {
        await loadGate
        ready = true
      }
    })
    controller.enable()
    const p1 = controller.handleFocus('s1')
    await new Promise((r) => setTimeout(r, 5))
    const forged = await controller.handleFocus('forged-missing')
    expect(forged.ok).toBe(false)
    if (!forged.ok) expect(forged.code).toBe('not_found')
    expect(controller.getFocusSessionId()).toBe('s1')
    releaseLoad!()
    const ok = await p1
    expect(ok.ok).toBe(true)
    expect(controller.getSnapshot().focusStatus).toBe('ready')
    const prompt = await controller.handlePrompt('still works')
    expect(prompt.ok).toBe(true)
  })

  it('disable during refresh does not resurrect focus', async () => {
    let releaseList: () => void
    const listGate = new Promise<void>((r) => { releaseList = r })
    const onFocusChanged = vi.fn()
    const loadSession = vi.fn().mockResolvedValue(undefined)
    const controller = makeController({
      listSessions: async () => {
        await listGate
        return sessions
      },
      isSessionReady: () => false,
      loadSession,
      onFocusChanged
    })
    controller.enable()
    const pending = controller.handleFocus('s1')
    await new Promise((r) => setTimeout(r, 5))
    controller.disable()
    releaseList!()
    const result = await pending
    expect(result.ok).toBe(false)
    expect(controller.getFocusSessionId()).toBeNull()
    expect(controller.isEnabled()).toBe(false)
    expect(loadSession).not.toHaveBeenCalled()
    // onFocusChanged may fire only if commit happened before disable — must not leave focus
    expect(controller.getFocusSessionId()).toBeNull()
  })

  it('disable during load cancels ready transition', async () => {
    let releaseLoad: () => void
    const loadGate = new Promise<void>((r) => { releaseLoad = r })
    let ready = false
    const controller = makeController({
      isSessionReady: () => ready,
      loadSession: async () => {
        await loadGate
        ready = true
      }
    })
    controller.enable()
    const pending = controller.handleFocus('s1')
    await new Promise((r) => setTimeout(r, 5))
    expect(controller.getSnapshot().focusStatus).toBe('loading')
    controller.disable()
    releaseLoad!()
    await pending
    expect(controller.getFocusSessionId()).toBeNull()
    expect(controller.getSnapshot().focusStatus).toBe('none')
  })

  it('create succeeds when disk index lags behind createSession', async () => {
    const listed: SessionSummary[] = [{ id: 's1', cwd: 'C:\\repo', title: 'Alpha' }]
    const createSession = vi.fn().mockResolvedValue({ sessionId: 's2', cwd: 'C:\\repo' })
    const controller = makeController({
      listSessions: () => listed,
      createSession,
      isSessionReady: (id) => id === 's2' || id === 's1',
      loadSession: vi.fn().mockResolvedValue(undefined)
    })
    controller.enable()
    await controller.refreshSessions()
    // Disk still only has s1 when create returns
    const result = await controller.handleCreateSession('C:\\repo')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sessionId).toBe('s2')
    expect(createSession).toHaveBeenCalled()
    expect(controller.getFocusSessionId()).toBe('s2')
  })

  it('queue last writer wins across mobile and desktop', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const controller = makeController({ prompt })
    controller.enable()
    controller.setFocusSession('s1')
    controller.setRunning('s1', true)
    expect(controller.handleQueue('from-mobile', 'mobile-remote').ok).toBe(true)
    expect(controller.handleQueue('from-desktop', 'desktop').ok).toBe(true)
    expect(controller.getQueue()?.text).toBe('from-desktop')
    controller.setRunning('s1', false)
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledWith('s1', 'from-desktop'))
    expect(prompt).not.toHaveBeenCalledWith('s1', 'from-mobile')
  })

  it('T1 tail enforces UTF-8 JSON wire budget not char length', () => {
    const controller = makeController()
    controller.enable()
    controller.setFocusSession('s1')
    // Each CJK char is 3 UTF-8 bytes; 800 chars ≈ 2400 bytes text + overhead
    const cjk = '測'.repeat(800)
    for (let i = 0; i < 80; i++) {
      controller.pushEvent({
        id: `m${i}`,
        sessionId: 's1',
        kind: 'message',
        role: 'assistant',
        text: cjk
      })
    }
    const snap = controller.getSnapshot()
    const payload = JSON.stringify(snap.tail)
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(64_000)
    // Must have dropped many of the 80 items (char-only cap would keep far more)
    expect(snap.tail.length).toBeLessThan(40)
  })

  it('T1 tail accounts for JSON escape expansion', () => {
    const controller = makeController()
    controller.enable()
    controller.setFocusSession('s1')
    // Quotes/backslashes expand under JSON.stringify
    const noisy = `${'\\"'.repeat(400)}${'測'.repeat(200)}`
    for (let i = 0; i < 100; i++) {
      controller.pushEvent({
        id: `e${i}`,
        sessionId: 's1',
        kind: 'message',
        role: 'assistant',
        text: noisy
      })
    }
    const bytes = Buffer.byteLength(JSON.stringify(controller.getSnapshot().tail), 'utf8')
    expect(bytes).toBeLessThanOrEqual(64_000)
  })

  it('desktop setFocus invalidates pending older remote focus', async () => {
    let releaseList: () => void
    const listGate = new Promise<void>((r) => { releaseList = r })
    let armed = false
    const controller = makeController({
      listSessions: async () => {
        if (!armed) {
          return [
            { id: 's1', cwd: 'C:\\repo', title: 'A' },
            { id: 's2', cwd: 'C:\\repo', title: 'B' }
          ]
        }
        await listGate
        return [
          { id: 's1', cwd: 'C:\\repo', title: 'A' },
          { id: 's2', cwd: 'C:\\repo', title: 'B' }
        ]
      },
      isSessionReady: () => true
    })
    controller.enable()
    await controller.refreshSessions()
    armed = true
    const pending = controller.handleFocus('s1')
    await new Promise((r) => setTimeout(r, 5))
    controller.setFocusSession('s2')
    releaseList!()
    const result = await pending
    expect(result.ok).toBe(false)
    expect(controller.getFocusSessionId()).toBe('s2')
  })

  it('disable then re-enable does not revive pre-disable focus', async () => {
    let releaseList: () => void
    const listGate = new Promise<void>((r) => { releaseList = r })
    const loadSession = vi.fn().mockResolvedValue(undefined)
    const controller = makeController({
      listSessions: async () => {
        await listGate
        return sessions
      },
      isSessionReady: () => true,
      loadSession
    })
    controller.enable()
    const pending = controller.handleFocus('s1')
    await new Promise((r) => setTimeout(r, 5))
    controller.disable()
    controller.enable()
    releaseList!()
    const result = await pending
    expect(result.ok).toBe(false)
    expect(controller.getFocusSessionId()).toBeNull()
    expect(loadSession).not.toHaveBeenCalled()
  })

  it('later valid focus wins when refreshes resolve out of order', async () => {
    const both = [
      { id: 's1', cwd: 'C:\\repo', title: 'A' },
      { id: 's2', cwd: 'C:\\repo', title: 'B' }
    ]
    let armed = false
    const pendingResolvers: Array<() => void> = []
    const controller = makeController({
      listSessions: async () => {
        if (!armed) return both
        await new Promise<void>((r) => { pendingResolvers.push(r) })
        return both
      },
      isSessionReady: () => true
    })
    controller.enable()
    await controller.refreshSessions()
    armed = true
    const p1 = controller.handleFocus('s1')
    await new Promise((r) => setTimeout(r, 5))
    const p2 = controller.handleFocus('s2')
    await new Promise((r) => setTimeout(r, 5))
    expect(pendingResolvers.length).toBe(2)
    // Resolve s2's refresh first, then the older s1 refresh
    pendingResolvers[1]!()
    await p2
    pendingResolvers[0]!()
    const r1 = await p1
    expect(r1.ok).toBe(false)
    expect(controller.getFocusSessionId()).toBe('s2')
    expect(controller.getSnapshot().focusStatus).toBe('ready')
  })

  it('create success keeps optimistic session visible in snapshot', async () => {
    const listed: SessionSummary[] = [{ id: 's1', cwd: 'C:\\repo', title: 'Alpha' }]
    const controller = makeController({
      listSessions: () => listed,
      createSession: async () => ({ sessionId: 's2', cwd: 'C:\\repo' }),
      isSessionReady: (id) => id === 's2' || id === 's1',
      loadSession: vi.fn().mockResolvedValue(undefined)
    })
    controller.enable()
    await controller.refreshSessions()
    const result = await controller.handleCreateSession('C:\\repo')
    expect(result.ok).toBe(true)
    const snap = controller.getSnapshot()
    expect(snap.sessions.some((s) => s.id === 's2')).toBe(true)
    expect(snap.focusSessionId).toBe('s2')
  })

  it('yolo disable switches to ask without revoking remote', async () => {
    const setPermissionMode = vi.fn().mockResolvedValue('ask')
    let mode: 'ask' | 'always-approve' = 'always-approve'
    const controller = makeController({
      getPermissionMode: () => mode,
      setPermissionMode: async (next) => {
        mode = next as typeof mode
        return setPermissionMode(next)
      }
    })
    controller.enable()
    const opened = controller.regeneratePairing()!
    const paired = controller.auth.pair(opened.pairingSecret, opened.pin, 1_000_000)
    expect(paired.ok).toBe(true)
    const result = await controller.handleYoloDisable()
    expect(result.ok).toBe(true)
    expect(setPermissionMode).toHaveBeenCalledWith('ask')
    expect(controller.isEnabled()).toBe(true)
    expect(controller.auth.hasActiveSession(1_000_001)).toBe(true)
  })
})
