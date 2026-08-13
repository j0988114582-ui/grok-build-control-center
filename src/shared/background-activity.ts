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
 *  - `spawn_subagent` completing is only the spawn handshake — the child is still running.
 *    Same spirit as a completed `scheduler_create`. Failed/cancelled spawn stays failed.
 *    Official child lifecycle arrives as `_x.ai/session_notification` `subagent_spawned` /
 *    `subagent_finished` (child_session_id). `get_command_or_subagent_output` is not its
 *    own card; a matching `TaskOutput` updates that child's status + output.
 *
 * Unverified: `monitor` and `workflow` were never exercised by the /loop capture. They
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

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function collectNamedIds(record: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!record) return []
  const ids: string[] = []
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) ids.push(value.trim())
  }
  const taskIds = record.task_ids
  if (Array.isArray(taskIds)) {
    for (const item of taskIds) {
      if (typeof item === 'string' && item.trim()) ids.push(item.trim())
    }
  }
  return ids
}

const CHILD_ID_KEYS = ['child_session_id', 'subagent_id', 'task_id']

/** Child ids carried on a spawn_subagent tool_call (input or structured result). */
export function extractSpawnChildIds(event: Extract<UiSessionEvent, { kind: 'tool' }>): string[] {
  const output = asRecord(event.rawOutput)
  const input = asRecord(event.rawInput)
  const result = asRecord(output?.Result) ?? asRecord(output?.result)
  const ids = [
    ...collectNamedIds(output, CHILD_ID_KEYS),
    ...collectNamedIds(result, CHILD_ID_KEYS),
    ...collectNamedIds(input, CHILD_ID_KEYS)
  ]
  for (const rec of [output, result, input]) {
    if (!rec) continue
    if ((rec.type === 'SpawnSubagent' || rec.variant === 'SpawnSubagent') && typeof rec.id === 'string' && rec.id.trim()) {
      ids.push(rec.id.trim())
    }
  }
  return uniqueIds(ids)
}

type TaskOutputUpdate = { ids: string[]; status?: string; output?: string }

/** Live shape: `{ type:"TaskOutput", Result:{ task_id, status } }` + input `{ variant:"TaskOutput", task_ids }`. */
export function readTaskOutputUpdate(event: Extract<UiSessionEvent, { kind: 'tool' }>): TaskOutputUpdate | null {
  const output = asRecord(event.rawOutput)
  const input = asRecord(event.rawInput)
  const isTaskOutput = output?.type === 'TaskOutput' || input?.variant === 'TaskOutput' || event.toolName === 'get_command_or_subagent_output'
  if (!isTaskOutput) return null
  const result = asRecord(output?.Result) ?? asRecord(output?.result)
  const ids = uniqueIds([
    ...collectNamedIds(result, CHILD_ID_KEYS),
    ...collectNamedIds(output, CHILD_ID_KEYS),
    ...collectNamedIds(input, CHILD_ID_KEYS)
  ])
  const status = typeof result?.status === 'string'
    ? result.status
    : typeof output?.status === 'string' ? output.status : undefined
  const narrative = event.output
    || (typeof result?.output === 'string' ? result.output : undefined)
    || (typeof result?.text === 'string' ? result.text : undefined)
  return { ids, ...(status ? { status } : {}), ...(narrative ? { output: narrative } : {}) }
}

function isGenericSubagentTitle(title: string): boolean {
  const t = title.trim()
  return !t || t === 'Tool call' || t === 'spawn_subagent' || t === 'Subagent' || t === KIND_LABELS.subagent || t === KIND_LABELS.spawn_subagent
}

function pickSubagentTitle(toolTitle: string | undefined, description: string | undefined): string {
  if (toolTitle && !isGenericSubagentTitle(toolTitle)) return toolTitle
  if (description && !isGenericSubagentTitle(description)) return description
  return toolTitle?.trim() || description?.trim() || KIND_LABELS.subagent
}

/** Spawn handshake completing is not the child finishing — pending/running/completed stay 執行中. */
function spawnToolActivityStatus(raw: string): { status: ActivityStatus; statusLabel: string } {
  const bucket = normalizeActivityStatus(raw)
  if (bucket === 'failed') return { status: 'failed', statusLabel: activityStatusLabel(raw) }
  return { status: 'running', statusLabel: '執行中' }
}

