import type { PlanEntry, UiSessionEvent } from './types'

let sequence = 0
const id = (sessionId: string, type: string): string => `${sessionId}:${type}:${++sequence}`
const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text
  return ''
}
const stringOf = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const numberOf = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined

export function normalizeAcpUpdate(sessionId: string, update: Record<string, unknown>): UiSessionEvent {
  const updateType = stringOf(update.sessionUpdate, 'unknown')
  const eventId = id(sessionId, updateType)

  switch (updateType) {
    case 'user_message_chunk':
      return { id: eventId, sessionId, kind: 'message', role: 'user', text: textOf(update.content) }
    case 'agent_message_chunk':
      return { id: eventId, sessionId, kind: 'message', role: 'assistant', text: textOf(update.content) }
    case 'agent_thought_chunk':
      return { id: eventId, sessionId, kind: 'thought', text: textOf(update.content) }
    case 'tool_call':
    case 'tool_call_update':
      return {
        id: eventId,
        sessionId,
        kind: 'tool',
        toolCallId: stringOf(update.toolCallId),
        title: stringOf(update.title, 'Tool call'),
        status: stringOf(update.status, updateType === 'tool_call' ? 'pending' : 'running'),
        rawInput: update.rawInput,
        output: textOf(update.content)
      }
    case 'plan':
      return { id: eventId, sessionId, kind: 'plan', entries: Array.isArray(update.entries) ? update.entries as PlanEntry[] : [] }
    case 'subagent_spawned':
      return { id: eventId, sessionId, kind: 'subagent', subagentId: stringOf(update.subagent_id), description: stringOf(update.description, 'Subagent'), status: 'running' }
    case 'subagent_finished':
      return { id: eventId, sessionId, kind: 'subagent', subagentId: stringOf(update.subagent_id), description: stringOf(update.description, 'Subagent'), status: stringOf(update.status, 'completed'), output: textOf(update.output) }
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
      const commands = source.flatMap((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string'
        ? [{ name: (item as Record<string, unknown>).name as string, ...(typeof (item as Record<string, unknown>).description === 'string' ? { description: (item as Record<string, unknown>).description as string } : {}) }]
        : [])
      return { id: eventId, sessionId, kind: 'commands', commands }
    }
    case 'current_mode_update':
      return { id: eventId, sessionId, kind: 'mode', modeId: stringOf(update.currentModeId) }
    case 'usage_update':
      return { id: eventId, sessionId, kind: 'usage', used: numberOf(update.used), size: numberOf(update.size), cost: numberOf(update.cost) }
    case 'auto_compact_completed':
      return { id: eventId, sessionId, kind: 'compact', before: numberOf(update.tokens_before), after: numberOf(update.tokens_after), summary: stringOf(update.summary_preview) }
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
