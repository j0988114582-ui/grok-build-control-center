import type { PlanEntry, UiSessionEvent } from './types'

let sequence = 0
const id = (sessionId: string, type: string): string => `${sessionId}:${type}:${++sequence}`
const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('\n')
  if (value && typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('content' in value) return textOf(value.content)
    if ('output' in value) return textOf(value.output)
  }
  return ''
}
const stringOf = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const numberOf = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined
/**
 * Real-CLI capture (2026-08-03, `/loop 15s echo …`) showed the reliable tool identity is
 * `update._meta["x.ai/tool"].name` (exact, e.g. "scheduler_create") — `title` mutates between
 * the initial announcement and later updates for the same toolCallId, so it must not be matched
 * on for tool identity (see src/shared/background-activity.ts).
 */
const toolNameOf = (update: Record<string, unknown>): string | undefined => {
  const meta = update._meta
  if (!meta || typeof meta !== 'object') return undefined
  const tool = (meta as Record<string, unknown>)['x.ai/tool']
  if (!tool || typeof tool !== 'object') return undefined
  const name = (tool as Record<string, unknown>).name
  return typeof name === 'string' && name.trim() ? name.trim() : undefined
}

/** Known ACP updates that have no transcript card and must not become "Unsupported Grok event". */
const SILENT_SESSION_UPDATES = new Set([
  'session_info_update'
])

/** Control events stay in state (palette / mode / usage) but must not occupy transcript rows. */
export function isTranscriptVisibleEvent(event: UiSessionEvent): boolean {
  return event.kind !== 'commands' && event.kind !== 'mode' && event.kind !== 'usage'
}

export function normalizeAcpUpdate(sessionId: string, update: Record<string, unknown>): UiSessionEvent | null {
  const updateType = stringOf(update.sessionUpdate, 'unknown')
  if (SILENT_SESSION_UPDATES.has(updateType)) return null
  const eventId = id(sessionId, updateType)

  switch (updateType) {
    case 'user_message_chunk':
      return { id: eventId, sessionId, kind: 'message', role: 'user', text: textOf(update.content) }
    case 'agent_message_chunk':
      return { id: eventId, sessionId, kind: 'message', role: 'assistant', text: textOf(update.content) }
    case 'agent_thought_chunk':
      return { id: eventId, sessionId, kind: 'thought', text: textOf(update.content) }
    case 'tool_call':
    case 'tool_call_update': {
      const toolName = toolNameOf(update)
      return {
        id: eventId,
        sessionId,
        kind: 'tool',
        toolCallId: stringOf(update.toolCallId),
        title: stringOf(update.title, 'Tool call'),
        status: stringOf(update.status, updateType === 'tool_call' ? 'pending' : 'running'),
        ...(update.rawInput !== undefined ? { rawInput: update.rawInput } : {}),
        ...(update.rawOutput !== undefined ? { rawOutput: update.rawOutput } : {}),
        ...(toolName ? { toolName } : {}),
        ...(textOf(update.content) ? { output: textOf(update.content) } : {})
      }
    }
    case 'plan':
      return { id: eventId, sessionId, kind: 'plan', entries: Array.isArray(update.entries) ? update.entries as PlanEntry[] : [] }
    case 'subagent_spawned':
      return {
        id: eventId,
        sessionId,
        kind: 'subagent',
        subagentId: stringOf(update.child_session_id) || stringOf(update.subagent_id),
        description: stringOf(update.description, stringOf(update.title, 'Subagent')),
        status: 'running'
      }
    case 'subagent_finished':
      return {
        id: eventId,
        sessionId,
        kind: 'subagent',
        subagentId: stringOf(update.child_session_id) || stringOf(update.subagent_id),
        description: stringOf(update.description, stringOf(update.title, 'Subagent')),
        status: stringOf(update.status, 'completed'),
        output: textOf(update.output)
      }
    case 'task_backgrounded':
      return { id: eventId, sessionId, kind: 'task', taskId: stringOf(update.task_id), description: stringOf(update.description, stringOf(update.command, 'Background task')), status: 'running' }
    case 'task_completed': {
      const snapshot = update.task_snapshot && typeof update.task_snapshot === 'object' ? update.task_snapshot as Record<string, unknown> : {}
      return { id: eventId, sessionId, kind: 'task', taskId: stringOf(snapshot.id), description: stringOf(snapshot.description, 'Background task'), status: stringOf(snapshot.status, 'completed') }
    }
    case 'session_recap':
      return { id: eventId, sessionId, kind: 'recap', summary: stringOf(update.summary) }
    case 'available_commands_update': {
      const source = Array.isArray(update.availableCommands) ? update.availableCommands : Array.isArray(update.commands) ? update.commands : []
      const commands = source.flatMap((item) => {
        if (!item || typeof item !== 'object' || typeof (item as Record<string, unknown>).name !== 'string') return []
        const record = item as Record<string, unknown>
        const inputHint = typeof record.inputHint === 'string'
          ? record.inputHint
          : typeof record.hint === 'string'
            ? record.hint
            : undefined
        return [{
          name: record.name as string,
          ...(typeof record.description === 'string' ? { description: record.description } : {}),
          ...(inputHint ? { inputHint } : {})
        }]
      })
      return { id: eventId, sessionId, kind: 'commands', commands }
    }
    case 'current_mode_update':
      return { id: eventId, sessionId, kind: 'mode', modeId: stringOf(update.currentModeId) }
    case 'usage_update':
      return { id: eventId, sessionId, kind: 'usage', used: numberOf(update.used), size: numberOf(update.size), cost: numberOf(update.cost) }
    case 'auto_compact_completed': {
      const summaryRaw = update.summary_preview
      const summary = typeof summaryRaw === 'string' && summaryRaw.trim() ? summaryRaw : undefined
      return {
        id: eventId,
        sessionId,
        kind: 'compact',
        before: numberOf(update.tokens_before),
        after: numberOf(update.tokens_after),
        ...(summary ? { summary } : {}),
        source: 'official'
      }
    }
    case 'retry_state':
      return { id: eventId, sessionId, kind: 'retry', attempt: numberOf(update.attempt) ?? 0, maxRetries: numberOf(update.max_retries) ?? 0, reason: stringOf(update.reason) }
    case 'turn_completed': {
      const stopReason = stringOf(update.stop_reason)
      return { id: eventId, sessionId, kind: 'turn', status: stopReason === 'cancelled' ? 'cancelled' : 'completed', stopReason }
    }
    default:
      return { id: eventId, sessionId, kind: 'unknown', updateType, summary: `Unsupported Grok event: ${updateType}` }
  }
}

/** Official `_x.ai/session/interjection` broadcast → user message with origin interject. */
export function normalizeInterjectionNotification(
  sessionId: string,
  payload: { text: string; interjectionId?: string }
): UiSessionEvent {
  const interjectionId = payload.interjectionId?.trim()
  return {
    id: interjectionId ? `${sessionId}:interject:${interjectionId}` : id(sessionId, 'interject'),
    sessionId,
    kind: 'message',
    role: 'user',
    text: payload.text,
    origin: 'interject',
    ...(interjectionId ? { interjectionId } : {})
  }
}
