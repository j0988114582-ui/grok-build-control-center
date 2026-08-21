import { sessionActivityMs } from '../../../shared/session-hygiene'
import type { SessionSummary, SidebarSortMode } from '../../../shared/types'

export type SessionProjectGroup = { cwd: string; name: string; sessions: SessionSummary[] }

export const groupSessionsByProject = (sessions: SessionSummary[]): SessionProjectGroup[] => {
  const groups = new Map<string, SessionProjectGroup>()
  for (const session of sessions) {
    const cwd = session.cwd.replace(/[\\/]+$/, '')
    const existing = groups.get(cwd)
    if (existing) existing.sessions.push(session)
    else groups.set(cwd, { cwd, name: cwd.split(/[\\/]/).pop() || cwd, sessions: [session] })
  }
  return [...groups.values()]
}

export const sessionDisplayTitle = (session: SessionSummary, overrides: Record<string, string>): string =>
  overrides[session.id]?.trim() || session.title

/** Global top pin group: order follows `pinnedIds`; missing ids are skipped. */
export function partitionPinnedSessions(
  sessions: SessionSummary[],
  pinnedIds: readonly string[]
): { pinned: SessionSummary[]; unpinned: SessionSummary[] } {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const pinned: SessionSummary[] = []
  const pinnedSet = new Set<string>()
  for (const id of pinnedIds) {
    const session = byId.get(id)
    if (!session || pinnedSet.has(id)) continue
    pinned.push(session)
    pinnedSet.add(id)
  }
  const unpinned = sessions.filter((session) => !pinnedSet.has(session.id))
  return { pinned, unpinned }
}

const toIdSet = (value: ReadonlySet<string> | readonly string[] | undefined): Set<string> => {
  if (!value) return new Set()
  return value instanceof Set ? value : new Set(value)
}

export type SortSessionsOptions = {
  mode: SidebarSortMode
  lastOpenedAt?: Record<string, number>
  runningIds?: ReadonlySet<string> | readonly string[]
  titleOverrides?: Record<string, string>
}

/** Stable-enough list order for the sidebar. Pinned grouping is applied separately. */
export function sortSessions(
  sessions: readonly SessionSummary[],
  options: SortSessionsOptions
): SessionSummary[] {
  const lastOpened = options.lastOpenedAt ?? {}
  const running = toIdSet(options.runningIds)
  const titles = options.titleOverrides ?? {}
  const titleOf = (session: SessionSummary): string => sessionDisplayTitle(session, titles)
  const byUpdated = (left: SessionSummary, right: SessionSummary): number =>
    sessionActivityMs(right) - sessionActivityMs(left)
  const list = [...sessions]
  list.sort((left, right) => {
    if (options.mode === 'running') {
      const leftRun = running.has(left.id) ? 1 : 0
      const rightRun = running.has(right.id) ? 1 : 0
      if (rightRun !== leftRun) return rightRun - leftRun
      return byUpdated(left, right)
    }
    if (options.mode === 'opened') {
      const opened = (lastOpened[right.id] ?? 0) - (lastOpened[left.id] ?? 0)
      return opened || byUpdated(left, right)
    }
    if (options.mode === 'name') {
      return titleOf(left).localeCompare(titleOf(right), 'zh-Hant') || byUpdated(left, right)
    }
    return byUpdated(left, right)
  })
  return list
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function formatAbsoluteSessionTime(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

/** Relative "3 分鐘前"; falls back to a short date after 30 days. */
export function formatRelativeSessionTime(value?: string, nowMs = Date.now()): string {
  if (!value) return ''
  const then = Date.parse(value)
  if (!Number.isFinite(then)) return ''
  const delta = Math.max(0, nowMs - then)
  if (delta < MINUTE_MS) return '剛剛'
  if (delta < HOUR_MS) return `${Math.floor(delta / MINUTE_MS)} 分鐘前`
  if (delta < DAY_MS) return `${Math.floor(delta / HOUR_MS)} 小時前`
  if (delta < 30 * DAY_MS) return `${Math.floor(delta / DAY_MS)} 天前`
  return formatAbsoluteSessionTime(value)
}
