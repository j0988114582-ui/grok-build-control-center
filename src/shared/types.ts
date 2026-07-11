export type SessionRole = 'user' | 'assistant'

export type PlanEntry = {
  content: string
  status: string
  priority?: string
}

export type UiSessionEvent =
  | { id: string; sessionId: string; kind: 'message'; role: SessionRole; text: string }
  | { id: string; sessionId: string; kind: 'thought'; text: string }
  | { id: string; sessionId: string; kind: 'tool'; toolCallId: string; title: string; status: string; rawInput?: unknown; output?: string }
  | { id: string; sessionId: string; kind: 'plan'; entries: PlanEntry[] }
  | { id: string; sessionId: string; kind: 'subagent'; subagentId: string; description: string; status: string; output?: string }
  | { id: string; sessionId: string; kind: 'task'; taskId: string; description: string; status: string }
  | { id: string; sessionId: string; kind: 'recap'; summary: string }
  | { id: string; sessionId: string; kind: 'commands'; commands: Array<{ name: string; description?: string }> }
  | { id: string; sessionId: string; kind: 'mode'; modeId: string }
  | { id: string; sessionId: string; kind: 'usage'; used?: number; size?: number; cost?: number }
  | { id: string; sessionId: string; kind: 'compact'; before?: number; after?: number; summary?: string }
  | { id: string; sessionId: string; kind: 'retry'; attempt: number; maxRetries: number; reason: string }
  | { id: string; sessionId: string; kind: 'turn'; status: 'running' | 'completed' | 'cancelled' | 'error'; stopReason?: string }
  | { id: string; sessionId: string; kind: 'error'; message: string }
  | { id: string; sessionId: string; kind: 'unknown'; updateType: string; summary: string }

export type CliStatus = {
  executable: string
  found: boolean
  version?: string
  revision?: string
  connected: boolean
  error?: string
}

export type SessionSummary = {
  id: string
  cwd: string
  title: string
  model?: string
  agentName?: string
  mode?: string
  createdAt?: string
  updatedAt?: string
  messageCount?: number
}

export type PromptBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; name?: string }

export type AgentCapabilities = {
  loadSession: boolean
  promptCapabilities: Record<string, unknown>
  sessionCapabilities: Record<string, unknown>
  modes: Array<{ id: string; name: string }>
  commands: Array<{ name: string; description?: string }>
  currentModeId?: string
}

export type PermissionOption = { optionId: string; name: string; kind: string }
export type PermissionRequest = { requestId: string; sessionId: string; title: string; options: PermissionOption[] }

export type AppSettings = {
  grokExecutable: string
  theme: 'dark' | 'light'
  fontSize: number
  lineHeight: number
  contentWidth: number
  shortcuts: ShortcutBinding[]
}

export type ShortcutBinding = {
  command: string
  accelerator: string
  scope: 'global' | 'composer' | 'transcript'
}
