import { describe, expect, it, vi } from 'vitest'
import { AcpConnectionState, reportAsyncError } from '../src/main/acp-connection-state'

describe('AcpConnectionState', () => {
  it('rejects stale A -> B -> A startup completions and ignores stale exits', () => {
    const state = new AcpConnectionState<object>()
    const a1 = {}
    const b = {}
    const a2 = {}
    const first = state.begin()
    const second = state.begin()
    const third = state.begin()

    expect(state.commit(first, a1)).toBe(false)
    expect(state.commit(second, b)).toBe(false)
    expect(state.commit(third, a2)).toBe(true)
    expect(state.release(a1)).toBe(false)
    expect(state.current).toBe(a2)
    expect(state.release(a2)).toBe(true)
    expect(state.current).toBeNull()
  })
})

describe('reportAsyncError', () => {
  it('routes an asynchronous rejection to the supplied reporter', async () => {
    const report = vi.fn()
    reportAsyncError(Promise.reject(new Error('no browser handler')), report)
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('no browser handler'))
  })
})
