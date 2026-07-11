import type {
  AgentCapabilities, AppSettings, CliStatus, PermissionRequest, PromptBlock, SessionSummary, UiSessionEvent
} from './types'

export type SelectedFile = { path: string; name: string; mimeType?: string; data?: string }
export type SessionFeatures = { sessionId?: string; modes?: unknown; configOptions?: unknown }

export interface GrokBridgeApi {
  getStatus(): Promise<CliStatus>
  connect(): Promise<AgentCapabilities>
  listSessions(): Promise<SessionSummary[]>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<AppSettings>
  createSession(cwd: string): Promise<SessionFeatures>
  loadSession(sessionId: string, cwd: string): Promise<SessionFeatures>
  sendPrompt(sessionId: string, blocks: PromptBlock[]): Promise<void>
  cancel(sessionId: string): Promise<void>
  setMode(sessionId: string, modeId: string): Promise<void>
  setConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<unknown>
  respondPermission(requestId: string, optionId: string): Promise<void>
  chooseDirectory(): Promise<string | null>
  chooseFiles(): Promise<SelectedFile[]>
  exportSession(sessionId: string): Promise<string | null>
  openTui(cwd: string): Promise<void>
  openExternal(url: string): Promise<void>
  onEvent(callback: (event: UiSessionEvent) => void): () => void
  onPermission(callback: (request: PermissionRequest) => void): () => void
  onStatus(callback: (status: Partial<CliStatus> & { message?: string }) => void): () => void
}
