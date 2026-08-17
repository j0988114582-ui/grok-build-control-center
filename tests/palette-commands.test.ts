import { describe, expect, it } from 'vitest'
import { buildSlashPaletteEntries, normalizeAvailableCommands, parseAlwaysApproveSlash } from '../src/shared/palette-commands'

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

  it('maps well-known slash descriptions to zh-TW and keeps official English as fallback', () => {
    const entries = buildSlashPaletteEntries([
      { name: 'compact', description: 'Compress conversation history to save context window' },
      { name: 'always-approve', description: 'Toggle always-approve mode (skip all permission prompts)' },
      { name: 'context', description: 'Show context window usage and session stats' },
      { name: 'session-info', description: 'Show session details (model, turns, context usage)' },
      { name: 'deep-research', description: 'Start a deep research task' },
      { name: 'workflow', description: 'Launch or manage a workflow' },
      { name: 'goal', description: 'Set, manage, or check an autonomous goal' },
      { name: 'plugins', description: 'Manage plugins (list, reload, trust, add, remove)' },
      { name: 'reload-plugins', description: 'Reload plugins from disk (alias for /plugins reload)' },
      { name: 'mystery-cmd', description: 'Official English leftover' }
    ])
    expect(entries.find((item) => item.id === 'slash:compact')?.description).toContain('壓縮對話歷史')
    expect(entries.find((item) => item.id === 'slash:always-approve')?.description).toContain('一律核准')
    expect(entries.find((item) => item.id === 'slash:context')?.description).toContain('context 用量')
    expect(entries.find((item) => item.id === 'slash:session-info')?.description).toContain('對話詳情')
    expect(entries.find((item) => item.id === 'slash:deep-research')?.description).toContain('深度研究')
    expect(entries.find((item) => item.id === 'slash:workflow')?.description).toContain('工作流')
    expect(entries.find((item) => item.id === 'slash:goal')?.description).toContain('自主目標')
    expect(entries.find((item) => item.id === 'slash:plugins')?.description).toContain('外掛')
    expect(entries.find((item) => item.id === 'slash:reload-plugins')?.description).toContain('重新載入外掛')
    expect(entries.find((item) => item.id === 'slash:mystery-cmd')?.description).toBe('Official English leftover')
  })

  it('treats a lone /always-approve as a GUI permission switch, not a prompt', () => {
    expect(parseAlwaysApproveSlash('/always-approve')).toBe('toggle')
    expect(parseAlwaysApproveSlash('/always-approve on')).toBe('on')
    expect(parseAlwaysApproveSlash('/always-approve off')).toBe('off')
    expect(parseAlwaysApproveSlash('/always-approve on and also write a file')).toBeNull()
    expect(parseAlwaysApproveSlash('/compact')).toBeNull()
  })
})
