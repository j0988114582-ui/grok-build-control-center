import type {
  AgentCapabilities, AgentPermissionMode, AppSettings, BillingInfo, CliStatus, ModelState, PermissionRequest, PromptBlock, SessionSummary, SessionUsage, UiSessionEvent
} from './types'

export type CliStatusUpdate = Partial<CliStatus> & { message?: string; stderr?: string }

export type SelectedFile = { path: string; name: string; mimeType?: string; data?: string }
export type SessionFeatures = { sessionId?: string; modes?: unknown; configOptions?: unknown; models?: ModelState }

export interface GrokBridgeApi {
  getStatus(): Promise<CliStatus>
  installCli(): Promise<CliStatus>
  reauthenticate(): Promise<AgentCapabilities>
  connect(): Promise<AgentCapabilities>
  listSessions(): Promise<SessionSummary[]>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<AppSettings>
  createSession(cwd: string): Promise<SessionFeatures>
  loadSession(sessionId: string, cwd: string): Promise<SessionFeatures>
  deleteSession(sessionId: string): Promise<boolean>
  getUsage(sessionId: string): Promise<SessionUsage | null>
  getBilling(): Promise<BillingInfo | null>
  sendPrompt(sessionId: string, blocks: PromptBlock[]): Promise<void>
  cancel(sessionId: string): Promise<void>
  setMode(sessionId: string, modeId: string): Promise<void>
  setModel(sessionId: string, modelId: string, reasoningEffort?: string): Promise<void>
  setConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<unknown>
  respondPermission(requestId: string, optionId: string): Promise<void>
  getPermissionMode(): Promise<AgentPermissionMode>
  setPermissionMode(mode: AgentPermissionMode): Promise<AgentPermissionMode>
  chooseDirectory(): Promise<string | null>
  chooseFiles(): Promise<SelectedFile[]>
  exportSession(sessionId: string): Promise<string | null>
  openTui(cwd: string): Promise<void>
  openExternal(url: string): Promise<void>
  onEvent(callback: (event: UiSessionEvent) => void): () => void
  onPermission(callback: (request: PermissionRequest) => void): () => void
  onStatus(callback: (status: CliStatusUpdate) => void): () => void
}
