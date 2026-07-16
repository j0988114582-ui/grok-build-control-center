/** Agents Team: multi-session side-by-side (max 3 panes). */

export const AGENTS_TEAM_MAX = 3

export type AgentsTeamState = {
  /** Ordered session ids currently shown as team panes. */
  slots: string[]
  /** Session that receives keyboard / primary chrome focus. */
  focusId: string | null
}

export const emptyAgentsTeam = (): AgentsTeamState => ({
  slots: [],
  focusId: null
})

/** Toggle a session into/out of the team. Returns next state. */
export function toggleTeamSlot(state: AgentsTeamState, sessionId: string): AgentsTeamState {
  if (!sessionId) return state
  const idx = state.slots.indexOf(sessionId)
  if (idx >= 0) {
    const slots = state.slots.filter((id) => id !== sessionId)
    const focusId =
      state.focusId === sessionId
        ? (slots[Math.max(0, idx - 1)] ?? slots[0] ?? null)
        : state.focusId && slots.includes(state.focusId)
          ? state.focusId
          : (slots[0] ?? null)
    return { slots, focusId }
  }
  if (state.slots.length >= AGENTS_TEAM_MAX) {
    // Replace oldest (first) when full, keep order of remaining.
    const slots = [...state.slots.slice(1), sessionId]
    return { slots, focusId: sessionId }
  }
  return { slots: [...state.slots, sessionId], focusId: sessionId }
}

export function setTeamFocus(state: AgentsTeamState, sessionId: string): AgentsTeamState {
  if (!sessionId || !state.slots.includes(sessionId)) return state
  return { ...state, focusId: sessionId }
}

export function removeTeamSlot(state: AgentsTeamState, sessionId: string): AgentsTeamState {
  if (!state.slots.includes(sessionId)) return state
  return toggleTeamSlot(state, sessionId)
}

/** Ensure focus is valid after sessions deleted; prune missing ids. */
export function pruneTeamSlots(state: AgentsTeamState, existingIds: Iterable<string>): AgentsTeamState {
  const live = new Set(existingIds)
  const slots = state.slots.filter((id) => live.has(id))
  const focusId =
    state.focusId && slots.includes(state.focusId) ? state.focusId : (slots[0] ?? null)
  return { slots, focusId }
}

/** When not in multi-pane mode, single active still drives the main column. */
export function teamPaneIds(state: AgentsTeamState, activeId: string | null, teamEnabled: boolean): string[] {
  if (!teamEnabled || state.slots.length === 0) {
    return activeId ? [activeId] : []
  }
  return state.slots
}

export function isInTeam(state: AgentsTeamState, sessionId: string): boolean {
  return state.slots.includes(sessionId)
}
