import type { AppSettings } from './types'
import { DEFAULT_SHORTCUTS } from './shortcuts'

const windowsJoin = (...parts: string[]): string => parts.map((part, index) => index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')).join('\\')

export const createDefaultSettings = (homeDir: string): AppSettings => ({
  grokExecutable: windowsJoin(homeDir, '.grok', 'bin', 'grok.exe'),
  theme: 'dark',
  immersion: 'focus',
  effects: { galaxy: true, cursor: true, density: 'medium', reducedMotion: false },
  sessionTitles: {},
  drafts: {},
  recentCommands: [],
  fontSize: 15,
  lineHeight: 1.65,
  contentWidth: 920,
  shortcuts: DEFAULT_SHORTCUTS.map((binding) => ({ ...binding }))
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

const normalizeRecentCommands = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()))].slice(0, 8)
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
    recentCommands: normalizeRecentCommands(value?.recentCommands),
    fontSize: clamp(value?.fontSize, 12, 22, defaults.fontSize),
    lineHeight: clamp(value?.lineHeight, 1.2, 2.1, defaults.lineHeight),
    contentWidth: clamp(value?.contentWidth, 640, 1400, defaults.contentWidth),
    shortcuts: Array.isArray(value?.shortcuts) && value.shortcuts.length ? value.shortcuts : defaults.shortcuts
  }
}
