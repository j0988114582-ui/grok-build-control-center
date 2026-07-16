import { describe, expect, it } from 'vitest'
import {
  AGENTS_TEAM_MAX,
  emptyAgentsTeam,
  isInTeam,
  pruneTeamSlots,
  setTeamFocus,
  teamPaneIds,
  toggleTeamSlot
} from '../src/shared/agents-team'

describe('agents-team', () => {
  it('adds sessions up to max and focuses the newest', () => {
    let state = emptyAgentsTeam()
    state = toggleTeamSlot(state, 'a')
    state = toggleTeamSlot(state, 'b')
    state = toggleTeamSlot(state, 'c')
    expect(state.slots).toEqual(['a', 'b', 'c'])
    expect(state.focusId).toBe('c')
    expect(state.slots).toHaveLength(AGENTS_TEAM_MAX)
  })

  it('replaces the oldest slot when full', () => {
    let state = emptyAgentsTeam()
    for (const id of ['a', 'b', 'c']) state = toggleTeamSlot(state, id)
    state = toggleTeamSlot(state, 'd')
    expect(state.slots).toEqual(['b', 'c', 'd'])
    expect(state.focusId).toBe('d')
  })

  it('removes a slot and repairs focus', () => {
    let state = emptyAgentsTeam()
    state = toggleTeamSlot(state, 'a')
    state = toggleTeamSlot(state, 'b')
    state = setTeamFocus(state, 'a')
    state = toggleTeamSlot(state, 'a')
    expect(state.slots).toEqual(['b'])
    expect(state.focusId).toBe('b')
  })

  it('prunes deleted sessions and teamPaneIds respects mode', () => {
    let state = emptyAgentsTeam()
    state = toggleTeamSlot(state, 'a')
    state = toggleTeamSlot(state, 'b')
    state = pruneTeamSlots(state, ['b', 'c'])
    expect(state.slots).toEqual(['b'])
    expect(isInTeam(state, 'b')).toBe(true)
    expect(teamPaneIds(state, 'x', false)).toEqual(['x'])
    expect(teamPaneIds(state, 'x', true)).toEqual(['b'])
  })
})
