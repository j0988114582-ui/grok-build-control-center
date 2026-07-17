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
})
