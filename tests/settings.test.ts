import { describe, expect, it } from 'vitest'
import { createDefaultSettings, normalizeSettings } from '../src/shared/settings'

describe('settings', () => {
  it('uses the verified local Grok executable by default', () => {
    expect(createDefaultSettings('C:\\Users\\111').grokExecutable).toBe('C:\\Users\\111\\.grok\\bin\\grok.exe')
  })

  it('clamps unsafe visual values and preserves valid choices', () => {
    expect(normalizeSettings({ fontSize: 60, lineHeight: 0.5, contentWidth: 400, theme: 'light' }, 'C:\\Users\\111')).toMatchObject({
      fontSize: 22, lineHeight: 1.2, contentWidth: 640, theme: 'light'
    })
  })
})
