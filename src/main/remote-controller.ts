import type { AgentPermissionMode, PermissionRequest, SessionSummary, UiSessionEvent } from '../shared/types'
import {
  REMOTE_PROMPT_MAX_CHARS,
  REMOTE_TAIL_MAX_CHARS,
  REMOTE_TAIL_MAX_ITEMS,
  type RemoteBannerState,
  type RemoteFocusStatus,
  type RemotePermissionCard,
  type RemoteSessionListItem,
  type RemoteSnapshot,
  type RemoteTranscriptItem
} from '../shared/remote-protocol'
import { canEnableRemote, canEnableYolo, YOLO_REMOTE_COEXIST_NOTICE } from '../shared/remote-yolo-mutex'
import { RemoteAuthStore } from './remote-auth'

export type RemotePendingPermission = {
  requestId: string
  sessionId: string
  title: string
  allowedOptionIds: string[]
  options: Array<{ optionId: string; name: string; kind: string }>
  expiresAt: number
  consumed: boolean
}

export type RemoteControllerDeps = {
  getPermissionMode: () => AgentPermissionMode
  listSessions: () => SessionSummary[] | Promise<SessionSummary[]>
  isSessionReady: (sessionId: string) => boolean
  prompt: (sessionId: string, text: string) => Promise<void>
  cancel: (sessionId: string) => Promise<void>
  respondPermission: (requestId: string, optionId: string) => void
  onStateChange?: () => void
  now?: () => number
}

/**
 * Single Remote↔ACP broker (plan §6). HTTP layer must not call ACP ad hoc.
 */
export class RemoteController {
  readonly auth = new RemoteAuthStore()
  private enabled = false
  private banner: RemoteBannerState = 'off'
  private allowPhonePermissions = false
  private focusSessionId: string | null = null
  private runningBySession = new Map<string, boolean>()
  private pending = new Map<string, RemotePendingPermission>()
  private tails = new Map<string, RemoteTranscriptItem[]>()
  private inFlightPrompt = new Set<string>()
  private notices: string[] = []
  private publicBaseUrl: string | null = null
  private pairingPin: string | null = null
  private pairingSecret: string | null = null
  private pairingExpiresAt: number | null = null
  private experimentalTunnel = false

