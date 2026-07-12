import type { UiSessionEvent } from './types'

export type SessionState = {
  sessionId: string
  events: UiSessionEvent[]
  running: boolean
  followTail: boolean
  unread: number
}

export type SessionAction =
  | { type: 'event'; event: UiSessionEvent }
  | { type: 'followTail'; value: boolean }
  | { type: 'clearUnread' }
  | { type: 'reset'; sessionId: string }

export const createSessionState = (sessionId: string): SessionState => ({
  sessionId,
  events: [],
  running: false,
  followTail: true,
  unread: 0
})

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === 'reset') return createSessionState(action.sessionId)
  if (action.type === 'followTail') return { ...state, followTail: action.value, unread: action.value ? 0 : state.unread }
  if (action.type === 'clearUnread') return { ...state, unread: 0 }

  const event = action.event
  const last = state.events.at(-1)
  let events = state.events
  if (event.kind === 'tool') {
    const index = state.events.findIndex((item) => item.kind === 'tool' && item.toolCallId === event.toolCallId)
    events = index >= 0 ? state.events.map((item, itemIndex) => itemIndex === index && item.kind === 'tool' ? {
      ...item,
      ...event,
      id: item.id,
      title: event.title === 'Tool call' ? item.title : event.title,
      rawInput: event.rawInput ?? item.rawInput,
      output: event.output ?? item.output
    } : item) : [...state.events, event]
  } else if (event.kind === 'subagent') {
    const index = state.events.findIndex((item) => item.kind === 'subagent' && item.subagentId === event.subagentId)
    events = index >= 0 ? state.events.map((item, itemIndex) => itemIndex === index && item.kind === 'subagent' ? { ...item, ...event, id: item.id } : item) : [...state.events, event]
  } else if (event.kind === 'task' && event.taskId) {
    const index = state.events.findIndex((item) => item.kind === 'task' && item.taskId === event.taskId)
    events = index >= 0 ? state.events.map((item, itemIndex) => itemIndex === index && item.kind === 'task' ? {
      ...item,
      ...event,
      id: item.id,
      description: !event.description.trim() || event.description === 'Background task' ? item.description : event.description,
      status: ['completed', 'cancelled', 'error', 'failed'].includes(item.status) && !['completed', 'cancelled', 'error', 'failed'].includes(event.status) ? item.status : event.status
    } : item) : [...state.events, event]
  } else if (event.kind === 'turn' && last?.kind === 'turn' && last.status === event.status) {
    events = [...state.events.slice(0, -1), event]
  } else if (event.kind === 'message' && last?.kind === 'message' && last.role === event.role) {
    events = [...state.events.slice(0, -1), { ...last, text: last.text + event.text }]
  } else if (event.kind === 'thought' && last?.kind === 'thought') {
    events = [...state.events.slice(0, -1), { ...last, text: last.text + event.text }]
  } else {
    events = [...state.events, event]
  }

  const running = event.kind === 'turn'
    ? event.status === 'running'
    : state.running

  return {
    ...state,
    events,
    running,
    unread: state.followTail ? state.unread : state.unread + 1
  }
}
