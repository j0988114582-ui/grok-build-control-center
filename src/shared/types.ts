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
  | { id: string; sessionId: string; kind: 'commands'; commands: Array<{ name: string; description?: string; inputHint?: string }> }
  | { id: string; sessionId: string; kind: 'mode'; modeId: string }
  | { id: string; sessionId: string; kind: 'usage'; used?: number; size?: number; cost?: number }
  | {
      id: string
      sessionId: string
      kind: 'compact'
      before?: number
      after?: number
      summary?: string
      /** `official` = wire `_x.ai/session_notification` auto_compact_completed; `inferred` = Fallback C signals drop. */
      source?: 'official' | 'inferred'
    }
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
  commands: Array<{ name: string; description?: string; inputHint?: string }>
  currentModeId?: string
  modelState?: ModelState
}

export type ReasoningEffortOption = { id: string; value: string; label: string; description?: string; default?: boolean }
export type ModelInfo = {
  modelId: string
  name: string
  description?: string
  currentReasoningEffort?: string
  reasoningEfforts: ReasoningEffortOption[]
  totalContextTokens?: number
}
export type ModelState = { currentModelId: string; availableModels: ModelInfo[] }

export type SessionUsage = {
  sessionId: string
  contextTokensUsed?: number
  contextWindowTokens?: number
  contextWindowUsage?: number
  turnCount?: number
  toolCallCount?: number
  /** From signals.json; bumps on real compaction (Fallback C signal). */
  compactionCount?: number
}

export type BillingProductUsage = {
  product: string
  usagePercent: number
}

export type BillingInfo = {
  creditUsagePercent: number
  currentPeriod?: {
    type: string
    start?: string
    end?: string
  }
  billingPeriodStart?: string
  billingPeriodEnd?: string
  productUsage: BillingProductUsage[]
  isUnifiedBillingUser?: boolean
  prepaidBalance?: number
}

export type PermissionOption = { optionId: string; name: string; kind: string }
export type PermissionRequest = { requestId: string; sessionId: string; title: string; options: PermissionOption[] }

/** Runtime-only for the current process; always starts as `ask` on app launch. */
export type AgentPermissionMode = 'ask' | 'always-approve'

export type PreviewRecentEntry = {
  path?: string
  kind: 'image' | 'video' | 'html' | 'code' | 'remote-image'
  label: string
  mtimeMs?: number
  language?: string
  contentPreview?: string
}

export type PreviewSettings = {
  open: boolean
  width: number
  autoPreviewLatestMedia: boolean
  /** Whether to show the per-file HTML script allow control (not sticky allow-all). */
  showHtmlScriptAdvanced: boolean
  maxImageMb: number
  maxVideoMb: number
  recentBySession: Record<string, PreviewRecentEntry[]>
}

export type AppSettings = {
  grokExecutable: string
  theme: 'dark' | 'light'
  immersion: 'focus' | 'deep'
  effects: {
    galaxy: boolean
    cursor: boolean
    density: 'low' | 'medium' | 'high'
    reducedMotion: boolean
  }
  sessionTitles: Record<string, string>
  drafts: Record<string, string>
  /** Session ids pinned to the global top sidebar group (local preference only). */
  pinnedSessions: string[]
  recentCommands: string[]
  fontSize: number
  lineHeight: number
  contentWidth: number
  shortcuts: ShortcutBinding[]
  /** Preview Dock preferences (0.7.0+). */
  preview: PreviewSettings
}

export type ShortcutBinding = {
  command: string
  accelerator: string
  scope: 'global' | 'composer' | 'transcript'
}
