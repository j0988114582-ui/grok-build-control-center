import { describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUTS, acceleratorFromEvent, commandForEvent, findShortcutConflicts, normalizeAccelerator } from '../src/shared/shortcuts'

describe('shortcuts', () => {
  it('normalizes equivalent accelerator spellings', () => {
    expect(normalizeAccelerator(' ctrl + shift + p ')).toBe('Ctrl+Shift+P')
  })

  it('detects duplicate shortcuts within overlapping scopes', () => {
    const bindings = [...DEFAULT_SHORTCUTS, { command: 'other', accelerator: 'ctrl+f', scope: 'global' as const }]
    expect(findShortcutConflicts(bindings)).toContainEqual(expect.objectContaining({ accelerator: 'Ctrl+F' }))
  })

  it('converts keyboard events into normalized accelerators', () => {
    expect(acceleratorFromEvent({ key: 'f', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe('Ctrl+F')
    expect(acceleratorFromEvent({ key: 'p', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe('Ctrl+Shift+P')
    expect(acceleratorFromEvent({ key: 'Escape', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe('Escape')
    expect(acceleratorFromEvent({ key: 'Control', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe('')
  })

  it('resolves user-customized bindings so the settings UI is not a placebo', () => {
    const custom = DEFAULT_SHORTCUTS.map((binding) => binding.command === 'newSession' ? { ...binding, accelerator: 'Ctrl+Shift+N' } : binding)
    const event = { key: 'n', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false }
    expect(commandForEvent(custom, event)).toBe('newSession')
    expect(commandForEvent(DEFAULT_SHORTCUTS, event)).toBeNull()
    expect(commandForEvent(DEFAULT_SHORTCUTS, { key: 'Enter', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, ['composer'])).toBe('sendPrompt')
    expect(commandForEvent(DEFAULT_SHORTCUTS, { key: 'End', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBe('jumpToLatest')
  })
})
