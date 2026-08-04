import type { UiSessionEvent } from './types'

/**
 * R2 — Background Tasks / Loop panel: aggregates the CLI's background activity out of the
 * same `UiSessionEvent[]` stream the transcript already renders. No new ACP method.
 *
 * Ground truth (2026-08-03 real-CLI capture of `/loop 15s echo …`, see
 * `docs/plans/2026-08-03-acp-feature-plan.md` review notes):
 *  - `/loop` surfaces *only* as `tool_call`/`tool_call_update` (kind 'tool') for a
 *    `scheduler_create` call — never as `subagent_spawned`/`task_backgrounded`. Those two
 *    kinds are still aggregated below (they are real, documented ACP event kinds used by
 *    other background mechanisms), just not exercised by /loop itself.
 *  - The reliable tool identity is `toolName` (from `update._meta['x.ai/tool'].name`,
 *    plumbed through in event-adapter.ts). `title` is not reliable: it starts as the raw
 *    name ("scheduler_create") and later mutates to human text ("Create scheduled task
 *    (every 60s)") on the *same* toolCallId. Matching on title text produced both false
 *    positives (e.g. a "Read .github/workflows/…" tool call matching "workflow") and false
 *    negatives (the humanized title no longer contains "scheduler_create") — fixed here by
 *    matching on the exact `toolName` only.
 *  - A *completed* `scheduler_create` whose `rawOutput` is `{ type: "SchedulerCreate", id,
 *    humanSchedule }` means the recurring loop is now RUNNING, not finished — the "tool
 *    call" completing is just the creation step. It stays 'running' until the user (or the
 *    agent) deletes it.
 *  - Stopping a recurring loop has no client-invocable ACP method. `session/cancel` only
 *    cancels the current turn and does NOT stop a detached loop (verified live). The only
 *    real stop path is asking the agent to call its own `scheduler_delete` tool with the
 *    loop's id — see `formatSchedulerDeletePrompt`.
 *  - `scheduler_delete` / `scheduler_list` / `get_command_or_subagent_output` /
 *    `kill_command_or_subagent` are control/query calls that act *on* an entity; they are
 *    excluded from the derived list so they don't show up as their own (misleading) cards.
 *
 * Unverified: `monitor`, `spawn_subagent` (as a raw tool_call — distinct from the dedicated
 * `subagent_spawned` update kind), and `workflow` were never exercised by this capture. They
 * are kept in the known-name registry (per the original ACP capability probe's tool-name
 * evidence) and treated as entity-creating by analogy with scheduler_create, but neither
 * their rawOutput shape nor a stop mechanism has been confirmed — real-CLI smoke needed.
 */

export const BACKGROUND_TOOL_NAMES = [
  'scheduler_create',
  'scheduler_delete',
  'scheduler_list',
  'monitor',
  'spawn_subagent',
  'workflow',
  'kill_command_or_subagent',
  'get_command_or_subagent_output'
] as const

export type BackgroundToolName = typeof BACKGROUND_TOOL_NAMES[number]

const BACKGROUND_TOOL_NAME_SET = new Set<string>(BACKGROUND_TOOL_NAMES)
const isKnownBackgroundToolName = (name: string): name is BackgroundToolName => BACKGROUND_TOOL_NAME_SET.has(name)

/** Control/query calls act on an existing entity — they are not one; excluded from the
 *  derived list so they don't pollute it (Codex R2 review, fix #3). */
const CONTROL_TOOL_NAMES = new Set<BackgroundToolName>([
  'scheduler_delete',
  'scheduler_list',
  'kill_command_or_subagent',
  'get_command_or_subagent_output'
])

const KIND_LABELS: Record<string, string> = {
  scheduler_create: '建立排程',
  scheduler_delete: '刪除排程',
  scheduler_list: '排程清單',
  monitor: '監視器',
  spawn_subagent: '衍生子代理',
  workflow: 'Workflow',
  kill_command_or_subagent: '終止指令／子代理',
  get_command_or_subagent_output: '讀取輸出',
  subagent: '子代理',
  task: '背景任務'
}

export type ActivityStatus = 'running' | 'done' | 'failed' | 'unknown'

