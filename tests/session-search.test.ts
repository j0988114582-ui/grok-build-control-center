import { describe, expect, it } from 'vitest'
import {
  buildSessionSearchIndex,
  filterSessionsBySearch
} from '../src/shared/session-search'
import type { SessionSummary } from '../src/shared/types'

const sessions: SessionSummary[] = [
  { id: 'a', cwd: 'C:\\repo-alpha', title: 'Fix tests' },
  { id: 'b', cwd: 'C:\\other\\beta', title: 'Deploy' }
]

describe('session-search', () => {
  it('matches raw title, local title, cwd, and draft case-insensitively', () => {
    const index = buildSessionSearchIndex(sessions, {
      titleOverrides: { a: '銀河任務' },
      drafts: { b: 'TODO: release NOTES' }
    })
    expect(filterSessionsBySearch(sessions, index, 'fix').map((s) => s.id)).toEqual(['a'])
    expect(filterSessionsBySearch(sessions, index, '銀河').map((s) => s.id)).toEqual(['a'])
    expect(filterSessionsBySearch(sessions, index, 'beta').map((s) => s.id)).toEqual(['b'])
    expect(filterSessionsBySearch(sessions, index, 'release').map((s) => s.id)).toEqual(['b'])
    expect(filterSessionsBySearch(sessions, index, 'REPO-ALPHA').map((s) => s.id)).toEqual(['a'])
  })

  it('empty query returns all sessions', () => {
    const index = buildSessionSearchIndex(sessions)
    expect(filterSessionsBySearch(sessions, index, '  ')).toHaveLength(2)
  })
})
