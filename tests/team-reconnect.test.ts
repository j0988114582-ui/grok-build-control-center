import { describe, expect, it } from 'vitest'
import { emptyAgentsTeam, setTeamFocus, toggleTeamSlot } from '../src/shared/agents-team'
import { restoreTeamAfterReconnect, snapshotTeamReconnect } from '../src/shared/team-reconnect'

describe('team-reconnect', () => {
  it('restores slots order and preferred active/focus when peers survive', () => {
    let team = emptyAgentsTeam()
    team = toggleTeamSlot(team, 'a')
    team = toggleTeamSlot(team, 'b')
    team = toggleTeamSlot(team, 'c')
    team = setTeamFocus(team, 'b')
    const snap = snapshotTeamReconnect(team, 'b', true)
    const restored = restoreTeamAfterReconnect(snap, ['a', 'b', 'c'])
    expect(restored.team.slots).toEqual(['a', 'b', 'c'])
    expect(restored.team.focusId).toBe('b')
    expect(restored.activeId).toBe('b')
  })

  it('isolates failed peer and keeps survivors', () => {
    let team = emptyAgentsTeam()
    team = toggleTeamSlot(team, 'a')
    team = toggleTeamSlot(team, 'b')
    const snap = snapshotTeamReconnect(team, 'a', true)
    const restored = restoreTeamAfterReconnect(snap, ['b'])
    expect(restored.team.slots).toEqual(['b'])
    expect(restored.activeId).toBe('b')
    expect(restored.team.focusId).toBe('b')
  })
})
