/**
 * Official subagent roster (read-only).
 *
 * `_x.ai/subagent/list_running` is an x.ai extension method that returns only
 * the *currently active* children of a session — the CLI's own words are
 * "list_running returns only active children". Until now the GUI inferred which
 * subagents were alive from `spawn_subagent` tool calls plus the raw-tee
 * `subagent_spawned` / `subagent_finished` notifications. That inference is
 * still the fallback; this roster is the authoritative overlay when available.
 *
 * Wire shape captured live from grok 1.0.3 by `work/subagent_list_probe.mjs`:
 *
 *   request  `_x.ai/subagent/list_running` { sessionId }
 *   response { result: { subagents: RunningSubagent[] } }   (ext-method envelope)
 *
 * Deliberately read-only: `_x.ai/subagent/cancel` is never called.
 */
import type { BackgroundActivityEntry } from './background-activity'

export const SUBAGENT_LIST_RUNNING_METHOD = '_x.ai/subagent/list_running'

/** Poll cadence while a turn is live. Children finish in seconds, so this is
 *  fast enough to see them without hammering the CLI on an idle window. */
export const SUBAGENT_POLL_MS = 2_000

export type RunningSubagent = {
  subagentId: string
  /** Same value as subagentId on 1.0.3, but it is the id the tee events carry. */
  childSessionId: string
  parentSessionId: string
  /** e.g. "general-purpose". */
  subagentType: string
  /** Human task line the parent gave it. */
  description: string
  startedAtEpochMs?: number
  durationMs?: number
  turnCount?: number
  toolCallCount?: number
  tokensUsed?: number
  contextUsagePct?: number
  toolsUsed: string[]
  errorCount?: number
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

function parseEntry(value: unknown): RunningSubagent | null {
  const row = asRecord(value)
  if (!row) return null
  const subagentId = str(row.subagentId) || str(row.subagent_id)
  const childSessionId = str(row.childSessionId) || str(row.child_session_id) || subagentId
  const id = subagentId || childSessionId
  if (!id) return null
  return {
    subagentId: id,
    childSessionId: childSessionId || id,
    parentSessionId: str(row.parentSessionId) || str(row.parent_session_id),
    subagentType: str(row.subagentType) || str(row.subagent_type),
    description: str(row.description),
    startedAtEpochMs: num(row.startedAtEpochMs) ?? num(row.started_at_epoch_ms),
    durationMs: num(row.durationMs) ?? num(row.duration_ms),
    turnCount: num(row.turnCount) ?? num(row.turn_count),
    toolCallCount: num(row.toolCallCount) ?? num(row.tool_call_count),
    tokensUsed: num(row.tokensUsed) ?? num(row.tokens_used),
    contextUsagePct: num(row.contextUsagePct) ?? num(row.context_usage_pct),
    toolsUsed: Array.isArray(row.toolsUsed)
      ? row.toolsUsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : [],
    errorCount: num(row.errorCount) ?? num(row.error_count)
  }
}

/**
 * `null` means "no usable answer" — the method is missing, errored, or returned
 * a shape we do not recognise, so the caller must keep its own inference. An
 * empty array is a real answer: nothing is running right now.
 */
export function parseRunningSubagents(raw: unknown): RunningSubagent[] | null {
  const outer = asRecord(raw)
  if (!outer) return null
  // Ext methods wrap their payload in `result`; accept both forms.
  const body = asRecord(outer.result) ?? outer
  const list = body.subagents
  if (!Array.isArray(list)) return null
  return list.map(parseEntry).filter((item): item is RunningSubagent => item !== null)
}

/** "general-purpose · 2 輪 · 3 次工具 · 1.2k tokens" */
export function formatRunningSubagentDetail(subagent: RunningSubagent): string {
  const parts: string[] = []
  if (subagent.subagentType) parts.push(subagent.subagentType)
  if (subagent.turnCount !== undefined) parts.push(`${subagent.turnCount} 輪`)
  if (subagent.toolCallCount !== undefined) parts.push(`${subagent.toolCallCount} 次工具`)
  if (subagent.tokensUsed !== undefined) {
    parts.push(subagent.tokensUsed >= 1000 ? `${(subagent.tokensUsed / 1000).toFixed(1)}k tokens` : `${subagent.tokensUsed} tokens`)
  }
  if (subagent.errorCount) parts.push(`${subagent.errorCount} 次錯誤`)
  return parts.join(' · ')
}

const RUNNING_LABEL = '執行中（官方回報）'

function toEntry(subagent: RunningSubagent, sessionId: string): BackgroundActivityEntry {
  const title = subagent.description || subagent.subagentType || '子代理'
  return {
    id: `subagent-roster:${subagent.subagentId}`,
    sessionId,
    source: 'subagent',
    name: 'spawn_subagent',
    kindLabel: '子代理',
    title,
    status: 'running',
    statusLabel: RUNNING_LABEL,
    detail: formatRunningSubagentDetail(subagent),
    loopLike: false,
    event: {
      id: `subagent-roster:${subagent.subagentId}`,
      sessionId,
      kind: 'subagent',
      subagentId: subagent.subagentId,
      description: title,
      status: 'running'
    }
  }
}

/**
 * Overlay the official roster onto derived activity, keeping one card per
 * subagent. Matching is by child/subagent id, the same id the tee events carry.
 *
 * Confidence only ever goes up. A card missing from the roster is NOT downgraded
 * to finished: the roster is a snapshot taken between polls, and completion is
 * already reported reliably by `subagent_finished`. Guessing "gone from the list
 * therefore done" would let one unlucky poll mark a live child as finished.
 */
export function mergeRunningSubagents(
  entries: readonly BackgroundActivityEntry[],
  running: readonly RunningSubagent[] | null,
  sessionId: string
): BackgroundActivityEntry[] {
  if (!running) return [...entries]
  const byId = new Map(running.map((item) => [item.subagentId, item]))
  const alsoById = new Map(running.map((item) => [item.childSessionId, item]))
  const claimed = new Set<string>()

  const merged = entries.map((entry) => {
    if (entry.source !== 'subagent' && entry.name !== 'spawn_subagent') return entry
    const eventId = entry.event.kind === 'subagent' ? entry.event.subagentId : ''
    const match = (eventId && (byId.get(eventId) ?? alsoById.get(eventId)))
      || [...byId.values()].find((item) => item.description && item.description === entry.title)
    if (!match) return entry
    claimed.add(match.subagentId)
    return {
      ...entry,
      status: 'running' as const,
      statusLabel: RUNNING_LABEL,
      detail: formatRunningSubagentDetail(match) || entry.detail
    }
  })

  const extra = running.filter((item) => !claimed.has(item.subagentId)).map((item) => toEntry(item, sessionId))
  return [...merged, ...extra]
}