  constructor(private deps: RemoteControllerDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private emit(): void {
    this.deps.onStateChange?.()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getBanner(): RemoteBannerState {
    return this.banner
  }

  getPublicBaseUrl(): string | null {
    return this.publicBaseUrl
  }

  getDesktopPairingView(): {
    enabled: boolean
    banner: RemoteBannerState
    pin: string | null
    pairingSecret: string | null
    expiresAt: number | null
    publicBaseUrl: string | null
    allowPhonePermissions: boolean
    experimentalTunnel: boolean
  } {
    return {
      enabled: this.enabled,
      banner: this.banner,
      pin: this.pairingPin,
      pairingSecret: this.pairingSecret,
      expiresAt: this.pairingExpiresAt,
      publicBaseUrl: this.publicBaseUrl,
      allowPhonePermissions: this.allowPhonePermissions,
      experimentalTunnel: this.experimentalTunnel
    }
  }

  /** v0.9: Remote may start in ask or YOLO (desktop confirms when already YOLO). */
  enable(options?: { allowPhonePermissions?: boolean; experimentalTunnel?: boolean }): { ok: true } | { ok: false; reason: string } {
    const gate = canEnableRemote(this.deps.getPermissionMode())
    if (!gate.ok) return gate
    this.enabled = true
    this.allowPhonePermissions = options?.allowPhonePermissions === true
    this.experimentalTunnel = options?.experimentalTunnel === true
    this.banner = 'starting'
    this.notices = this.deps.getPermissionMode() === 'always-approve'
      ? [YOLO_REMOTE_COEXIST_NOTICE]
      : []
    void this.refreshSessions()
    this.emit()
    return { ok: true }
  }

  disable(): void {
    this.enabled = false
    this.banner = 'off'
    this.publicBaseUrl = null
    this.pairingPin = null
    this.pairingSecret = null
    this.pairingExpiresAt = null
    this.auth.revokeAll()
    this.pending.clear()
    this.inFlightPrompt.clear()
    this.emit()
  }

  setBanner(state: RemoteBannerState): void {
    this.banner = state
    this.emit()
  }

  setPublicBaseUrl(url: string | null): void {
    this.publicBaseUrl = url
    this.emit()
  }

  /** Desktop click regenerates pairing; also unlocks elevation PIN lock. */
  regeneratePairing(): { pairingSecret: string; pin: string; expiresAt: number } | null {
    if (!this.enabled) return null
    const opened = this.auth.openPairing(this.now())
    this.pairingSecret = opened.pairingSecret
    this.pairingPin = opened.pin
    this.pairingExpiresAt = opened.expiresAt
    this.banner = this.publicBaseUrl ? 'pairable' : this.banner === 'url_verified' ? 'pairable' : this.banner
    this.emit()
    return { pairingSecret: opened.pairingSecret, pin: opened.pin, expiresAt: opened.expiresAt }
  }

  setFocusSession(sessionId: string | null): void {
    this.focusSessionId = sessionId
    this.emit()
  }

  setRunning(sessionId: string, running: boolean): void {
    this.runningBySession.set(sessionId, running)
    this.emit()
  }

  /** Track permission for object-level remote respond (R-SEC-14). */
  onPermissionRequest(request: PermissionRequest, ttlMs = 5 * 60_000): void {
    this.pending.set(request.requestId, {
      requestId: request.requestId,
      sessionId: request.sessionId,
      title: request.title,
      allowedOptionIds: request.options.map((option) => option.optionId),
      options: request.options.map((option) => ({ optionId: option.optionId, name: option.name, kind: option.kind })),
      expiresAt: this.now() + ttlMs,
      consumed: false
    })
    this.emit()
  }

  clearPermission(requestId: string): void {
    this.pending.delete(requestId)
    this.emit()
  }

  clearPermissionsForSession(sessionId: string): void {
    for (const [id, item] of this.pending) {
      if (item.sessionId === sessionId) this.pending.delete(id)
    }
    this.emit()
  }

  pushEvent(event: UiSessionEvent): void {
    if (event.kind === 'thought') return
    const item = toRemoteTranscriptItem(event)
    if (!item) return
    const list = this.tails.get(event.sessionId) ?? []
    list.push(item)
    while (list.length > REMOTE_TAIL_MAX_ITEMS) list.shift()
    // Cap total chars
    let total = list.reduce((sum, row) => sum + row.text.length, 0)
    while (list.length > 1 && total > REMOTE_TAIL_MAX_CHARS) {
      const removed = list.shift()
      total -= removed?.text.length ?? 0
    }
    this.tails.set(event.sessionId, list)
    if (event.kind === 'turn') {
      this.runningBySession.set(event.sessionId, event.status === 'running')
      if (event.status !== 'running') this.inFlightPrompt.delete(event.sessionId)
    }
  }

  /** YOLO enable check — coexistence allowed; PIN elevation is separate API. */
  assertCanEnableYolo(): { ok: true } | { ok: false; reason: string } {
    return canEnableYolo(this.enabled)
  }

  /**
   * v0.9 E1: mode switch must NOT revoke remote session/cookie/pinHash/72h clock.
   */
  onPermissionModeChanged(mode: AgentPermissionMode): void {
    void mode
    if (!this.enabled) {
      this.emit()
      return
    }
    this.notices = [YOLO_REMOTE_COEXIST_NOTICE]
    this.emit()
  }

  async handlePair(pairingSecret: string, pin: string): Promise<{ ok: true; sessionToken: string } | { ok: false; code: string; message: string }> {
    if (!this.enabled) return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }
    const result = this.auth.pair(pairingSecret, pin, this.now())
    if (!result.ok) return { ok: false, code: result.code, message: result.message }
    this.pairingPin = null
    this.pairingSecret = null
    this.banner = 'paired'
    this.emit()
    return { ok: true, sessionToken: result.value.sessionToken }
  }

  async handlePrompt(text: string): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    if (!this.enabled) return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '桌面尚未選定工作對話' }
    if (!this.deps.isSessionReady(sessionId)) return { ok: false, code: 'not_ready', message: '對話尚未就緒' }
    if (this.inFlightPrompt.has(sessionId) || this.runningBySession.get(sessionId)) {
      return { ok: false, code: 'in_flight', message: '此對話已有進行中的提示' }
    }
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, code: 'invalid_request', message: '提示不可為空' }
    if (trimmed.length > REMOTE_PROMPT_MAX_CHARS) {
      return { ok: false, code: 'invalid_request', message: `提示過長（上限 ${REMOTE_PROMPT_MAX_CHARS} 字）` }
    }
    this.inFlightPrompt.add(sessionId)
    this.notices = ['來自手機遙控：已送出提示']
    this.emit()
    try {
      await this.deps.prompt(sessionId, trimmed)
      return { ok: true }
    } catch (error) {
      this.inFlightPrompt.delete(sessionId)
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async handleCancel(): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '桌面尚未選定工作對話' }
    this.notices = ['來自手機遙控：已要求停止']
    this.emit()
    try {
      await this.deps.cancel(sessionId)
      this.inFlightPrompt.delete(sessionId)
      return { ok: true }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  handlePermissionRespond(requestId: string, optionId: string): { ok: true } | { ok: false; code: string; message: string } {
    if (!this.allowPhonePermissions) {
      return { ok: false, code: 'forbidden', message: '桌面未允許手機核准權限（預設關閉）' }
    }
    const pending = this.pending.get(requestId)
    if (!pending || pending.consumed) return { ok: false, code: 'permission_mismatch', message: '權限請求不存在或已處理' }
    if (this.now() > pending.expiresAt) {
      this.pending.delete(requestId)
      return { ok: false, code: 'permission_mismatch', message: '權限請求已過期' }
    }
    // Fail-closed: must have a focus session and exact match (R-SEC-14)
    if (!this.focusSessionId || pending.sessionId !== this.focusSessionId) {
      return { ok: false, code: 'permission_mismatch', message: '權限請求不屬於目前焦點對話' }
    }
    if (!pending.allowedOptionIds.includes(optionId)) {
      return { ok: false, code: 'permission_mismatch', message: '無效的權限選項' }
    }
    pending.consumed = true
    this.pending.delete(requestId)
    this.notices = ['來自手機遙控：已回覆權限']
    try {
      this.deps.respondPermission(requestId, optionId)
      this.emit()
      return { ok: true }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  getSnapshot(): RemoteSnapshot {
    // Prefer sync listSessions when available; otherwise use last cache
    let list = this.lastSessions
    try {
      const maybe = this.deps.listSessions()
      if (Array.isArray(maybe)) {
        list = maybe
        this.lastSessions = maybe
      } else {
        void maybe.then((rows) => { this.lastSessions = rows }).catch(() => undefined)
      }
    } catch {
      /* keep last */
    }
    const sessions = list.map((session): RemoteSessionListItem => ({
      id: session.id,
      title: session.title,
      cwd: session.cwd,
      ...(session.updatedAt ? { updatedAt: session.updatedAt } : {}),
      running: this.runningBySession.get(session.id) === true
    }))
    const focus = this.focusSessionId
    const focusStatus: RemoteFocusStatus = !focus
      ? 'none'
      : this.deps.isSessionReady(focus)
        ? 'ready'
        : 'loading'
    const permissions: RemotePermissionCard[] = [...this.pending.values()]
      .filter((item) => !item.consumed && this.now() <= item.expiresAt)
      .filter((item) => !focus || item.sessionId === focus)
      .map((item) => ({
        requestId: item.requestId,
        sessionId: item.sessionId,
        title: item.title,
        summary: item.title.slice(0, 200),
        risk: item.options.some((option) => /allow_always|allow_once/i.test(option.kind)) ? 'medium' : 'unknown',
        options: item.options,
        expiresAt: item.expiresAt
      }))

    const paired = this.auth.hasActiveSession(this.now())
    return {
      banner: paired ? this.banner : (this.banner === 'paired' ? 'expired' : this.banner),
      paired,
      permissionMode: this.deps.getPermissionMode(),
      allowPhonePermissions: this.allowPhonePermissions,
      focusSessionId: focus,
      focusStatus,
      running: focus ? this.runningBySession.get(focus) === true : false,
      sessions,
      permissions,
      tail: focus ? (this.tails.get(focus) ?? []) : [],
      notices: [...this.notices],
      sessionExpiresAt: this.auth.getSessionExpiresAt(this.now()),
      elevationLocked: this.auth.isElevationLocked(),
      experimentalTunnel: this.experimentalTunnel
    }
  }

  private lastSessions: SessionSummary[] = []

  private async refreshSessions(): Promise<void> {
    try {
      const list = await Promise.resolve(this.deps.listSessions())
      this.lastSessions = list
    } catch {
      /* keep last */
    }
  }
}

function toRemoteTranscriptItem(event: UiSessionEvent): RemoteTranscriptItem | null {
  if (event.kind === 'message') {
    return {
      id: event.id,
      kind: 'message',
      role: event.role,
      text: event.text.slice(0, 1_500)
    }
  }
  if (event.kind === 'tool') {
    return {
      id: event.id,
      kind: 'tool',
      text: event.title.slice(0, 200),
      status: event.status
    }
  }
  if (event.kind === 'turn') {
    return {
      id: event.id,
      kind: 'turn',
      text: event.status,
      status: event.status
    }
  }
  if (event.kind === 'error') {
    return {
      id: event.id,
      kind: 'error',
      text: event.message.slice(0, 500)
    }
  }
  if (event.kind === 'compact') {
    return {
      id: event.id,
      kind: 'compact',
      text: event.source === 'official' ? '已自動壓縮上下文' : '可能已壓縮上下文'
    }
  }
  return null
}