const RUNNING_STATUSES = new Set(['pending', 'in_progress', 'in-progress', 'running', 'queued', 'started'])
const DONE_STATUSES = new Set(['completed', 'done', 'success', 'succeeded', 'finished'])
const FAILED_STATUSES = new Set(['failed', 'error', 'errored', 'cancelled', 'canceled', 'aborted', 'timeout', 'timed_out'])

/**
 * Buckets any raw ACP/CLI status word into the 4-state vocabulary the panel shows. A word
 * outside all three known sets lands in 'unknown' (neutral icon/color) rather than being
 * guessed as a success — the raw word is still shown verbatim via `activityStatusLabel`.
 */
export function normalizeActivityStatus(raw: string): ActivityStatus {
  const key = raw.trim().toLowerCase()
  if (RUNNING_STATUSES.has(key)) return 'running'
  if (FAILED_STATUSES.has(key)) return 'failed'
  if (DONE_STATUSES.has(key)) return 'done'
  return 'unknown'
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中', in_progress: '執行中', 'in-progress': '執行中', running: '執行中', queued: '排隊中', started: '執行中',
  completed: '已完成', done: '已完成', success: '已完成', succeeded: '已完成', finished: '已完成',
  failed: '失敗', error: '失敗', errored: '失敗',
  cancelled: '已取消', canceled: '已取消', aborted: '已取消',
  timeout: '逾時', timed_out: '逾時'
}

/** Chinese label for a raw status word; falls back to the raw word so nothing is hidden. */
export function activityStatusLabel(raw: string): string {
  return STATUS_LABELS[raw.trim().toLowerCase()] ?? raw
}

/** The only ACP-confirmed stop mechanism today: ask the agent to delete a scheduler entry. */
export type StopAction = { kind: 'scheduler_delete'; schedulerId: string }

export type BackgroundActivitySource = 'tool' | 'subagent' | 'task'