function makeSpawnToolEntry(event: Extract<UiSessionEvent, { kind: 'tool' }>): BackgroundActivityEntry {
  const { status, statusLabel } = spawnToolActivityStatus(event.status)
  return {
    id: event.id,
    sessionId: event.sessionId,
    source: 'tool',
    name: 'spawn_subagent',
    kindLabel: KIND_LABELS.spawn_subagent,
    title: event.title && event.title !== 'Tool call' ? event.title : KIND_LABELS.spawn_subagent,
    status,
    statusLabel,
    output: event.output,
    loopLike: /loop/i.test(event.title),
    event
  }
}

function pushToolEntry(out: BackgroundActivityEntry[], event: Extract<UiSessionEvent, { kind: 'tool' }>): void {
  const name = event.toolName
  if (!name || !isKnownBackgroundToolName(name)) return
  if (CONTROL_TOOL_NAMES.has(name)) return
  if (name === 'spawn_subagent') {
    out.push(makeSpawnToolEntry(event))
    return
  }

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

type TrackedKind = 'scheduler' | 'spawn' | 'subagent' | 'task' | 'other-tool'

type TrackedEntry = {
  entry: BackgroundActivityEntry
  ids: Set<string>
  kind: TrackedKind
}

function findChildMatch(tracked: TrackedEntry[], id: string): TrackedEntry | undefined {
  return tracked.find((item) => (item.kind === 'spawn' || item.kind === 'subagent') && item.ids.has(id))
}

function normalizeCardTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Live CLI 1.0.3 spawn tools often omit child_session_id; fall back to the human title. */
function findTitleMatch(tracked: TrackedEntry[], title: string | undefined): TrackedEntry | undefined {
  if (!title || isGenericSubagentTitle(title)) return undefined
  const key = normalizeCardTitle(title)
  if (!key) return undefined
  return tracked.find((item) =>
    (item.kind === 'spawn' || item.kind === 'subagent')
    && !isGenericSubagentTitle(item.entry.title)
    && normalizeCardTitle(item.entry.title) === key
  )
}

function attachOutput(event: UiSessionEvent, output?: string, status?: string): UiSessionEvent {
  if (event.kind === 'tool') {
    return { ...event, ...(output ? { output } : {}), ...(status ? { status } : {}) }
  }
  if (event.kind === 'subagent') {
    return { ...event, ...(output ? { output } : {}), ...(status ? { status } : {}) }
  }
  return event
}

function applyTaskOutput(tracked: TrackedEntry[], event: Extract<UiSessionEvent, { kind: 'tool' }>): void {
  const update = readTaskOutputUpdate(event)
  if (!update || update.ids.length === 0) return
  for (const id of update.ids) {
    const match = findChildMatch(tracked, id)
    if (!match) continue
    if (update.status) {
      match.entry = {
        ...match.entry,
        status: normalizeActivityStatus(update.status),
        statusLabel: activityStatusLabel(update.status)
      }
    }
    if (update.output) match.entry = { ...match.entry, output: update.output }
    match.entry = {
      ...match.entry,
      event: attachOutput(match.entry.event, match.entry.output, update.status)
    }
    match.ids.add(id)
  }
}

function mergeSpawnInto(match: TrackedEntry, event: Extract<UiSessionEvent, { kind: 'tool' }>, ids: string[]): void {
  const next = makeSpawnToolEntry(event)
  match.entry = {
    ...match.entry,
    title: pickSubagentTitle(next.title, match.entry.title),
    output: next.output ?? match.entry.output,
    loopLike: match.entry.loopLike || next.loopLike
  }
  if (match.kind !== 'subagent') {
    match.entry = {
      ...match.entry,
      status: next.status,
      statusLabel: next.statusLabel,
      source: 'tool',
      name: 'spawn_subagent',
      kindLabel: KIND_LABELS.spawn_subagent,
      event: next.event
    }
    match.kind = 'spawn'
  } else {
    match.entry = {
      ...match.entry,
      event: match.entry.event.kind === 'subagent'
        ? { ...match.entry.event, description: match.entry.title, output: match.entry.output }
        : match.entry.event
    }
  }
  for (const id of ids) match.ids.add(id)
}

function mergeSubagentInto(match: TrackedEntry, event: Extract<UiSessionEvent, { kind: 'subagent' }>): void {
  const title = pickSubagentTitle(match.entry.title, event.description)
  const output = event.output ?? match.entry.output
  match.entry = {
    ...match.entry,
    source: 'subagent',
    name: 'spawn_subagent',
    kindLabel: KIND_LABELS.subagent,
    title,
    status: normalizeActivityStatus(event.status),
    statusLabel: activityStatusLabel(event.status),
    output,
    loopLike: match.entry.loopLike || /loop/i.test(event.description),
    event: { ...event, description: title, output, status: event.status }
  }
  match.kind = 'subagent'
  if (event.subagentId) match.ids.add(event.subagentId)
}

/**
 * Pulls background-tool tool_calls plus every subagent/task event out of a session's event
 * stream, in the same order they arrived (caller decides display order — the panel shows
 * most-recent-first). Control/query tool calls (scheduler_delete, scheduler_list,
 * get_command_or_subagent_output, kill_command_or_subagent) are intentionally excluded.
 * Matching spawn_subagent + subagent lifecycle collapse to one card (subagent wins status;
 * the tool keeps a better human title). TaskOutput updates that card instead of adding one.
 */
export function deriveBackgroundActivity(events: UiSessionEvent[]): BackgroundActivityEntry[] {
  const tracked: TrackedEntry[] = []
  for (const event of events) {
    if (event.kind === 'tool') {
      if (event.toolName === 'get_command_or_subagent_output') {
        applyTaskOutput(tracked, event)
        continue
      }
      if (event.toolName === 'spawn_subagent') {
        const ids = extractSpawnChildIds(event)
        const match = ids.map((id) => findChildMatch(tracked, id)).find(Boolean)
          ?? findTitleMatch(tracked, event.title)
        if (match) mergeSpawnInto(match, event, ids)
        else {
          const bucket: BackgroundActivityEntry[] = []
          pushToolEntry(bucket, event)
          if (bucket[0]) tracked.push({ entry: bucket[0], ids: new Set(ids), kind: 'spawn' })
        }
        continue
      }
      const bucket: BackgroundActivityEntry[] = []
      pushToolEntry(bucket, event)
      if (bucket[0]) {
        tracked.push({
          entry: bucket[0],
          ids: new Set(),
          kind: event.toolName === 'scheduler_create' ? 'scheduler' : 'other-tool'
        })
      }
    } else if (event.kind === 'subagent') {
      const match = (event.subagentId ? findChildMatch(tracked, event.subagentId) : undefined)
        ?? findTitleMatch(tracked, event.description)
      if (match) mergeSubagentInto(match, event)
      else {
        const bucket: BackgroundActivityEntry[] = []
        pushSubagentEntry(bucket, event)
        if (bucket[0]) {
          tracked.push({
            entry: bucket[0],
            ids: new Set(event.subagentId ? [event.subagentId] : []),
            kind: 'subagent'
          })
        }
      }
    } else if (event.kind === 'task') {
      const bucket: BackgroundActivityEntry[] = []
      pushTaskEntry(bucket, event)
      if (bucket[0]) tracked.push({ entry: bucket[0], ids: new Set(event.taskId ? [event.taskId] : []), kind: 'task' })
    }
  }
  return tracked.map((item) => item.entry)
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
 * R3: builds `/workflow <name> [args]` for the panel launch form. Required `name` blank → `''`.
 * Optional args are appended only when non-blank after trim. Management subcommands
 * (`pause`/`resume`/`stop`) are sent as literal strings by the panel, not through this helper.
 */
export function formatWorkflowCommand(name: string, args?: string): string {
  const trimmedName = name.trim()
  if (!trimmedName) return ''
  const trimmedArgs = (args ?? '').trim()
  return trimmedArgs ? `/workflow ${trimmedName} ${trimmedArgs}` : `/workflow ${trimmedName}`
}

/**
 * R3: builds `/goal <objective> [--budget <tokens>]`. Required `objective` blank → `''`.
 * Appends ` --budget N` only when `budget` trims to a positive integer (not `''`/`0`/`-1`/`abc`).
 * Management subcommands (`status`/`pause`/`resume`/`clear`) are sent as literal strings.
 */
export function formatGoalCommand(objective: string, budget?: string): string {
  const trimmedObjective = objective.trim()
  if (!trimmedObjective) return ''
  const trimmedBudget = (budget ?? '').trim()
  if (trimmedBudget) {
    const n = Number(trimmedBudget)
    if (Number.isInteger(n) && n > 0) {
      return `/goal ${trimmedObjective} --budget ${n}`
    }
  }
  return `/goal ${trimmedObjective}`
}

/**
 * R3: builds `/deep-research <query>`. Required `query` blank → `''`.
 */
export function formatDeepResearchCommand(query: string): string {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return ''
  return `/deep-research ${trimmedQuery}`
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
