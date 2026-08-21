import type { AppSettings } from './types'
import { normalizeRecentProjectCwds } from './settings'

const omitKeys = <T extends Record<string, unknown>>(source: T, ids: ReadonlySet<string>): T =>
  Object.fromEntries(Object.entries(source).filter(([key]) => !ids.has(key))) as T

/** Drop local titles/drafts/pins for deleted session ids. */
export function removeSessionLocalData(settings: AppSettings, sessionIds: readonly string[]): AppSettings {
  if (!sessionIds.length) return settings
  const remove = new Set(sessionIds)
  return {
    ...settings,
    sessionTitles: omitKeys(settings.sessionTitles, remove),
    drafts: omitKeys(settings.drafts, remove),
    pinnedSessions: settings.pinnedSessions.filter((id) => !remove.has(id)),
    sessionLastOpenedAt: omitKeys(settings.sessionLastOpenedAt, remove),
    preview: {
      ...settings.preview,
      recentBySession: omitKeys(settings.preview.recentBySession, remove)
    }
  }
}

/** Remove local metadata for sessions that no longer exist on disk. */
export function pruneOrphanSessionLocalData(settings: AppSettings, liveSessionIds: Iterable<string>): AppSettings {
  const live = new Set(liveSessionIds)
  const staleTitles = Object.keys(settings.sessionTitles).filter((id) => !live.has(id))
  const staleDrafts = Object.keys(settings.drafts).filter((id) => !live.has(id))
  const stalePins = settings.pinnedSessions.filter((id) => !live.has(id))
  const staleOpened = Object.keys(settings.sessionLastOpenedAt).filter((id) => !live.has(id))
  const staleRecent = Object.keys(settings.preview.recentBySession).filter((id) => !live.has(id))
  if (!staleTitles.length && !staleDrafts.length && !stalePins.length && !staleOpened.length && !staleRecent.length) return settings
  return removeSessionLocalData(settings, [...new Set([...staleTitles, ...staleDrafts, ...stalePins, ...staleOpened, ...staleRecent])])
}

const normalizeCwdKey = (cwd: string): string => cwd.replace(/[\\/]+$/, '').trim()

/** Most-recent-first, unique, max 3. Used for one-click project reopen. */
export function rememberRecentProjectCwd(list: readonly string[], cwd: string): string[] {
  const normalized = normalizeCwdKey(cwd).slice(0, 1000)
  if (!normalized) return normalizeRecentProjectCwds(list)
  return normalizeRecentProjectCwds([normalized, ...list])
}

export function rememberSessionOpenedAt(
  map: Record<string, number>,
  sessionId: string,
  atMs = Date.now()
): Record<string, number> {
  if (!sessionId || !Number.isFinite(atMs) || atMs <= 0) return map
  return { ...map, [sessionId]: atMs }
}

export function togglePinnedSession(pinnedSessions: readonly string[], sessionId: string): string[] {
  return pinnedSessions.includes(sessionId)
    ? pinnedSessions.filter((id) => id !== sessionId)
    : [sessionId, ...pinnedSessions.filter((id) => id !== sessionId)]
}