export type BackgroundActivityEntry = {
  id: string
  sessionId: string
  source: BackgroundActivitySource
  /** Exact tool name for tool-sourced entries; 'spawn_subagent' / 'task' otherwise. */
  name: string
  kindLabel: string
  title: string
  status: ActivityStatus
  statusLabel: string
  /** Extra at-a-glance line not covered by title/status (e.g. scheduler id + schedule). */
  detail?: string
  output?: string
  /** Title/description mentions "loop", or this is a confirmed recurring scheduler entry —
   *  for anything other than scheduler_create this is a cosmetic hint only, not a reliable
   *  correlation to a specific /loop invocation. */
  loopLike: boolean
  /** Present only when there is a verified, client-invocable way to stop this entry. */
  stopAction?: StopAction
  event: UiSessionEvent
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

type SchedulerCreateResult = { id: string; humanSchedule?: string }

/** Reads a completed scheduler_create's structured result. Returns undefined for any other
 *  shape (still pending, failed, or a rawOutput shape we don't recognize) — callers must not
 *  assume "no result yet" means "not running"; a scheduler_create with no result yet is still
 *  bucketed 'running' by the normal status path, just without the id needed to stop it. */
function readSchedulerCreateResult(rawOutput: unknown): SchedulerCreateResult | undefined {
  const raw = asRecord(rawOutput)
  if (!raw || raw.type !== 'SchedulerCreate') return undefined
  const id = raw.id
  if (typeof id !== 'string' || !id.trim()) return undefined
  const humanSchedule = typeof raw.humanSchedule === 'string' && raw.humanSchedule.trim() ? raw.humanSchedule.trim() : undefined
  return { id: id.trim(), humanSchedule }
}

function pushToolEntry(out: BackgroundActivityEntry[], event: Extract<UiSessionEvent, { kind: 'tool' }>): void {
  const name = event.toolName
  if (!name || !isKnownBackgroundToolName(name)) return
  if (CONTROL_TOOL_NAMES.has(name)) return

  const schedulerResult = name === 'scheduler_create' ? readSchedulerCreateResult(event.rawOutput) : undefined
  const isRunningLoop = schedulerResult !== undefined
  const status: ActivityStatus = isRunningLoop ? 'running' : normalizeActivityStatus(event.status)
  const statusLabel = isRunningLoop
    ? `執行中（${schedulerResult.humanSchedule ?? '週期性'}）`
    : activityStatusLabel(event.status)
  const kindLabel = KIND_LABELS[name] ?? name

  out.push({
    id: event.id,
    sessionId: event.sessionId,
    source: 'tool',
    name,
    kindLabel,
    title: event.title && event.title !== 'Tool call' ? event.title : kindLabel,
    status,
    statusLabel,
    ...(schedulerResult ? { detail: `排程 ID：${schedulerResult.id}` } : {}),
    output: event.output,
    // LOOP badge means "confirmed recurring scheduler loop" — do not infer it from title text
    // (Grok re-review m2: a `monitor`/`workflow` tool titled e.g. "Read loopback config" would
    // otherwise get a misleading LOOP badge).
    loopLike: isRunningLoop,
    ...(schedulerResult ? { stopAction: { kind: 'scheduler_delete', schedulerId: schedulerResult.id } } : {}),
    event
  })
}

function pushSubagentEntry(out: BackgroundActivityEntry[], event: Extract<UiSessionEvent, { kind: 'subagent' }>): void {
  const status = normalizeActivityStatus(event.status)
  out.push({
    id: event.id,
    sessionId: event.sessionId,
    source: 'subagent',
    name: 'spawn_subagent',
    kindLabel: KIND_LABELS.subagent,
    title: event.description || KIND_LABELS.subagent,
    status,
    statusLabel: activityStatusLabel(event.status),
    output: event.output,
    loopLike: /loop/i.test(event.description),
    // No confirmed per-id stop mechanism for subagents yet (kill_command_or_subagent's
    // input shape hasn't been captured) — no stopAction rather than a guessed one.
    event
  })
}

function pushTaskEntry(out: BackgroundActivityEntry[], event: Extract<UiSessionEvent, { kind: 'task' }>): void {
  const status = normalizeActivityStatus(event.status)
  out.push({
    id: event.id,
    sessionId: event.sessionId,
    source: 'task',
    name: 'task',
    kindLabel: KIND_LABELS.task,
    title: event.description || KIND_LABELS.task,
    status,
    statusLabel: activityStatusLabel(event.status),
    output: undefined,
    loopLike: /loop/i.test(event.description),
    event
  })
}

/**
 * Pulls background-tool tool_calls plus every subagent/task event out of a session's event
 * stream, in the same order they arrived (caller decides display order — the panel shows
 * most-recent-first). Control/query tool calls (scheduler_delete, scheduler_list,
 * get_command_or_subagent_output, kill_command_or_subagent) are intentionally excluded.
 */
export function deriveBackgroundActivity(events: UiSessionEvent[]): BackgroundActivityEntry[] {
  const out: BackgroundActivityEntry[] = []
  for (const event of events) {
    if (event.kind === 'tool') pushToolEntry(out, event)
    else if (event.kind === 'subagent') pushSubagentEntry(out, event)
    else if (event.kind === 'task') pushTaskEntry(out, event)
  }
  return out
}

/**
 * Builds the literal `/loop [interval] <prompt>` text sent through the existing
 * prompt-send path (grokApi.sendPrompt) — there is no dedicated ACP method for creating
 * a loop. Matches the CLI's advertised `availableCommands` inputHint for `loop`:
 * "[interval] <prompt>" (interval is optional; a too-short interval gets clamped by the
 * CLI itself — the real capture asked for 15s and got "every 1 minute" back).
 */
export function formatLoopCommand(interval: string, prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) return ''
  const trimmedInterval = interval.trim()
  return trimmedInterval ? `/loop ${trimmedInterval} ${trimmedPrompt}` : `/loop ${trimmedPrompt}`
}

/**
 * The only ACP-confirmed way to stop a detached recurring loop: ask the agent to call its
 * own `scheduler_delete` tool with the loop's id. There is no client-invocable cancel-by-id
 * method — `session/cancel` does not stop a detached loop (verified live against the real
 * CLI). This is plain natural-language instruction text, not a slash command.
 */
export function formatSchedulerDeletePrompt(schedulerId: string): string {
  return `請使用 scheduler_delete 工具刪除排程 ID「${schedulerId}」，停止這個定時任務。`
}

/** Compact token-count formatting for the panel's usage cells (e.g. 186783 -> "186.8k"). */
export function formatTokenCount(value?: number): string {
  if (value === undefined) return '—'
  if (value >= 100_000) return `${(value / 1000).toFixed(0)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}
