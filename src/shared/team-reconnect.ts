import type { AgentsTeamState } from './agents-team'
import { setTeamFocus } from './agents-team'

/** Snapshot before ACP reconnect / permission-mode rebuild. */
export type TeamReconnectSnapshot = {
  slots: string[]
  activeId: string | null
  focusId: string | null
  teamEnabled: boolean
}

export function snapshotTeamReconnect(
  team: AgentsTeamState,
  activeId: string | null,
  teamEnabled: boolean
): TeamReconnectSnapshot {
  return {
    slots: [...team.slots],
    activeId,
    focusId: team.focusId,
    teamEnabled
  }
}

/**
 * After reloads: restore slot order and focus/active when still present.
 * `stillReadyIds` = sessions that successfully reloaded in the new generation.
 */
export function restoreTeamAfterReconnect(
  snapshot: TeamReconnectSnapshot,
  stillReadyIds: Iterable<string>
): { team: AgentsTeamState; activeId: string | null } {
  const live = new Set(stillReadyIds)
  const slots = snapshot.slots.filter((id) => live.has(id))
  // Prefer prior focus; fall back to prior active; then first slot.
  const preferred =
    (snapshot.focusId && slots.includes(snapshot.focusId) ? snapshot.focusId : null)
    ?? (snapshot.activeId && slots.includes(snapshot.activeId) ? snapshot.activeId : null)
    ?? (slots[0] ?? null)
  let team: AgentsTeamState = { slots, focusId: preferred }
  if (preferred) team = setTeamFocus(team, preferred)

  const activeId =
    (snapshot.activeId && live.has(snapshot.activeId) ? snapshot.activeId : null)
    ?? preferred

  return { team, activeId }
}
