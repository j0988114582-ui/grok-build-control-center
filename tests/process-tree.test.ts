import { describe, expect, it, vi } from 'vitest'
import { buildWindowsTaskkillArgs, killProcessTree } from '../src/main/process-tree'
import { buildGrokSpawnEnv } from '../src/main/acp-client'

describe('process-tree kill (F-RT-1)', () => {
  it('builds taskkill /PID /T /F args for Windows tree termination', () => {
    expect(buildWindowsTaskkillArgs(4242)).toEqual(['/PID', '4242', '/T', '/F'])
    expect(() => buildWindowsTaskkillArgs(0)).toThrow(/Invalid process id/)
    expect(() => buildWindowsTaskkillArgs(-1)).toThrow(/Invalid process id/)
  })

  it('invokes taskkill on win32 via the injected runner', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    await killProcessTree(99, { platform: 'win32', run })
    expect(run).toHaveBeenCalledWith('taskkill', ['/PID', '99', '/T', '/F'])
  })

  it('ignores non-positive pids without running anything', async () => {
    const run = vi.fn()
    await killProcessTree(0, { platform: 'win32', run })
    await killProcessTree(-5, { platform: 'win32', run })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('GROK_CLIENT_VERSION spawn env (F-RT-2 / T-RT-2)', () => {
  it('sets GROK_CLIENT_VERSION from the app version without dropping other env', () => {
    const env = buildGrokSpawnEnv('0.5.1', { PATH: 'C:\\Windows', FOO: 'bar' })
    expect(env.GROK_CLIENT_VERSION).toBe('0.5.1')
    expect(env.PATH).toBe('C:\\Windows')
    expect(env.FOO).toBe('bar')
  })
})
