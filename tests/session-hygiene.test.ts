import { describe, expect, it } from 'vitest'
import {
  classifySessions,
  filterSessionsByActiveWindow,
  filterSessionsByCwd,
  isEmptySession,
  listSessionCwds,
  SESSION_ACTIVE_DAYS,
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

  it('suggests all unprotected aged sessions (10d rule wins over keep-5)', () => {
    const sessions = Array.from({ length: SESSION_KEEP_PER_CWD + 3 }, (_, i) =>
      s({
        id: `s${i}`,
        cwd: 'C:\\proj',
        updatedAt: new Date(now - (15 + i) * day).toISOString(),
        messageCount: 2
      })
    )
    const suggested = suggestedCleanupSessions(sessions, { nowMs: now, pinnedIds: [] })
    expect(suggested).toHaveLength(sessions.length)
  })

  it('suggests empty unprotected sessions', () => {
    const sessions = [
      s({ id: 'empty', updatedAt: new Date(now - 20 * day).toISOString(), messageCount: 0 }),
      s({ id: 'fresh', updatedAt: new Date(now - 1 * day).toISOString(), messageCount: 5 })
    ]
    const suggested = suggestedCleanupSessions(sessions, { nowMs: now, pinnedIds: [] })
    expect(suggested.map((item) => item.id)).toEqual(['empty'])
  })

  it('10-day window keeps all recent sessions active even when >5 per cwd', () => {
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

describe('filterSessionsByActiveWindow (sidebar active-only view)', () => {
  it('keeps sessions inside the window and drops the rest', () => {
    const sessions = [
      s({ id: 'today', updatedAt: new Date(now - 2 * 3_600_000).toISOString() }),
      s({ id: 'edge', updatedAt: new Date(now - 4 * day).toISOString() }),
      s({ id: 'stale', updatedAt: new Date(now - 5 * day).toISOString() })
    ]
    const kept = filterSessionsByActiveWindow(sessions, { nowMs: now, pinnedIds: [] }, 4)
    expect(kept.map((item) => item.id)).toEqual(['today', 'edge'])
  })

  it('never hides the open session, pinned sessions, or Agents Team slots', () => {
    const sessions = [
      s({ id: 'open', updatedAt: new Date(now - 90 * day).toISOString() }),
      s({ id: 'pin', updatedAt: new Date(now - 90 * day).toISOString() }),
      s({ id: 'team', updatedAt: new Date(now - 90 * day).toISOString() }),
      s({ id: 'stale', updatedAt: new Date(now - 90 * day).toISOString() })
    ]
    const kept = filterSessionsByActiveWindow(sessions, {
      nowMs: now,
      pinnedIds: ['pin'],
      activeSessionId: 'open',
      teamSessionIds: ['team']
    }, 4)
    expect(kept.map((item) => item.id)).toEqual(['open', 'pin', 'team'])
  })

  it('falls back to createdAt, and hides sessions with no usable timestamp', () => {
    const sessions = [
      s({ id: 'created-recently', createdAt: new Date(now - 1 * day).toISOString() }),
      s({ id: 'created-long-ago', createdAt: new Date(now - 40 * day).toISOString() }),
      s({ id: 'no-dates' }),
      s({ id: 'garbage-date', updatedAt: 'not-a-date' })
    ]
    const kept = filterSessionsByActiveWindow(sessions, { nowMs: now, pinnedIds: [] }, 4)
    expect(kept.map((item) => item.id)).toEqual(['created-recently'])
  })

  it('a dateless session still shows when pinned', () => {
    const sessions = [s({ id: 'no-dates' })]
    expect(filterSessionsByActiveWindow(sessions, { nowMs: now, pinnedIds: ['no-dates'] }, 4)).toHaveLength(1)
  })

  it('preserves input order and returns a new array', () => {
    const sessions = [
      s({ id: 'a', updatedAt: new Date(now - 3 * day).toISOString() }),
      s({ id: 'b', updatedAt: new Date(now - 1 * day).toISOString() })
    ]
    const kept = filterSessionsByActiveWindow(sessions, { nowMs: now, pinnedIds: [] }, 4)
    expect(kept.map((item) => item.id)).toEqual(['a', 'b'])
    expect(kept).not.toBe(sessions)
  })

  /**
   * Guard rail: the sidebar view window and the 10-day cleanup rule are two
   * different numbers. A 6-day-old session is hidden by a 4-day view but must
   * still classify as 'active' — i.e. it is never a cleanup suggestion.
   */
  it('is independent of the 10-day cleanup rule', () => {
    expect(SESSION_ACTIVE_DAYS).toBe(10)
    const sessions = [s({ id: 'six-days', updatedAt: new Date(now - 6 * day).toISOString(), messageCount: 3 })]
    expect(filterSessionsByActiveWindow(sessions, { nowMs: now, pinnedIds: [] }, 4)).toHaveLength(0)
    expect(classifySessions(sessions, { nowMs: now, pinnedIds: [] }).get('six-days')).toBe('active')
    expect(suggestedCleanupSessions(sessions, { nowMs: now, pinnedIds: [] })).toHaveLength(0)
  })

  it('honours the widest supported window', () => {
    const sessions = [s({ id: 'old', updatedAt: new Date(now - 29 * day).toISOString() })]
    expect(filterSessionsByActiveWindow(sessions, { nowMs: now, pinnedIds: [] }, 30)).toHaveLength(1)
    expect(filterSessionsByActiveWindow(sessions, { nowMs: now, pinnedIds: [] }, 1)).toHaveLength(0)
  })
})
