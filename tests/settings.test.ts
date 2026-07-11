import { describe, expect, it } from 'vitest'
import { createDefaultSettings, normalizeSettings } from '../src/shared/settings'

describe('settings', () => {
  it('uses the verified local Grok executable by default', () => {
    expect(createDefaultSettings('C:\\Users\\111')).toMatchObject({
      grokExecutable: 'C:\\Users\\111\\.grok\\bin\\grok.exe',
      immersion: 'focus',
      effects: { galaxy: true, cursor: true, density: 'medium', reducedMotion: false },
      sessionTitles: {},
      drafts: {},
      recentCommands: []
    })
  })

  it('clamps unsafe visual values and preserves valid choices', () => {
    expect(normalizeSettings({ fontSize: 60, lineHeight: 0.5, contentWidth: 400, theme: 'light' }, 'C:\\Users\\111')).toMatchObject({
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
    }, 'C:\\Users\\111')).toMatchObject({
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
    } as never, 'C:\\Users\\111')).toMatchObject({
      immersion: 'focus',
      effects: { galaxy: true, cursor: true, density: 'medium', reducedMotion: false },
      sessionTitles: { good: '保留名稱' },
      drafts: { good: 'unfinished' },
      recentCommands: ['ok']
    })
  })
})
