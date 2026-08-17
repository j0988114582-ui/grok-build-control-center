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

/**
 * Live CLI 1.0.3 official English descriptions, localized for the palette.
 * Unknown names keep the official English fallback — do not invent commands.
 */
const SLASH_DESCRIPTION_ZH: Record<string, string> = {
  compact: '壓縮對話歷史以節省 context 用量',
  'always-approve': '切換一律核准模式（略過權限提示）',
  context: '顯示 context 用量與對話統計',
  'session-info': '顯示對話詳情（模型、回合、context 用量）',
  'deep-research': '針對主題啟動深度研究',
  workflow: '啟動或管理工作流',
  goal: '設定、管理或查看自主目標',
  plugins: '管理外掛（列出、重新載入、信任、新增、移除）',
  'reload-plugins': '從磁碟重新載入外掛（/plugins reload 的別名）',
  loop: '依間隔重複執行提示'
}

export function localizeSlashDescription(name: string, official?: string): string | undefined {
  return SLASH_DESCRIPTION_ZH[name] ?? (official?.trim() ? official : undefined)
}

/**
 * `/always-approve` is a GUI permission-mode switch, not a prompt.
 * Only a lone command (optional on/off) is intercepted; extra words still go to the agent.
 */
export function parseAlwaysApproveSlash(text: string): 'on' | 'off' | 'toggle' | null {
  const match = text.trim().match(/^\/always-approve(?:\s+(on|off))?\s*$/i)
  if (!match) return null
  const flag = match[1]?.toLowerCase()
  if (flag === 'off') return 'off'
  if (flag === 'on') return 'on'
  return 'toggle'
}

/** Build palette rows for every available slash command. */
export function buildSlashPaletteEntries(commands: AvailableSlashCommand[]): BuiltPaletteEntry[] {
  return commands.map((command) => {
    const localized = localizeSlashDescription(command.name, command.description)
    const description = [localized, command.inputHint ? `參數：${command.inputHint}` : '']
      .filter(Boolean)
      .join(' · ') || undefined
    return {
      id: `slash:${command.name}`,
      label: `/${command.name}`,
      description,
      keywords: [command.name, 'slash', 'command', '命令', localized ?? '', command.description ?? '', command.inputHint ?? '']
        .filter(Boolean)
        .join(' '),
      // Trailing space so the user can type arguments immediately.
      insertText: `/${command.name} `
    }
  })
}
