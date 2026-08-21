import { describe, expect, it } from 'vitest'
import {
  createDefaultSettings,
  normalizeSettings,
  SIDEBAR_ACTIVE_DAYS_DEFAULT,
  SIDEBAR_ACTIVE_DAYS_MAX,
  SIDEBAR_ACTIVE_DAYS_MIN
} from '../src/shared/settings'

describe('settings', () => {
  it('uses the verified local Grok executable by default', () => {
    expect(createDefaultSettings('C:\\Users\\demo')).toMatchObject({
      grokExecutable: 'C:\\Users\\demo\\.grok\\bin\\grok.exe',
      immersion: 'focus',
      effects: { galaxy: true, cursor: true, density: 'medium', reducedMotion: false },
      sessionTitles: {},
      drafts: {},
      pinnedSessions: [],
      recentCommands: [],
      recentPromptTemplates: [],
      preview: expect.objectContaining({ open: false, autoPreviewLatestMedia: false, showHtmlScriptAdvanced: false })
    })
  })

  it('normalizes preview settings and caps recent sessions', () => {
    const recent = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [
      `s${i}`,
      [{ path: `C:\\a\\${i}.png`, kind: 'image', label: `${i}.png` }]
    ]))
    const normalized = normalizeSettings({
      preview: {
        open: true,
        width: 999,
        autoPreviewLatestMedia: true,
        showHtmlScriptAdvanced: true,
        maxImageMb: 500,
        maxVideoMb: 0,
        recentBySession: recent as never
      }
    }, 'C:\\Users\\demo')
    expect(normalized.preview.open).toBe(true)
    expect(normalized.preview.width).toBe(480)
    expect(normalized.preview.maxImageMb).toBe(100)
    expect(normalized.preview.maxVideoMb).toBe(1)
    expect(Object.keys(normalized.preview.recentBySession).length).toBeLessThanOrEqual(20)
  })

  it('clamps unsafe visual values and preserves valid choices', () => {
    expect(normalizeSettings({ fontSize: 60, lineHeight: 0.5, contentWidth: 400, theme: 'light' }, 'C:\\Users\\demo')).toMatchObject({
      fontSize: 22, lineHeight: 1.2, contentWidth: 640, theme: 'light'
    })
  })

  it('migrates legacy settings and rejects invalid v2 effect values', () => {
    expect(normalizeSettings({
      theme: 'dark',
      immersion: 'deep',
      effects: { galaxy: false, cursor: true, density: 'high', reducedMotion: true },
      sessionTitles: { abc: '銀河任務' },
      drafts: { abc: '  keep my work  ' },
      recentCommands: ['compact', 'context', 'compact']
    }, 'C:\\Users\\demo')).toMatchObject({
      immersion: 'deep',
      effects: { galaxy: false, cursor: true, density: 'high', reducedMotion: true },
      sessionTitles: { abc: '銀河任務' },
      drafts: { abc: '  keep my work  ' },
      recentCommands: ['compact', 'context']
    })

    expect(normalizeSettings({
      immersion: 'immersive',
      effects: { galaxy: 'yes', cursor: 1, density: 'ultra', reducedMotion: null },
      sessionTitles: { good: '  保留名稱  ', empty: '', bad: 7 },
      drafts: { good: 'unfinished', empty: '', bad: 7 },
      recentCommands: ['ok', '', 7]
    } as never, 'C:\\Users\\demo')).toMatchObject({
      immersion: 'focus',
      effects: { galaxy: true, cursor: true, density: 'medium', reducedMotion: false },
      sessionTitles: { good: '保留名稱' },
      drafts: { good: 'unfinished' },
      recentCommands: ['ok']
    })
  })

  it('repairs malformed shortcut entries while keeping valid custom accelerators', () => {
    const normalized = normalizeSettings({
      shortcuts: [
        { command: 'newSession', accelerator: 'Ctrl+Shift+N', scope: 'global' },
        { command: 'unknownCommand', accelerator: 'Ctrl+U', scope: 'global' },
        { command: 'cancelTurn' },
        'garbage',
        42
      ]
    } as never, 'C:\\Users\\demo')
    expect(normalized.shortcuts.find((item) => item.command === 'newSession')?.accelerator).toBe('Ctrl+Shift+N')
    expect(normalized.shortcuts.find((item) => item.command === 'cancelTurn')?.accelerator).toBe('Escape')
    expect(normalized.shortcuts.some((item) => item.command === 'unknownCommand')).toBe(false)
    expect(normalized.shortcuts.every((item) => ['global', 'composer', 'transcript'].includes(item.scope))).toBe(true)
  })

  it('rejects malformed, duplicate-command, and conflicting shortcut overrides', () => {
    const normalized = normalizeSettings({
      shortcuts: [
        { command: 'newSession', accelerator: 'Ctrl+', scope: 'global' },
        { command: 'newSession', accelerator: 'Ctrl+Shift+N', scope: 'global' },
        { command: 'searchSessions', accelerator: 'Ctrl+F', scope: 'global' },
        { command: 'commandPalette', accelerator: 'Ctrl+Alt+P', scope: 'global' },
        { command: 'searchTranscript', accelerator: 'Ctrl+Alt+P', scope: 'global' }
      ]
    }, 'C:\\Users\\demo')

    expect(normalized.shortcuts.find((item) => item.command === 'newSession')?.accelerator).toBe('Ctrl+N')
    expect(normalized.shortcuts.find((item) => item.command === 'searchSessions')?.accelerator).toBe('Ctrl+K')
    expect(normalized.shortcuts.find((item) => item.command === 'commandPalette')?.accelerator).toBe('Ctrl+Alt+P')
    expect(normalized.shortcuts.find((item) => item.command === 'searchTranscript')?.accelerator).toBe('Ctrl+F')
  })

  it('defaults the sidebar active-only filter to off with a 4-day window', () => {
    expect(createDefaultSettings('C:\\Users\\demo')).toMatchObject({
      sidebarActiveOnly: false,
      sidebarActiveDays: SIDEBAR_ACTIVE_DAYS_DEFAULT,
      sidebarGroupByFolder: true,
      sidebarSort: 'updated',
      recentProjectCwds: [],
      sessionLastOpenedAt: {}
    })
    expect(SIDEBAR_ACTIVE_DAYS_DEFAULT).toBe(4)
  })

  it('persists ungroup-by-folder and recent project cwds', () => {
    const normalized = normalizeSettings({
      sidebarGroupByFolder: false,
      sidebarSort: 'name',
      recentProjectCwds: ['C:\\alpha\\', 'C:\\beta', 'C:\\alpha', 'C:\\gamma', 'C:\\delta'],
      sessionLastOpenedAt: { s1: 9, bad: 'nope' }
    } as never, 'C:\\Users\\demo')
    expect(normalized.sidebarGroupByFolder).toBe(false)
    expect(normalized.sidebarSort).toBe('name')
    expect(normalized.recentProjectCwds).toEqual(['C:\\alpha', 'C:\\beta', 'C:\\gamma'])
    expect(normalized.sessionLastOpenedAt).toEqual({ s1: 9 })
    expect(normalizeSettings({ sidebarSort: 'nope', sidebarGroupByFolder: 'yes' } as never, 'C:\\Users\\demo')).toMatchObject({
      sidebarSort: 'updated',
      sidebarGroupByFolder: true
    })
  })

  it('keeps last-used prompt templates unique and known', () => {
    const normalized = normalizeSettings({
      recentPromptTemplates: ['plan', 'plan', 'missing', 'fix', '', 7]
    } as never, 'C:\\Users\\demo')
    expect(normalized.recentPromptTemplates).toEqual(['plan', 'fix'])
    expect(normalizeSettings({} as never, 'C:\\Users\\demo').recentPromptTemplates).toEqual([])
  })

  it('clamps the sidebar active window to 1-30 whole days', () => {
    const days = (value: unknown): number =>
      normalizeSettings({ sidebarActiveDays: value } as never, 'C:\\Users\\demo').sidebarActiveDays
    expect(days(0)).toBe(SIDEBAR_ACTIVE_DAYS_MIN)
    expect(days(-12)).toBe(SIDEBAR_ACTIVE_DAYS_MIN)
    expect(days(99)).toBe(SIDEBAR_ACTIVE_DAYS_MAX)
    expect(days(7)).toBe(7)
    expect(days(4.6)).toBe(5)
    expect(days('lots')).toBe(SIDEBAR_ACTIVE_DAYS_DEFAULT)
    expect(days(undefined)).toBe(SIDEBAR_ACTIVE_DAYS_DEFAULT)
    expect(days(Number.NaN)).toBe(SIDEBAR_ACTIVE_DAYS_DEFAULT)
  })

  it('round-trips the sidebar filter toggle so it survives a restart', () => {
    expect(normalizeSettings({ sidebarActiveOnly: true }, 'C:\\Users\\demo').sidebarActiveOnly).toBe(true)
    expect(normalizeSettings({ sidebarActiveOnly: false }, 'C:\\Users\\demo').sidebarActiveOnly).toBe(false)
    // Non-boolean junk falls back to off, not on — an upgrade must never look like a purge.
    expect(normalizeSettings({ sidebarActiveOnly: 'yes' } as never, 'C:\\Users\\demo').sidebarActiveOnly).toBe(false)
  })
})
