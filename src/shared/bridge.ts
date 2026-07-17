import type {
  AgentCapabilities, AgentPermissionMode, AppSettings, BillingInfo, CliStatus, ModelState, PermissionRequest, PromptBlock, SessionSummary, SessionUsage, UiSessionEvent
} from './types'
import type { PreviewReadTextResult, PreviewRegisterResult, PreviewStatResult } from './preview-types'

export type CliStatusUpdate = Partial<CliStatus> & { message?: string; stderr?: string }

export type SelectedFile = { path: string; name: string; mimeType?: string; data?: string }
export type SessionFeatures = { sessionId?: string; modes?: unknown; configOptions?: unknown; models?: ModelState }
export type SavePasteImageRequest = { mimeType: string; data: string }
export type SavePasteImageResult = { path: string }

/** Local path stat for dropped Explorer files/folders (P-DRAG-6). */
export type LocalPathStatResult =
  | { path: string; kind: 'file' | 'directory' | 'other'; size?: number }
  | { path: string; kind: 'missing' }

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
  /** Mid-turn interjection via `_x.ai/interject`. Never cancels the turn. */
  interject(sessionId: string, text: string, options?: { interjectionId?: string; content?: unknown[] }): Promise<{ status: 'queued' }>
  cancel(sessionId: string): Promise<void>
  setMode(sessionId: string, modeId: string): Promise<void>
  setModel(sessionId: string, modelId: string, reasoningEffort?: string): Promise<void>
  setConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<unknown>
  respondPermission(requestId: string, optionId: string): Promise<void>
  getPermissionMode(): Promise<AgentPermissionMode>
  setPermissionMode(mode: AgentPermissionMode): Promise<AgentPermissionMode>
  chooseDirectory(): Promise<string | null>
  chooseFiles(): Promise<SelectedFile[]>
  /** Save a clipboard image into %TEMP%/grok-build-gui-paste and return its absolute path. */
  savePasteImage(payload: SavePasteImageRequest): Promise<SavePasteImageResult>
  /**
   * Resolve a File from drag-drop to an absolute OS path (Electron webUtils).
   * Returns null when the runtime cannot map the File (e.g. pure browser tests).
   */
  getPathForFile(file: File): string | null
  /** Stat a dropped absolute path (file vs directory); no recursive listing. */
  statLocalPath(filePath: string): Promise<LocalPathStatResult>
  exportSession(sessionId: string): Promise<string | null>
  /**
   * Reveal an export path in the OS file manager.
   * Main only accepts paths registered from a successful export in this process.
   */
  revealExport(filePath: string): Promise<boolean>
  openTui(cwd: string): Promise<void>
  openExternal(url: string): Promise<void>
  /** OS notification (suppressed when the main window is focused). */
  notify(payload: { title: string; body?: string }): Promise<boolean>
  /** Preview Dock: stat a local file under allowlisted roots. */
  previewStat(filePath: string): Promise<PreviewStatResult>
  /** Preview Dock: register for protocol/base64 load. */
  previewRegister(filePath: string): Promise<PreviewRegisterResult>
  /** Preview Dock: read code/HTML text (utf-8, size-capped). */
  previewReadText(filePath: string): Promise<PreviewReadTextResult>
  /** Preview Dock: open-file dialog; selected file is auto-registered as root. */
  previewChooseFile(): Promise<string | null>
  /** Reveal any absolute path in the OS file manager (best-effort; not export-gated). */
  revealPath(filePath: string): Promise<boolean>
  /** Open a local file with the system default application. */
  openPath(filePath: string): Promise<string>
  onEvent(callback: (event: UiSessionEvent) => void): () => void
  onPermission(callback: (request: PermissionRequest) => void): () => void
  onStatus(callback: (status: CliStatusUpdate) => void): () => void
  /** Remote control (default off). */
  remoteGetState(): Promise<RemoteDesktopState>
  remoteEnable(options?: {
    allowPhonePermissions?: boolean
    useQuickTunnel?: boolean
    riskAcknowledged?: boolean
    cloudflaredPath?: string
  }): Promise<RemoteDesktopState>
  remoteDisable(): Promise<RemoteDesktopState>
  remoteRegeneratePairing(): Promise<RemoteDesktopState>
  remoteSetFocus(sessionId: string | null): Promise<boolean>
  onRemoteState(callback: (state: RemoteDesktopState) => void): () => void
}

export type RemoteDesktopState = {
  enabled: boolean
  banner: string
  pin: string | null
  pairingSecret: string | null
  expiresAt: number | null
  publicBaseUrl: string | null
  localUrl?: string | null
  allowPhonePermissions: boolean
  experimentalTunnel: boolean
}
