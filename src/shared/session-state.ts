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
    events = index >= 0 ? state.events.map((item, itemIndex) => itemIndex === index && item.kind === 'tool' ? { ...item, ...event } : item) : [...state.events, event]
  } else if (event.kind === 'subagent') {
    const index = state.events.findIndex((item) => item.kind === 'subagent' && item.subagentId === event.subagentId)
    events = index >= 0 ? state.events.map((item, itemIndex) => itemIndex === index && item.kind === 'subagent' ? { ...item, ...event } : item) : [...state.events, event]
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
