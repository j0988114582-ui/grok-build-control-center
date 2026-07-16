import type { AppSettings, PreviewRecentEntry, PreviewSettings } from './types'
import { DEFAULT_SHORTCUTS, normalizeAccelerator } from './shortcuts'
import {
  DEFAULT_PREVIEW_SETTINGS,
  PREVIEW_DEFAULT_MAX_IMAGE_MB,
  PREVIEW_DEFAULT_MAX_VIDEO_MB,
  PREVIEW_DEFAULT_WIDTH,
  PREVIEW_MAX_RECENT_SESSIONS,
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_WIDTH
} from './preview-types'

const windowsJoin = (...parts: string[]): string => parts.map((part, index) => index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')).join('\\')

export const createDefaultSettings = (homeDir: string): AppSettings => ({
  grokExecutable: windowsJoin(homeDir, '.grok', 'bin', 'grok.exe'),
  theme: 'dark',
  immersion: 'focus',
  effects: { galaxy: true, cursor: true, density: 'medium', reducedMotion: false },
  sessionTitles: {},
  drafts: {},
  pinnedSessions: [],
  recentCommands: [],
  fontSize: 15,
  lineHeight: 1.65,
  contentWidth: 920,
  shortcuts: DEFAULT_SHORTCUTS.map((binding) => ({ ...binding })),
  preview: { ...DEFAULT_PREVIEW_SETTINGS, recentBySession: {} }
})

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

const normalizeSessionTitles = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([sessionId, title]) => {
    const normalized = typeof title === 'string' ? title.trim() : ''
    return sessionId && normalized ? [[sessionId, normalized]] : []
  }))
}

const normalizeDrafts = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([sessionId, draft]) =>
    sessionId && typeof draft === 'string' && draft.trim() ? [[sessionId, draft.slice(0, 200_000)]] : []
  ))
}

const normalizeShortcuts = (value: unknown): AppSettings['shortcuts'] => {
  const overrides = new Map<string, string>()
  const seenCommands = new Set<string>()
  const accepted: Array<{ command: string; accelerator: string; scope: AppSettings['shortcuts'][number]['scope'] }> = []
  const modifiers = new Set(['Ctrl', 'Alt', 'Shift', 'Meta'])
  const scopesOverlap = (left: AppSettings['shortcuts'][number]['scope'], right: AppSettings['shortcuts'][number]['scope']): boolean => left === 'global' || right === 'global' || left === right
  const validAccelerator = (accelerator: string): boolean => {
    const rawParts = accelerator.split('+').map((part) => part.trim())
    if (!rawParts.length || rawParts.some((part) => !part)) return false
    const parts = normalizeAccelerator(accelerator).split('+').filter(Boolean)
    return parts.filter((part) => !modifiers.has(part)).length === 1
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue
      const binding = entry as Record<string, unknown>
      if (typeof binding.command !== 'string' || seenCommands.has(binding.command)) continue
      seenCommands.add(binding.command)
      const fallback = DEFAULT_SHORTCUTS.find((item) => item.command === binding.command)
      if (!fallback || typeof binding.accelerator !== 'string' || !validAccelerator(binding.accelerator)) continue
      const accelerator = normalizeAccelerator(binding.accelerator)
      const conflictsWithDefault = DEFAULT_SHORTCUTS.some((item) => item.command !== fallback.command && scopesOverlap(item.scope, fallback.scope) && normalizeAccelerator(item.accelerator) === accelerator)
      const conflictsWithAccepted = accepted.some((item) => scopesOverlap(item.scope, fallback.scope) && item.accelerator === accelerator)
      if (conflictsWithDefault || conflictsWithAccepted) continue
      overrides.set(fallback.command, accelerator)
      accepted.push({ command: fallback.command, accelerator, scope: fallback.scope })
    }
  }
  return DEFAULT_SHORTCUTS.map((binding) => ({ ...binding, accelerator: overrides.get(binding.command) ?? binding.accelerator }))
}

const normalizeRecentCommands = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()))].slice(0, 8)
}

const normalizePinnedSessions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()))].slice(0, 200)
}

const PREVIEW_KINDS = new Set(['image', 'video', 'html', 'code', 'remote-image'])

