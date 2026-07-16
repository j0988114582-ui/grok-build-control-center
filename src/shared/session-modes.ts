/**
 * F-RT-4: Chinese UX labels for ACP session modes (plan / agent / etc.).
 * Falls back to the agent-provided name when the id is unknown.
 */

export type SessionModeOption = { id: string; name: string }

export type LocalizedSessionMode = SessionModeOption & { description?: string }

const MODE_COPY: Record<string, { name: string; description: string }> = {
  plan: { name: '計畫模式', description: '先規劃再動手，適合討論方案與範圍' },
  code: { name: '執行模式', description: '可編輯檔案並執行工具' },
  agent: { name: '代理模式', description: '完整代理能力（依 CLI 定義）' },
  normal: { name: '一般模式', description: '預設工作模式' },
  default: { name: '預設模式', description: 'CLI 預設模式' },
  ask: { name: '詢問模式', description: '偏向說明與問答' },
  edit: { name: '編輯模式', description: '可進行檔案編輯' },
  yolo: { name: 'YOLO 模式', description: '高風險自動核准（若 CLI 暴露此模式）' }
}

/** Known English display names → Chinese (when id is custom but name is familiar). */
const NAME_FALLBACK: Record<string, string> = {
  plan: '計畫模式',
  code: '執行模式',
  agent: '代理模式',
  normal: '一般模式',
  default: '預設模式',
  ask: '詢問模式'
}

export function localizeSessionMode(mode: SessionModeOption): LocalizedSessionMode {
  const key = mode.id.trim().toLowerCase()
  const known = MODE_COPY[key]
  if (known) return { id: mode.id, name: known.name, description: known.description }

  const nameKey = mode.name.trim().toLowerCase()
  const byName = NAME_FALLBACK[nameKey]
  if (byName) return { id: mode.id, name: byName }

  return { id: mode.id, name: mode.name }
}

export function localizeSessionModes(modes: SessionModeOption[]): LocalizedSessionMode[] {
  return modes.map(localizeSessionMode)
}

/** Select title / aria helper when a mode is selected. */
export function sessionModeControlTitle(currentModeId: string | undefined, modes: SessionModeOption[]): string {
  if (!modes.length) return '工作模式（目前 CLI 未提供模式清單）'
  if (!currentModeId) return '工作模式：尚未選擇'
  const current = localizeSessionMode(modes.find((mode) => mode.id === currentModeId) ?? { id: currentModeId, name: currentModeId })
  const tip = current.description ? ` — ${current.description}` : ''
  return `工作模式：${current.name}${tip}`
}
