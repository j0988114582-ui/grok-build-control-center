import { describe, expect, it } from 'vitest'
import {
  formatRelativeSessionTime,
  groupSessionsByProject,
  partitionPinnedSessions,
  sessionDisplayTitle,
  sortSessions
} from '../src/renderer/src/components/session-groups'
import type { SessionSummary } from '../src/shared/types'

const sessions: SessionSummary[] = [
  { id: '1', cwd: 'C:\\work\\alpha', title: 'First', updatedAt: '2026-08-21T10:00:00Z' },
  { id: '2', cwd: 'C:\\work\\beta', title: 'Second', updatedAt: '2026-08-21T12:00:00Z' },
  { id: '3', cwd: 'C:\\work\\alpha', title: 'Third', updatedAt: '2026-08-20T10:00:00Z' }
]

describe('session grouping', () => {
  it('groups sessions by cwd while keeping the original order', () => {
    expect(groupSessionsByProject(sessions).map((group) => [group.name, group.sessions.map((session) => session.id)])).toEqual([
      ['alpha', ['1', '3']],
      ['beta', ['2']]
    ])
  })

  it('uses a local title override without mutating the CLI title', () => {
    expect(sessionDisplayTitle(sessions[0], { 1: '我的任務' })).toBe('我的任務')
    expect(sessions[0].title).toBe('First')
  })

  it('partitions global pinned sessions in pin order', () => {
    const { pinned, unpinned } = partitionPinnedSessions(sessions, ['3', 'missing', '1'])
    expect(pinned.map((session) => session.id)).toEqual(['3', '1'])
    expect(unpinned.map((session) => session.id)).toEqual(['2'])
  })
})

describe('session sorting', () => {
  it('sorts by last update by default', () => {
    expect(sortSessions(sessions, { mode: 'updated' }).map((session) => session.id)).toEqual(['2', '1', '3'])
  })

  it('sorts by local lastOpenedAt, then update time', () => {
    expect(sortSessions(sessions, {
      mode: 'opened',
      lastOpenedAt: { 3: 300, 1: 100 }
    }).map((session) => session.id)).toEqual(['3', '1', '2'])
  })

  it('sorts by display title', () => {
    expect(sortSessions(sessions, {
      mode: 'name',
      titleOverrides: { 2: 'AAA' }
    }).map((session) => session.id)).toEqual(['2', '1', '3'])
  })

  it('puts running sessions first', () => {
    expect(sortSessions(sessions, { mode: 'running', runningIds: ['3'] }).map((session) => session.id)).toEqual(['3', '2', '1'])
  })
})

describe('relative session time', () => {
  const now = Date.parse('2026-08-21T12:00:00Z')

  it('uses 剛剛 / 分鐘前 / 小時前 / 天前', () => {
    expect(formatRelativeSessionTime(new Date(now - 20_000).toISOString(), now)).toBe('剛剛')
    expect(formatRelativeSessionTime(new Date(now - 3 * 60_000).toISOString(), now)).toBe('3 分鐘前')
    expect(formatRelativeSessionTime(new Date(now - 2 * 3_600_000).toISOString(), now)).toBe('2 小時前')
    expect(formatRelativeSessionTime(new Date(now - 4 * 86_400_000).toISOString(), now)).toBe('4 天前')
  })

  it('returns empty for missing or invalid dates', () => {
    expect(formatRelativeSessionTime(undefined, now)).toBe('')
    expect(formatRelativeSessionTime('not-a-date', now)).toBe('')
  })
})
