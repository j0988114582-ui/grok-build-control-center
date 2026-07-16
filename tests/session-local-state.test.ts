import { describe, expect, it } from 'vitest'
import { createDefaultSettings } from '../src/shared/settings'
import { pruneOrphanSessionLocalData, removeSessionLocalData, togglePinnedSession } from '../src/shared/session-local-state'

describe('session local state', () => {
  const base = {
    ...createDefaultSettings('C:\\Users\\demo'),
    sessionTitles: { a: 'A', b: 'B' },
    drafts: { a: 'draft-a', c: 'draft-c' },
    pinnedSessions: ['b', 'a', 'z']
  }

  it('removes titles drafts and pins for deleted ids', () => {
    expect(removeSessionLocalData(base, ['a', 'z'])).toMatchObject({
      sessionTitles: { b: 'B' },
      drafts: { c: 'draft-c' },
      pinnedSessions: ['b']
    })
  })

  it('prunes orphans not present in live session ids', () => {
    expect(pruneOrphanSessionLocalData(base, ['a'])).toMatchObject({
      sessionTitles: { a: 'A' },
      drafts: { a: 'draft-a' },
      pinnedSessions: ['a']
    })
  })

  it('toggles pin order with newest pin first', () => {
    expect(togglePinnedSession(['b'], 'a')).toEqual(['a', 'b'])
    expect(togglePinnedSession(['a', 'b'], 'a')).toEqual(['b'])
  })
})
