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

describe('remote-controller', () => {
  it('blocks enable while YOLO is active', () => {
    const controller = makeController({ getPermissionMode: () => 'always-approve' })
    const result = controller.enable()
    expect(result.ok).toBe(false)
  })

  it('blocks YOLO while remote enabled', () => {
    const controller = makeController()
    expect(controller.enable().ok).toBe(true)
    expect(controller.assertCanEnableYolo().ok).toBe(false)
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
    // single consume
    expect(controller2.handlePermissionRespond('permission:2', 'once').ok).toBe(false)
  })

  it('snapshot redacts cwd from session list', () => {
    const controller = makeController()
    controller.enable()
    const snap = controller.getSnapshot()
    expect(snap.sessions[0]).toEqual(expect.objectContaining({ id: 's1', title: 'Alpha' }))
    expect(snap.sessions[0]).not.toHaveProperty('cwd')
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
  })
})
