import { describe, expect, it } from 'vitest'
import { buildSlashPaletteEntries, normalizeAvailableCommands } from '../src/shared/palette-commands'

describe('availableCommands → palette (F-RT-5)', () => {
  it('normalizes, dedupes, and keeps inputHint', () => {
    const commands = normalizeAvailableCommands([
      { name: 'compact', description: '壓縮 context', inputHint: '' },
      { name: '/context', description: 'Show context', hint: '<detail>' },
      { name: 'compact', description: 'duplicate ignored' },
      { name: 1 },
      null
    ])
    expect(commands).toEqual([
      { name: 'compact', description: '壓縮 context' },
      { name: 'context', description: 'Show context', inputHint: '<detail>' }
    ])
  })

  it('builds palette rows for every command with insert text', () => {
    const entries = buildSlashPaletteEntries([
      { name: 'compact', description: '壓縮', inputHint: 'optional' },
      { name: 'session-info' }
    ])
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: 'slash:compact',
      label: '/compact',
      insertText: '/compact ',
      description: expect.stringContaining('參數：optional')
    })
    expect(entries[1].id).toBe('slash:session-info')
    expect(entries[0].keywords).toContain('命令')
  })
})
