/**
 * F-RT-5: Map full ACP availableCommands into command-palette entries.
 * Keeps GUI-native actions separate from slash commands; dedupes by name.
 */

export type AvailableSlashCommand = {
  name: string
  description?: string
  /** Optional argument hint from agent (e.g. "<path>"). */
  inputHint?: string
}

export type BuiltPaletteEntry = {
  id: string
  label: string
  description?: string
  keywords: string
  /** Text inserted into the composer when the command runs. */
  insertText: string
}

/** Normalize agent command list: keep order, drop invalid, dedupe by name (first wins). */
export function normalizeAvailableCommands(source: unknown): AvailableSlashCommand[] {
  if (!Array.isArray(source)) return []
  const seen = new Set<string>()
  const out: AvailableSlashCommand[] = []
  for (const item of source) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    if (typeof record.name !== 'string' || !record.name.trim()) continue
    const name = record.name.trim().replace(/^\//, '')
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({
      name,
      ...(typeof record.description === 'string' && record.description.trim()
        ? { description: record.description.trim() }
        : {}),
      ...(typeof record.inputHint === 'string' && record.inputHint.trim()
        ? { inputHint: record.inputHint.trim() }
        : typeof record.hint === 'string' && record.hint.trim()
          ? { inputHint: record.hint.trim() }
          : {})
    })
  }
  return out
}

/** Build palette rows for every available slash command. */
export function buildSlashPaletteEntries(commands: AvailableSlashCommand[]): BuiltPaletteEntry[] {
  return commands.map((command) => {
    const description = [command.description, command.inputHint ? `參數：${command.inputHint}` : '']
      .filter(Boolean)
      .join(' · ') || undefined
    return {
      id: `slash:${command.name}`,
      label: `/${command.name}`,
      description,
      keywords: [command.name, 'slash', 'command', '命令', command.description ?? '', command.inputHint ?? '']
        .filter(Boolean)
        .join(' '),
      // Trailing space so the user can type arguments immediately.
      insertText: `/${command.name} `
    }
  })
}
