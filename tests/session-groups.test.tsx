import { describe, expect, it } from 'vitest'
import { groupSessionsByProject, sessionDisplayTitle } from '../src/renderer/src/components/session-groups'
import type { SessionSummary } from '../src/shared/types'

const sessions: SessionSummary[] = [
  { id: '1', cwd: 'C:\\work\\alpha', title: 'First' },
  { id: '2', cwd: 'C:\\work\\beta', title: 'Second' },
  { id: '3', cwd: 'C:\\work\\alpha', title: 'Third' }
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
})
