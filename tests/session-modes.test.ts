import { describe, expect, it } from 'vitest'
import { localizeSessionMode, localizeSessionModes, sessionModeControlTitle } from '../src/shared/session-modes'

describe('session mode Chinese UX (F-RT-4)', () => {
  it('localizes known plan/agent modes', () => {
    expect(localizeSessionMode({ id: 'plan', name: 'Plan' })).toEqual({
      id: 'plan',
      name: '計畫模式',
      description: expect.stringContaining('規劃')
    })
    expect(localizeSessionMode({ id: 'code', name: 'Code' }).name).toBe('執行模式')
  })

  it('keeps unknown modes with their agent-provided name', () => {
    expect(localizeSessionMode({ id: 'custom-x', name: 'Special Mode' })).toEqual({
      id: 'custom-x',
      name: 'Special Mode'
    })
  })

  it('builds a Chinese control title', () => {
    const modes = localizeSessionModes([
      { id: 'plan', name: 'Plan' },
      { id: 'code', name: 'Code' }
    ])
    expect(modes.map((mode) => mode.name)).toEqual(['計畫模式', '執行模式'])
    expect(sessionModeControlTitle('plan', [{ id: 'plan', name: 'Plan' }])).toContain('計畫模式')
  })
})
