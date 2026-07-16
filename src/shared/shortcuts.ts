import type { ShortcutBinding } from './types'

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { command: 'searchTranscript', accelerator: 'Ctrl+F', scope: 'global' },
  { command: 'commandPalette', accelerator: 'Ctrl+Shift+P', scope: 'global' },
  { command: 'newSession', accelerator: 'Ctrl+N', scope: 'global' },
  { command: 'searchSessions', accelerator: 'Ctrl+K', scope: 'global' },
  { command: 'toggleSidebar', accelerator: 'Ctrl+B', scope: 'global' },
  { command: 'togglePreview', accelerator: 'Ctrl+Shift+V', scope: 'global' },
  { command: 'cancelTurn', accelerator: 'Escape', scope: 'global' },
  { command: 'jumpToLatest', accelerator: 'Ctrl+End', scope: 'transcript' },
  { command: 'sendPrompt', accelerator: 'Enter', scope: 'composer' },
  { command: 'newline', accelerator: 'Shift+Enter', scope: 'composer' }
]

const order = ['Ctrl', 'Alt', 'Shift', 'Meta']
export function normalizeAccelerator(value: string): string {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  const normalized = parts.map((part) => {
    const lower = part.toLowerCase()
    if (lower === 'control' || lower === 'ctrl') return 'Ctrl'
    if (lower === 'alt') return 'Alt'
    if (lower === 'shift') return 'Shift'
    if (lower === 'meta' || lower === 'win') return 'Meta'
    if (lower === 'escape' || lower === 'esc') return 'Escape'
    if (lower === 'enter') return 'Enter'
    if (lower === 'end') return 'End'
    return part.length === 1 ? part.toUpperCase() : part[0]?.toUpperCase() + part.slice(1)
  })
  return [...normalized.filter((part) => order.includes(part)).sort((a, b) => order.indexOf(a) - order.indexOf(b)), ...normalized.filter((part) => !order.includes(part))].join('+')
}

export type ShortcutKeyEvent = { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }

export function acceleratorFromEvent(event: ShortcutKeyEvent): string {
  const key = event.key === ' ' ? 'Space' : event.key
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return ''
  const parts = [
    ...(event.ctrlKey ? ['Ctrl'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    ...(event.metaKey ? ['Meta'] : []),
    key.length === 1 ? key.toUpperCase() : key
  ]
  return normalizeAccelerator(parts.join('+'))
}

export function commandForEvent(
  bindings: ShortcutBinding[],
  event: ShortcutKeyEvent,
  scopes: ReadonlyArray<ShortcutBinding['scope']> = ['global', 'transcript']
): string | null {
  const accelerator = acceleratorFromEvent(event)
  if (!accelerator) return null
  const binding = bindings.find((item) => scopes.includes(item.scope) && normalizeAccelerator(item.accelerator) === accelerator)
  return binding?.command ?? null
}

export function findShortcutConflicts(bindings: ShortcutBinding[]): Array<{ accelerator: string; commands: string[] }> {
  const groups = new Map<string, ShortcutBinding[]>()
  for (const binding of bindings) {
    const accelerator = normalizeAccelerator(binding.accelerator)
    const key = `${accelerator}:${binding.scope === 'global' ? '*' : binding.scope}`
    const globalKey = `${accelerator}:*`
    const existing = groups.get(key) ?? []
    groups.set(key, [...existing, binding])
    if (binding.scope !== 'global' && groups.has(globalKey)) groups.set(key, [...(groups.get(key) ?? []), ...(groups.get(globalKey) ?? [])])
    if (binding.scope === 'global') {
      for (const scope of ['composer', 'transcript']) {
        const scopedKey = `${accelerator}:${scope}`
        if (groups.has(scopedKey)) groups.set(scopedKey, [...(groups.get(scopedKey) ?? []), binding])
      }
    }
  }
  const conflicts = new Map<string, Set<string>>()
  for (const entries of groups.values()) {
    if (entries.length < 2) continue
    const accelerator = normalizeAccelerator(entries[0].accelerator)
    const commands = conflicts.get(accelerator) ?? new Set<string>()
    entries.forEach((entry) => commands.add(entry.command))
    conflicts.set(accelerator, commands)
  }
  return [...conflicts.entries()].map(([accelerator, commands]) => ({ accelerator, commands: [...commands] }))
}
