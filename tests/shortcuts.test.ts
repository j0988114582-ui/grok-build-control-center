import { describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUTS, findShortcutConflicts, normalizeAccelerator } from '../src/shared/shortcuts'

describe('shortcuts', () => {
  it('normalizes equivalent accelerator spellings', () => {
    expect(normalizeAccelerator(' ctrl + shift + p ')).toBe('Ctrl+Shift+P')
  })

  it('detects duplicate shortcuts within overlapping scopes', () => {
    const bindings = [...DEFAULT_SHORTCUTS, { command: 'other', accelerator: 'ctrl+f', scope: 'global' as const }]
    expect(findShortcutConflicts(bindings)).toContainEqual(expect.objectContaining({ accelerator: 'Ctrl+F' }))
  })
})
