/**
 * Bounded F3 probe: only document known session-related capability flags.
 * Do not auto-expand to every unknown key as a product feature.
 */

export type BoundedSessionCapability =
  | 'loadSession'
  | 'list'
  | 'fork'
  | 'rename'
  | 'history'

export type SessionCapabilityProbe = {
  loadSession: boolean
  /** Keys present under agent sessionCapabilities that match our bounded set. */
  bounded: Partial<Record<BoundedSessionCapability, boolean>>
  /** Unknown keys (for matrix / logs only — do not auto-build UI). */
  unknownKeys: string[]
  /** Human matrix rows for feature panel. */
  matrix: Array<{ id: string; available: boolean; route: 'native' | 'tui' | 'unavailable' }>
}

const BOUNDED_KEYS: BoundedSessionCapability[] = ['list', 'fork', 'rename', 'history']

export function probeSessionCapabilities(
  caps: { loadSession?: boolean; sessionCapabilities?: Record<string, unknown> } | null | undefined
): SessionCapabilityProbe {
  const sessionCapabilities = caps?.sessionCapabilities && typeof caps.sessionCapabilities === 'object'
    ? caps.sessionCapabilities
    : {}
  const keys = Object.keys(sessionCapabilities)
  const bounded: Partial<Record<BoundedSessionCapability, boolean>> = {}
  const unknownKeys: string[] = []

  for (const key of keys) {
    const lower = key.toLowerCase()
    const match = BOUNDED_KEYS.find((b) => b === lower || lower.includes(b))
    if (match) {
      const raw = sessionCapabilities[key]
      bounded[match] = raw === true || raw === 'true' || (raw != null && raw !== false)
    } else {
      unknownKeys.push(key)
    }
  }

  const loadSession = caps?.loadSession === true
  const matrix: SessionCapabilityProbe['matrix'] = [
    { id: 'loadSession', available: loadSession, route: loadSession ? 'native' : 'unavailable' },
    ...BOUNDED_KEYS.map((id) => {
      const available = bounded[id] === true
      return {
        id,
        available,
        route: (available ? 'native' : 'tui') as 'native' | 'tui'
      }
    })
  ]

  return { loadSession, bounded, unknownKeys, matrix }
}
