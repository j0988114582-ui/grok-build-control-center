import { describe, expect, it, vi } from 'vitest'
import { GrokAcpClient } from '../src/main/acp-client'
import type { AgentCapabilities } from '../src/shared/types'

// start() is idempotent on a live connection and replies with cached capabilities,
// so the cache must follow every session/new, session/load, setMode and setModel.

const callbacks = { onEvent: vi.fn(), onPermission: vi.fn(), onStderr: vi.fn(), onExit: vi.fn() }

type Internals = { context: { request: ReturnType<typeof vi.fn> }; capabilities: AgentCapabilities }

const prepare = (response: unknown): { client: GrokAcpClient; internals: Internals; request: ReturnType<typeof vi.fn> } => {
  const client = new GrokAcpClient('C:\\Users\\demo\\.grok\\bin\\grok.exe', callbacks)
  const request = vi.fn().mockResolvedValue(response)
  const internals = client as unknown as Internals
  internals.context = { request }
  return { client, internals, request }
}

describe('cached capability synchronization', () => {
  it('stores session modes, current mode, and model state from session/new', async () => {
    const { client, internals } = prepare({
      sessionId: 'abc',
      modes: { currentModeId: 'plan', availableModes: [{ id: 'plan', name: 'Plan' }, { id: 'normal', name: 'Normal' }] },
      models: { currentModelId: 'grok-4.5', availableModels: [{ modelId: 'grok-4.5', name: 'Grok 4.5' }] }
    })

    const created = await client.createSession('C:\\Users\\demo\\project')

    expect(created.models?.currentModelId).toBe('grok-4.5')
    expect(internals.capabilities.modes).toEqual([{ id: 'plan', name: 'Plan' }, { id: 'normal', name: 'Normal' }])
    expect(internals.capabilities.currentModeId).toBe('plan')
    expect(internals.capabilities.modelState?.currentModelId).toBe('grok-4.5')
  })

  it('keeps the previous model state when session/load omits models, but drops a stale current mode', async () => {
    const { client, internals } = prepare({ sessionId: 'abc', modes: { availableModes: [{ id: 'normal', name: 'Normal' }] } })
    internals.capabilities.currentModeId = 'plan'
    internals.capabilities.modelState = { currentModelId: 'grok-4.5', availableModels: [] }

    await client.loadSession('abc', 'C:\\Users\\demo\\project')

    expect(internals.capabilities.currentModeId).toBeUndefined()
    expect(internals.capabilities.modelState).toEqual({ currentModelId: 'grok-4.5', availableModels: [] })
  })

  it('moves the cached current mode after a successful setMode', async () => {
    const { client, internals, request } = prepare({})
    internals.capabilities.currentModeId = 'plan'

    await client.setMode('abc', 'normal')

    expect(request).toHaveBeenCalledTimes(1)
    expect(internals.capabilities.currentModeId).toBe('normal')
  })

  it('moves the cached model selection and reasoning effort after a successful setModel', async () => {
    const { client, internals } = prepare({})
    internals.capabilities.modelState = {
      currentModelId: 'grok-4.5',
      availableModels: [
        { modelId: 'grok-4.5', name: 'Grok 4.5', currentReasoningEffort: 'high', reasoningEfforts: [] },
        { modelId: 'grok-composer-2.5-fast', name: 'Composer 2.5', reasoningEfforts: [] }
      ]
    }

    await client.setModel('abc', 'grok-composer-2.5-fast', 'low')

    expect(internals.capabilities.modelState?.currentModelId).toBe('grok-composer-2.5-fast')
    expect(internals.capabilities.modelState?.availableModels).toEqual([
      { modelId: 'grok-4.5', name: 'Grok 4.5', currentReasoningEffort: 'high', reasoningEfforts: [] },
      { modelId: 'grok-composer-2.5-fast', name: 'Composer 2.5', currentReasoningEffort: 'low', reasoningEfforts: [] }
    ])
  })

  it('does not fabricate model state on setModel when none was ever reported', async () => {
    const { client, internals } = prepare({})

    await client.setModel('abc', 'grok-4.5')

    expect(internals.capabilities.modelState).toBeUndefined()
  })
})
