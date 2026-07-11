import type { AppSettings } from './types'
import { DEFAULT_SHORTCUTS } from './shortcuts'

const windowsJoin = (...parts: string[]): string => parts.map((part, index) => index === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')).join('\\')

export const createDefaultSettings = (homeDir: string): AppSettings => ({
  grokExecutable: windowsJoin(homeDir, '.grok', 'bin', 'grok.exe'),
  theme: 'dark',
  fontSize: 15,
  lineHeight: 1.65,
  contentWidth: 920,
  shortcuts: DEFAULT_SHORTCUTS.map((binding) => ({ ...binding }))
})

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export function normalizeSettings(value: Partial<AppSettings> | undefined, homeDir: string): AppSettings {
  const defaults = createDefaultSettings(homeDir)
  return {
    grokExecutable: typeof value?.grokExecutable === 'string' && value.grokExecutable.trim() ? value.grokExecutable : defaults.grokExecutable,
    theme: value?.theme === 'light' ? 'light' : 'dark',
    fontSize: clamp(value?.fontSize, 12, 22, defaults.fontSize),
    lineHeight: clamp(value?.lineHeight, 1.2, 2.1, defaults.lineHeight),
    contentWidth: clamp(value?.contentWidth, 640, 1400, defaults.contentWidth),
    shortcuts: Array.isArray(value?.shortcuts) && value.shortcuts.length ? value.shortcuts : defaults.shortcuts
  }
}
