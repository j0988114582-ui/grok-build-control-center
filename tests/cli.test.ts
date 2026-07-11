import { describe, expect, it } from 'vitest'
import { buildAgentArgs, parseGrokVersion, resolveGrokExecutable } from '../src/main/grok-cli'

describe('Grok CLI detection', () => {
  it('parses the installed CLI version format', () => {
    expect(parseGrokVersion('grok 0.2.93 (f00f96316d)')).toEqual({ version: '0.2.93', revision: 'f00f96316d' })
  })

  it('prefers an explicitly configured executable', () => {
    expect(resolveGrokExecutable('D:\\tools\\grok.exe', 'C:\\Users\\me')).toBe('D:\\tools\\grok.exe')
  })

  it('starts the structured ACP agent without a shell or debug logging', () => {
    expect(buildAgentArgs()).toEqual(['agent', '--no-leader', 'stdio'])
  })
})