const normalizePreviewRecent = (value: unknown): Record<string, PreviewRecentEntry[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>)
    .flatMap(([sessionId, list]) => {
      if (!sessionId || !Array.isArray(list)) return []
      const items = list.flatMap((entry): PreviewRecentEntry[] => {
        if (!entry || typeof entry !== 'object') return []
        const row = entry as Record<string, unknown>
        const kind = typeof row.kind === 'string' && PREVIEW_KINDS.has(row.kind) ? row.kind as PreviewRecentEntry['kind'] : null
        const label = typeof row.label === 'string' ? row.label.trim().slice(0, 240) : ''
        if (!kind || !label) return []
        return [{
          path: typeof row.path === 'string' ? row.path.slice(0, 1000) : undefined,
          kind,
          label,
          mtimeMs: typeof row.mtimeMs === 'number' && Number.isFinite(row.mtimeMs) ? row.mtimeMs : undefined,
          language: typeof row.language === 'string' ? row.language.slice(0, 40) : undefined,
          contentPreview: typeof row.contentPreview === 'string' ? row.contentPreview.slice(0, 2000) : undefined
        }]
      }).slice(0, 50)
      return items.length ? [[sessionId, items] as const] : []
    })
    // Keep most recently listed sessions (object key order is insertion order)
    .slice(-PREVIEW_MAX_RECENT_SESSIONS)
  return Object.fromEntries(entries)
}

const normalizePreview = (value: unknown): PreviewSettings => {
  const defaults = DEFAULT_PREVIEW_SETTINGS
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults, recentBySession: {} }
  }
  const raw = value as Partial<PreviewSettings>
  return {
    open: typeof raw.open === 'boolean' ? raw.open : defaults.open,
    width: clamp(raw.width, PREVIEW_MIN_WIDTH, PREVIEW_MAX_WIDTH, PREVIEW_DEFAULT_WIDTH),
    autoPreviewLatestMedia: typeof raw.autoPreviewLatestMedia === 'boolean' ? raw.autoPreviewLatestMedia : defaults.autoPreviewLatestMedia,
    showHtmlScriptAdvanced: typeof raw.showHtmlScriptAdvanced === 'boolean' ? raw.showHtmlScriptAdvanced : defaults.showHtmlScriptAdvanced,
    maxImageMb: clamp(raw.maxImageMb, 1, 100, PREVIEW_DEFAULT_MAX_IMAGE_MB),
    maxVideoMb: clamp(raw.maxVideoMb, 1, 1024, PREVIEW_DEFAULT_MAX_VIDEO_MB),
    recentBySession: normalizePreviewRecent(raw.recentBySession)
  }
}

export function normalizeSettings(value: Partial<AppSettings> | undefined, homeDir: string): AppSettings {
  const defaults = createDefaultSettings(homeDir)
  return {
    grokExecutable: typeof value?.grokExecutable === 'string' && value.grokExecutable.trim() ? value.grokExecutable : defaults.grokExecutable,
    theme: value?.theme === 'light' ? 'light' : 'dark',
    immersion: value?.immersion === 'deep' ? 'deep' : 'focus',
    effects: {
      galaxy: typeof value?.effects?.galaxy === 'boolean' ? value.effects.galaxy : defaults.effects.galaxy,
      cursor: typeof value?.effects?.cursor === 'boolean' ? value.effects.cursor : defaults.effects.cursor,
      density: value?.effects?.density === 'low' || value?.effects?.density === 'high' ? value.effects.density : 'medium',
      reducedMotion: typeof value?.effects?.reducedMotion === 'boolean' ? value.effects.reducedMotion : defaults.effects.reducedMotion
    },
    sessionTitles: normalizeSessionTitles(value?.sessionTitles),
    drafts: normalizeDrafts(value?.drafts),
    pinnedSessions: normalizePinnedSessions(value?.pinnedSessions),
    recentCommands: normalizeRecentCommands(value?.recentCommands),
    fontSize: clamp(value?.fontSize, 12, 22, defaults.fontSize),
    lineHeight: clamp(value?.lineHeight, 1.2, 2.1, defaults.lineHeight),
    contentWidth: clamp(value?.contentWidth, 640, 1400, defaults.contentWidth),
    shortcuts: normalizeShortcuts(value?.shortcuts),
    preview: normalizePreview(value?.preview)
  }
}
