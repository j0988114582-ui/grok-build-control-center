import { describe, expect, it } from 'vitest'
import {
  classifySessions,
  filterSessionsByCwd,
  isEmptySession,
  listSessionCwds,
  SESSION_KEEP_PER_CWD,
  suggestedCleanupSessions
} from '../src/shared/session-hygiene'
import type { SessionSummary } from '../src/shared/types'

const day = 86_400_000
const now = Date.parse('2026-07-17T12:00:00Z')

const s = (over: Partial<SessionSummary> & Pick<SessionSummary, 'id'>): SessionSummary => ({
  id: over.id,
  cwd: over.cwd ?? 'C:\\repo',
  title: over.title ?? over.id,
  updatedAt: over.updatedAt,
  createdAt: over.createdAt,
  messageCount: over.messageCount
})

describe('session-hygiene (P-CLEAN / P-FOLDER)', () => {
  it('treats missing messageCount as not empty (fail-safe)', () => {
    expect(isEmptySession(s({ id: 'a' }))).toBe(false)
    expect(isEmptySession(s({ id: 'b', messageCount: 0 }))).toBe(true)
    expect(isEmptySession(s({ id: 'c', messageCount: 3 }))).toBe(false)
  })

  it('marks pinned / active / team / recent as active', () => {
    const sessions = [
      s({ id: 'pin', updatedAt: new Date(now - 40 * day).toISOString(), messageCount: 0 }),
      s({ id: 'focus', updatedAt: new Date(now - 40 * day).toISOString(), messageCount: 0 }),
      s({ id: 'team', updatedAt: new Date(now - 40 * day).toISOString(), messageCount: 0 }),
      s({ id: 'fresh', updatedAt: new Date(now - 2 * day).toISOString(), messageCount: 2 })
    ]
    const map = classifySessions(sessions, {
      nowMs: now,
      pinnedIds: ['pin'],
      activeSessionId: 'focus',
      teamSessionIds: ['team']
    })
    expect(map.get('pin')).toBe('active')
    expect(map.get('focus')).toBe('active')
    expect(map.get('team')).toBe('active')
    expect(map.get('fresh')).toBe('active')
  })

  it('suggests empty unprotected sessions', () => {
    const sessions = [
      s({ id: 'empty', updatedAt: new Date(now - 20 * day).toISOString(), messageCount: 0 }),
      s({ id: 'kept', updatedAt: new Date(now - 20 * day).toISOString(), messageCount: 5 })
    ]
    const suggested = suggestedCleanupSessions(sessions, { nowMs: now, pinnedIds: [] })
    expect(suggested.map((item) => item.id)).toEqual(['empty'])
  })

  it('U5: same cwd keeps newest 5 non-empty aged; older excess suggested', () => {
    const sessions = Array.from({ length: SESSION_KEEP_PER_CWD + 3 }, (_, i) =>
      s({
        id: `s${i}`,
        cwd: 'C:\\proj',
        updatedAt: new Date(now - (15 + i) * day).toISOString(),
        messageCount: 2
      })
    )
    const map = classifySessions(sessions, { nowMs: now, pinnedIds: [] })
    const active = sessions.filter((item) => map.get(item.id) === 'active').map((item) => item.id)
    const suggested = sessions.filter((item) => map.get(item.id) === 'suggested-cleanup').map((item) => item.id)
    expect(active).toEqual(['s0', 's1', 's2', 's3', 's4'])
    expect(suggested).toEqual(['s5', 's6', 's7'])
  })

  it('10-day window takes precedence over keep-5 (all within 10d stay active)', () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      s({
        id: `n${i}`,
        cwd: 'C:\\hot',
        updatedAt: new Date(now - i * day).toISOString(),
        messageCount: 4
      })
    )
    const map = classifySessions(sessions, { nowMs: now, pinnedIds: [] })
    for (const session of sessions) {
      expect(map.get(session.id)).toBe('active')
    }
  })

  it('folder filter lists full cwd and filters', () => {
    const sessions = [
      s({ id: 'a', cwd: 'C:\\alpha\\proj' }),
      s({ id: 'b', cwd: 'C:\\beta\\proj' }),
      s({ id: 'c', cwd: 'C:\\alpha\\proj' })
    ]
    expect(listSessionCwds(sessions)).toEqual(['C:\\alpha\\proj', 'C:\\beta\\proj'])
    expect(filterSessionsByCwd(sessions, 'C:\\alpha\\proj').map((item) => item.id)).toEqual(['a', 'c'])
    expect(filterSessionsByCwd(sessions, 'all')).toHaveLength(3)
  })
})
