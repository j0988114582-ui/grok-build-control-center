import path from 'node:path'
import type { AgentPermissionMode, ModelState, PermissionRequest, SessionSummary, UiSessionEvent } from '../shared/types'
import {
  REMOTE_PROMPT_MAX_CHARS,
  REMOTE_TAIL_MAX_BYTES,
  REMOTE_TAIL_MAX_ITEMS,
  type RemoteBannerState,
  type RemoteFocusStatus,
  type RemoteModelState,
  type RemoteModeState,
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

export type RemoteQueuedPrompt = {
  sessionId: string
  text: string
  source: 'mobile-remote' | 'desktop'
}

export type RemoteControllerDeps = {
  getPermissionMode: () => AgentPermissionMode
  listSessions: () => SessionSummary[] | Promise<SessionSummary[]>
  isSessionReady: (sessionId: string) => boolean
  prompt: (sessionId: string, text: string) => Promise<void>
  cancel: (sessionId: string) => Promise<void>
  respondPermission: (requestId: string, optionId: string) => void
  /** main-owned load (E2) */
  loadSession?: (sessionId: string, cwd: string) => Promise<void>
  createSession?: (cwd: string) => Promise<{ sessionId: string; cwd: string }>
  setModel?: (sessionId: string, modelId: string, reasoningEffort?: string) => Promise<void>
  setMode?: (sessionId: string, modeId: string) => Promise<void>
  interject?: (sessionId: string, text: string) => Promise<void>
  setPermissionMode?: (mode: AgentPermissionMode) => Promise<AgentPermissionMode>
  /** Live ACP capability cache — lets the phone pick models/modes instead of typing ids. */
  getCapabilities?: () => { modelState?: ModelState; modes?: Array<{ id: string; name: string }>; currentModeId?: string } | null
  onFocusChanged?: (sessionId: string | null, focusStatus?: RemoteFocusStatus) => void
  onStateChange?: () => void
  now?: () => number
}

export type HandlerResult =
  | { ok: true; sessionId?: string }
  | { ok: false; code: string; message: string }

/** Shared shape normalization (no case folding) — display keeps original casing. */
export function normalizeCwdDisplay(cwd: string): string | null {
  const trimmed = cwd.trim()
  if (!trimmed || trimmed.includes('..')) return null
  const abs = path.isAbsolute(trimmed) || /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')
  if (!abs) return null
  let n = path.normalize(trimmed)
  // Preserve drive root as `C:\` (not `C:`) for stable equality
  if (/^[a-zA-Z]:\\?$/i.test(n)) {
    n = `${n[0]}:\\`
  } else if (!/^\\\\[^\\]+\\[^\\]+$/i.test(n)) {
    n = n.replace(/[\\/]+$/, '')
  }
  return n
}

/** Normalize absolute paths for case-insensitive exact compare. Relative → null. */
export function normalizeCwdKey(cwd: string): string | null {
  const n = normalizeCwdDisplay(cwd)
  if (n === null) return null
  return process.platform === 'win32' ? n.toLowerCase() : n
}

/**
 * Single Remote↔ACP broker. HTTP layer must not call ACP ad hoc.
 */
export class RemoteController {
  readonly auth = new RemoteAuthStore()
  private enabled = false
  private banner: RemoteBannerState = 'off'
  private allowPhonePermissions = false
  private focusSessionId: string | null = null
  private focusStatus: RemoteFocusStatus = 'none'
  private focusError: string | undefined
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
  private lastSessions: SessionSummary[] = []
  private sessionsListFresh = false
  /** Create results not yet visible on disk — merged into list until index catches up or TTL. */
  private optimisticSessions = new Map<string, { summary: SessionSummary; addedAt: number }>()
  private queue: RemoteQueuedPrompt | null = null
  private loadGeneration = 0
  /**
   * Lifecycle epoch: advanced on disable so in-flight ops from a prior enable
   * cannot commit after disable→re-enable.
   */
  private enableEpoch = 0
  /** Monotonic call-order for handleFocus (assigned at entry, before any await). */
  private focusIntentSeq = 0
  /** Highest intent id that successfully validated (last-writer-wins across refresh races). */
  private latestValidatedFocusIntent = 0
  /** Reserved / debug counter for committed focus claims. */
  private focusRequestId = 0

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

  getFocusSessionId(): string | null {
    return this.focusSessionId
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
    focusSessionId: string | null
    focusStatus: RemoteFocusStatus
    focusError?: string
    queue: RemoteQueuedPrompt | null
    notices: string[]
  } {
    return {
      enabled: this.enabled,
      banner: this.banner,
      pin: this.pairingPin,
      pairingSecret: this.pairingSecret,
      expiresAt: this.pairingExpiresAt,
      publicBaseUrl: this.publicBaseUrl,
      allowPhonePermissions: this.allowPhonePermissions,
      experimentalTunnel: this.experimentalTunnel,
      focusSessionId: this.focusSessionId,
      focusStatus: this.focusStatus,
      ...(this.focusError ? { focusError: this.focusError } : {}),
      queue: this.queue ? { ...this.queue } : null,
      notices: [...this.notices]
    }
  }

  enable(options?: { allowPhonePermissions?: boolean; experimentalTunnel?: boolean }): { ok: true } | { ok: false; reason: string } {
    const gate = canEnableRemote(this.deps.getPermissionMode())
    if (!gate.ok) return gate
    this.enabled = true
    this.allowPhonePermissions = options?.allowPhonePermissions === true
    this.experimentalTunnel = options?.experimentalTunnel === true
    this.banner = 'starting'
    this.notices = this.deps.getPermissionMode() === 'always-approve' ? [YOLO_REMOTE_COEXIST_NOTICE] : []
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
    this.queue = null
    this.optimisticSessions.clear()
    this.focusSessionId = null
    this.focusStatus = 'none'
    this.focusError = undefined
    this.enableEpoch += 1
    this.loadGeneration += 1
    this.focusRequestId += 1
    // Invalidate any in-flight intent ordering against a future re-enable
    this.latestValidatedFocusIntent = this.focusIntentSeq
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

  /**
   * Desktop/UI may set focus without load (wave 5 UI align). Prefer handleFocus for remote.
   * Idempotent when sessionId already matches — avoids echo from renderer re-pushing
   * phone-chosen focus (which would bump loadGeneration and cancel in-flight load).
   */
  setFocusSession(sessionId: string | null): void {
    if (sessionId === this.focusSessionId) {
      if (sessionId && this.deps.isSessionReady(sessionId) && this.focusStatus !== 'ready') {
        this.focusStatus = 'ready'
        this.focusError = undefined
        this.emit()
      }
      return
    }
    this.loadGeneration += 1 // cancel in-flight handleFocus/restore loads
    // Any earlier remote focus intent must not overwrite desktop focus after validation
    this.latestValidatedFocusIntent = this.focusIntentSeq
    this.focusSessionId = sessionId
    this.focusStatus = !sessionId ? 'none' : this.deps.isSessionReady(sessionId) ? 'ready' : 'loading'
    this.focusError = undefined
    this.deps.onFocusChanged?.(sessionId, this.focusStatus)
    this.emit()
  }

  setRunning(sessionId: string, running: boolean): void {
    this.runningBySession.set(sessionId, running)
    if (!running) {
      void this.drainQueueIfIdle(sessionId)
    }
    this.emit()
  }

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
    // T1: bound public wire size via JSON UTF-8 (includes escaping overhead)
    enforceTailPayloadBudget(list)
    this.tails.set(event.sessionId, list)
    if (event.kind === 'turn') {
      this.runningBySession.set(event.sessionId, event.status === 'running')
      if (event.status !== 'running') {
        this.inFlightPrompt.delete(event.sessionId)
        // Same as desktop: a finished/cancelled turn invalidates its pending permission cards.
        this.clearPermissionsForSession(event.sessionId)
        void this.drainQueueIfIdle(event.sessionId)
      }
    }
  }

  /** Any turn running or prompt in flight — blocks phone YOLO toggles (parity with desktop lock). */
  hasRunningActivity(): boolean {
    if (this.inFlightPrompt.size > 0) return true
    for (const running of this.runningBySession.values()) {
      if (running) return true
    }
    return false
  }

  assertCanEnableYolo(): { ok: true } | { ok: false; reason: string } {
    return canEnableYolo(this.enabled)
  }

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

  /**
   * Desktop deleted a session — drop every remote trace so the phone cannot keep
   * prompting a ghost (focus, tail, running flags, queue, pending permissions).
   */
  onSessionDeleted(sessionId: string): void {
    this.runningBySession.delete(sessionId)
    this.inFlightPrompt.delete(sessionId)
    this.tails.delete(sessionId)
    this.optimisticSessions.delete(sessionId)
    for (const [id, item] of this.pending) {
      if (item.sessionId === sessionId) this.pending.delete(id)
    }
    if (this.queue?.sessionId === sessionId) this.queue = null
    this.lastSessions = this.lastSessions.filter((session) => session.id !== sessionId)
    if (this.focusSessionId === sessionId) {
      this.loadGeneration += 1
      this.latestValidatedFocusIntent = this.focusIntentSeq
      this.focusSessionId = null
      this.focusStatus = 'none'
      this.focusError = undefined
      this.deps.onFocusChanged?.(null, 'none')
    }
    this.emit()
  }

  /** Phone-side logout: revoke sessions AND reflect it on the desktop panel (F4). */
  handleLogout(): void {
    this.auth.revokeAll()
    this.pending.clear()
    this.banner = 'expired'
    this.notices = ['手機端已切斷遠端連線；要再配對請按「重新產生配對」']
    this.emit()
  }

  /** Transient progress line for the desktop notices toast (e.g. tunnel health retries). */
  setStatusNotice(text: string): void {
    this.notices = [text]
    this.emit()
  }

  /**
   * E2: main-owned focus + load.
   * - Call-order intent id is assigned at entry (last-writer-wins across out-of-order refresh).
   * - Invalid / refresh-failed requests never bump `loadGeneration` or latest validated intent.
   * - `enableEpoch` (advanced on disable) prevents disable→re-enable resurrection.
   */
  async handleFocus(sessionId: string): Promise<HandlerResult> {
    if (!this.enabled) return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }

    const epoch = this.enableEpoch
    const intentId = ++this.focusIntentSeq

    await this.refreshSessions()
    if (!this.sameFocusLifecycle(epoch)) {
      return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }
    }
    if (!this.sessionsListFresh) {
      // Fail closed without canceling an incumbent valid load
      return { ok: false, code: 'not_ready', message: '無法刷新 session 列表，拒絕切換焦點' }
    }
    const summary = this.lastSessions.find((item) => item.id === sessionId)
    if (!summary) {
      // Rejected: leave incumbent focus + loadGeneration + latestValidated untouched
      return { ok: false, code: 'not_found', message: '找不到該對話' }
    }

    // Older/equal intent lost to a newer validated focus OR desktop setFocusSession/disable
    // (those set latestValidatedFocusIntent = focusIntentSeq so pending intents are stale).
    if (intentId <= this.latestValidatedFocusIntent) {
      return { ok: false, code: 'not_ready', message: '焦點已變更' }
    }
    this.latestValidatedFocusIntent = intentId

    // Valid focus claims the load slot — supersedes in-flight loads only now
    const gen = ++this.loadGeneration
    this.focusRequestId += 1
    this.focusSessionId = sessionId
    this.focusError = undefined
    // Status is decided before notifying so the renderer payload carries it (F5).
    this.focusStatus = this.deps.isSessionReady(sessionId) ? 'ready' : 'loading'
    this.deps.onFocusChanged?.(sessionId, this.focusStatus)

    if (this.deps.isSessionReady(sessionId)) {
      if (!this.sameFocusLifecycle(epoch) || gen !== this.loadGeneration) {
        return { ok: false, code: 'not_ready', message: '焦點已變更' }
      }
      this.focusStatus = 'ready'
      this.emit()
      return { ok: true, sessionId }
    }

    if (!this.deps.loadSession) {
      if (this.sameFocusLifecycle(epoch) && gen === this.loadGeneration) {
        this.focusStatus = 'error'
        this.focusError = '載入對話能力未就緒'
        this.emit()
      }
      return { ok: false, code: 'not_ready', message: '載入對話能力未就緒' }
    }

    this.focusStatus = 'loading'
    this.emit()
    try {
      await this.deps.loadSession(sessionId, summary.cwd)
      if (!this.sameFocusLifecycle(epoch) || gen !== this.loadGeneration || this.focusSessionId !== sessionId) {
        return { ok: false, code: 'not_ready', message: '焦點已變更' }
      }
      this.focusStatus = this.deps.isSessionReady(sessionId) ? 'ready' : 'loading'
      this.emit()
      return { ok: true, sessionId }
    } catch (error) {
      if (this.sameFocusLifecycle(epoch) && gen === this.loadGeneration && this.focusSessionId === sessionId) {
        this.focusStatus = 'error'
        this.focusError = error instanceof Error ? error.message : String(error)
        this.emit()
      }
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  private sameFocusLifecycle(epoch: number): boolean {
    return this.enabled && this.enableEpoch === epoch
  }

  /** After ACP reconnect (e.g. YOLO), main reloads focus session. */
  async restoreFocusAfterReconnect(): Promise<void> {
    const id = this.focusSessionId
    if (!id || !this.enabled) return
    const epoch = this.enableEpoch
    const gen = ++this.loadGeneration
    this.focusStatus = 'loading'
    this.focusError = undefined
    this.emit()
    await this.refreshSessions()
    if (!this.sameFocusLifecycle(epoch) || gen !== this.loadGeneration || this.focusSessionId !== id) return
    const summary = this.lastSessions.find((item) => item.id === id)
    if (!summary || !this.deps.loadSession) {
      if (this.sameFocusLifecycle(epoch) && this.focusSessionId === id && gen === this.loadGeneration) {
        this.focusStatus = 'error'
        this.focusError = '重連後無法恢復焦點對話'
        this.emit()
      }
      return
    }
    try {
      await this.deps.loadSession(id, summary.cwd)
      if (!this.sameFocusLifecycle(epoch) || gen !== this.loadGeneration || this.focusSessionId !== id) return
      this.focusStatus = this.deps.isSessionReady(id) ? 'ready' : 'loading'
      this.focusError = undefined
    } catch (error) {
      if (this.sameFocusLifecycle(epoch) && this.focusSessionId === id && gen === this.loadGeneration) {
        this.focusStatus = 'error'
        this.focusError = error instanceof Error ? error.message : String(error)
      }
    }
    this.emit()
  }

  listCwdUnion(): string[] {
    // Callers that authorize create must refreshSessions first (fail-closed if not fresh).
    const set = new Map<string, string>()
    for (const session of this.lastSessions) {
      const key = normalizeCwdKey(session.cwd)
      if (!key) continue
      if (!set.has(key)) {
        // Display keeps original casing; equality still runs on the folded key.
        set.set(key, normalizeCwdDisplay(session.cwd) ?? key)
      }
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }

  isCwdInUnion(cwd: string): boolean {
    if (!this.sessionsListFresh) return false
    const key = normalizeCwdKey(cwd)
    if (!key) return false
    // exact key only — no child path of union member
    return this.listCwdUnion().some((item) => normalizeCwdKey(item) === key)
  }

  async handleCreateSession(cwd: string): Promise<HandlerResult> {
    if (!this.enabled) return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }
    await this.refreshSessions()
    if (!this.sessionsListFresh) {
      return { ok: false, code: 'not_ready', message: '無法刷新 session 列表，拒絕建立（fail-closed）' }
    }
    if (!this.isCwdInUnion(cwd)) {
      return { ok: false, code: 'forbidden', message: '路徑不在既有專案列表中' }
    }
    if (!this.deps.createSession) {
      return { ok: false, code: 'not_ready', message: '建立對話能力未就緒' }
    }
    try {
      const created = await this.deps.createSession(path.normalize(cwd.trim()))
      // Authoritative create result — keep until disk index catches up (E4)
      const optimistic: SessionSummary = {
        id: created.sessionId,
        cwd: created.cwd || path.normalize(cwd.trim()),
        title: created.sessionId
      }
      this.optimisticSessions.set(created.sessionId, { summary: optimistic, addedAt: this.now() })
      this.mergeOptimisticIntoLastSessions()
      this.sessionsListFresh = true
      await this.refreshSessions()
      const focused = await this.handleFocus(created.sessionId)
      if (!focused.ok) {
        // Session exists; report success with sessionId so client can retry focus
        this.notices = [`對話已建立（${created.sessionId.slice(0, 8)}…）但焦點未就緒，請再點選`]
        this.emit()
        return { ok: true, sessionId: created.sessionId }
      }
      this.notices = ['來自手機遙控：已建立對話']
      this.emit()
      return { ok: true, sessionId: created.sessionId }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async handleYoloEnable(pin: string, tokenHash: string): Promise<HandlerResult> {
    if (!this.enabled) return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }
    if (this.deps.getPermissionMode() === 'always-approve') {
      return { ok: true }
    }
    // Parity with desktop permissionControlsLocked: mode switch reconnects ACP and
    // would kill any in-flight turn — refuse instead of silently dropping work.
    if (this.hasRunningActivity()) {
      return { ok: false, code: 'in_flight', message: '有回合執行中：請先停止（或等它完成）再切換 YOLO' }
    }
    const pinResult = this.auth.verifyElevationPin(pin, tokenHash, this.now())
    if (!pinResult.ok) return { ok: false, code: pinResult.code, message: pinResult.message }
    if (!this.deps.setPermissionMode) {
      return { ok: false, code: 'not_ready', message: '權限模式切換未就緒' }
    }
    try {
      await this.deps.setPermissionMode('always-approve')
      this.notices = ['來自手機遙控：已開啟 YOLO（一律核准）']
      this.emit()
      // Caller (main) must reconnect ACP then restoreFocusAfterReconnect
      return { ok: true }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async handleYoloDisable(): Promise<HandlerResult> {
    if (!this.enabled) return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }
    if (this.deps.getPermissionMode() === 'ask') return { ok: true }
    if (this.hasRunningActivity()) {
      return { ok: false, code: 'in_flight', message: '有回合執行中：請先停止（或等它完成）再切換 YOLO' }
    }
    if (!this.deps.setPermissionMode) {
      return { ok: false, code: 'not_ready', message: '權限模式切換未就緒' }
    }
    try {
      await this.deps.setPermissionMode('ask')
      this.notices = ['來自手機遙控：已關閉 YOLO，遙控仍連線']
      this.emit()
      return { ok: true }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async handleSetModel(modelId: string, reasoningEffort?: string): Promise<HandlerResult> {
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '尚未選定對話' }
    if (!this.deps.isSessionReady(sessionId)) return { ok: false, code: 'not_ready', message: '對話尚未就緒' }
    if (!this.deps.setModel) return { ok: false, code: 'not_ready', message: '切換模型未就緒' }
    try {
      await this.deps.setModel(sessionId, modelId, reasoningEffort)
      this.notices = ['來自手機遙控：已切換模型']
      this.emit()
      return { ok: true, sessionId }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async handleSetMode(modeId: string): Promise<HandlerResult> {
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '尚未選定對話' }
    if (!this.deps.isSessionReady(sessionId)) return { ok: false, code: 'not_ready', message: '對話尚未就緒' }
    if (!this.deps.setMode) return { ok: false, code: 'not_ready', message: '切換工作模式未就緒' }
    try {
      await this.deps.setMode(sessionId, modeId)
      this.notices = ['來自手機遙控：已切換工作模式']
      this.emit()
      return { ok: true, sessionId }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async handlePrompt(text: string): Promise<HandlerResult> {
    if (!this.enabled) return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '尚未選定工作對話' }
    if (this.focusStatus === 'loading') return { ok: false, code: 'not_ready', message: '對話載入中' }
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
    // Accepted-then-run: the ACP prompt resolves only when the whole turn ends, which can
    // exceed tunnel proxy timeouts (~100s) and make the phone mis-report failure. Return
    // immediately; progress flows via snapshot polling, failures via notices + turn events.
    this.firePrompt(sessionId, trimmed)
    return { ok: true, sessionId }
  }

  private firePrompt(sessionId: string, text: string): void {
    void this.deps.prompt(sessionId, text).catch((error) => {
      this.inFlightPrompt.delete(sessionId)
      const message = error instanceof Error ? error.message : String(error)
      this.notices = [`提示送出失敗：${message}`]
      this.emit()
    })
  }

  async handleInterject(text: string): Promise<HandlerResult> {
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '尚未選定對話' }
    if (this.focusStatus !== 'ready' || !this.deps.isSessionReady(sessionId)) {
      return { ok: false, code: 'not_ready', message: '對話尚未就緒' }
    }
    if (!this.runningBySession.get(sessionId)) return { ok: false, code: 'invalid_request', message: '僅執行中可插話' }
    if (!this.deps.interject) return { ok: false, code: 'not_ready', message: '插話能力未就緒' }
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, code: 'invalid_request', message: '插話內容不可為空' }
    try {
      await this.deps.interject(sessionId, trimmed)
      this.notices = ['來自手機遙控：已插話']
      this.emit()
      return { ok: true, sessionId }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Cancel current turn then send new prompt.
   * ACL: only when turn is running / in-flight (matches desktop「立刻改做」).
   */
  async handleDoNow(text: string): Promise<HandlerResult> {
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '尚未選定對話' }
    if (this.focusStatus !== 'ready' || !this.deps.isSessionReady(sessionId)) {
      return { ok: false, code: 'not_ready', message: '對話尚未就緒' }
    }
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, code: 'invalid_request', message: '提示不可為空' }
    const running = this.runningBySession.get(sessionId) === true || this.inFlightPrompt.has(sessionId)
    if (!running) {
      return { ok: false, code: 'invalid_request', message: '僅在回合執行中可使用立刻改做' }
    }
    this.queue = null
    try {
      await this.deps.cancel(sessionId)
      if (this.focusSessionId !== sessionId) {
        return { ok: false, code: 'not_ready', message: '焦點已變更，取消立刻改做' }
      }
      // Let the cancelled turn's stop event land first — otherwise its pushEvent would
      // wipe the NEW prompt's in-flight flag and open a duplicate-prompt window.
      await this.waitForTurnIdle(sessionId)
      this.inFlightPrompt.delete(sessionId)
      this.runningBySession.set(sessionId, false)
      if (this.focusSessionId !== sessionId) {
        return { ok: false, code: 'not_ready', message: '焦點已變更，取消立刻改做' }
      }
      return await this.handlePromptForSession(sessionId, trimmed)
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Bounded wait for the turn-stop event after cancel (fallback: force-clear at timeout). */
  private async waitForTurnIdle(sessionId: string, maxMs = 1_200): Promise<void> {
    const step = 50
    for (let waited = 0; waited < maxMs; waited += step) {
      if (!this.runningBySession.get(sessionId) && !this.inFlightPrompt.has(sessionId)) return
      await new Promise((resolve) => setTimeout(resolve, step))
    }
  }

  /** Main-side single-slot queue; last writer wins vs desktop (E9). */
  handleQueue(text: string, source: 'mobile-remote' | 'desktop' = 'mobile-remote'): HandlerResult {
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '尚未選定對話' }
    if (this.focusStatus === 'loading' || this.focusStatus === 'error' || !this.deps.isSessionReady(sessionId)) {
      return { ok: false, code: 'not_ready', message: '對話載入中或未就緒，無法排隊' }
    }
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, code: 'invalid_request', message: '排隊內容不可為空' }
    this.queue = { sessionId, text: trimmed, source }
    this.notices = [`來自${source === 'mobile-remote' ? '手機' : '桌面'}：已排隊下一輪`]
    this.emit()
    if (!this.runningBySession.get(sessionId) && !this.inFlightPrompt.has(sessionId)) {
      void this.drainQueueIfIdle(sessionId)
    }
    return { ok: true, sessionId }
  }

  handleQueueClear(): HandlerResult {
    this.queue = null
    this.notices = ['已清除排隊']
    this.emit()
    return { ok: true }
  }

  getQueue(): RemoteQueuedPrompt | null {
    return this.queue
  }

  private async drainQueueIfIdle(sessionId: string): Promise<void> {
    const q = this.queue
    if (!q || q.sessionId !== sessionId) return
    // Only drain if focus still matches queued session (avoid s1 queue firing on s2)
    if (this.focusSessionId !== sessionId) {
      this.queue = null
      this.notices = ['排隊已取消：焦點對話已變更']
      this.emit()
      return
    }
    if (this.runningBySession.get(sessionId) || this.inFlightPrompt.has(sessionId)) return
    this.queue = null
    this.emit()
    // Pass explicit sessionId + provenance so drain notice matches last writer
    await this.handlePromptForSession(sessionId, q.text, q.source)
  }

  private async handlePromptForSession(
    sessionId: string,
    text: string,
    source: 'mobile-remote' | 'desktop' = 'mobile-remote'
  ): Promise<HandlerResult> {
    if (this.focusSessionId !== sessionId) {
      return { ok: false, code: 'not_ready', message: '焦點已變更，取消送出' }
    }
    if (!this.enabled) return { ok: false, code: 'forbidden', message: '遠端遙控未啟用' }
    if (this.focusStatus === 'loading') return { ok: false, code: 'not_ready', message: '對話載入中' }
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
    this.notices = [
      source === 'desktop' ? '來自桌面：已送出排隊提示' : '來自手機遙控：已送出提示'
    ]
    this.emit()
    if (this.focusSessionId !== sessionId) {
      this.inFlightPrompt.delete(sessionId)
      return { ok: false, code: 'not_ready', message: '焦點已變更，取消送出' }
    }
    // Same accepted-then-run contract as handlePrompt (tunnel-safe response time).
    this.firePrompt(sessionId, trimmed)
    return { ok: true, sessionId }
  }

  async handleCancel(): Promise<HandlerResult> {
    const sessionId = this.focusSessionId
    if (!sessionId) return { ok: false, code: 'not_ready', message: '尚未選定工作對話' }
    this.notices = ['來自手機遙控：已要求停止']
    this.emit()
    try {
      await this.deps.cancel(sessionId)
      this.inFlightPrompt.delete(sessionId)
      this.runningBySession.set(sessionId, false)
      return { ok: true, sessionId }
    } catch (error) {
      return { ok: false, code: 'server_error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  handlePermissionRespond(requestId: string, optionId: string): HandlerResult {
    if (!this.allowPhonePermissions) {
      return { ok: false, code: 'forbidden', message: '桌面未允許手機核准權限（預設關閉）' }
    }
    const pending = this.pending.get(requestId)
    if (!pending || pending.consumed) return { ok: false, code: 'permission_mismatch', message: '權限請求不存在或已處理' }
    if (this.now() > pending.expiresAt) {
      this.pending.delete(requestId)
      return { ok: false, code: 'permission_mismatch', message: '權限請求已過期' }
    }
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
    } catch {
      // Race with desktop click / turn end: ACP no longer holds the request.
      this.emit()
      return { ok: false, code: 'permission_mismatch', message: '權限請求已由桌面處理或已失效' }
    }
  }

  getSnapshot(): RemoteSnapshot {
    try {
      const maybe = this.deps.listSessions()
      if (Array.isArray(maybe)) {
        for (const row of maybe) this.optimisticSessions.delete(row.id)
        this.lastSessions = maybe
        this.mergeOptimisticIntoLastSessions()
      } else {
        void maybe
          .then((rows) => {
            for (const row of rows) this.optimisticSessions.delete(row.id)
            this.lastSessions = rows
            this.mergeOptimisticIntoLastSessions()
          })
          .catch(() => undefined)
      }
    } catch {
      /* keep last (still merge optimistics below) */
      this.mergeOptimisticIntoLastSessions()
    }
    const list = this.lastSessions
    const sessions = list.map((session): RemoteSessionListItem => ({
      id: session.id,
      title: session.title,
      cwd: session.cwd,
      ...(session.updatedAt ? { updatedAt: session.updatedAt } : {}),
      running: this.runningBySession.get(session.id) === true
    }))
    const focus = this.focusSessionId
    let focusStatus = this.focusStatus
    if (focus && this.deps.isSessionReady(focus)) focusStatus = 'ready'
    else if (focus && focusStatus === 'ready' && !this.deps.isSessionReady(focus)) focusStatus = 'loading'

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
      ...(this.focusError ? { focusError: this.focusError } : {}),
      running: focus ? this.runningBySession.get(focus) === true : false,
      sessions,
      permissions,
      tail: focus ? (this.tails.get(focus) ?? []) : [],
      models: this.snapshotModels(),
      modes: this.snapshotModes(),
      notices: [...this.notices],
      sessionExpiresAt: this.auth.getSessionExpiresAt(this.now()),
      elevationLocked: this.auth.isElevationLocked(),
      experimentalTunnel: this.experimentalTunnel
    }
  }

  /** Bounded projection of the ACP model cache (phone picker; wire-size capped). */
  private snapshotModels(): RemoteModelState | null {
    const caps = this.deps.getCapabilities?.()
    const state = caps?.modelState
    if (!state || !Array.isArray(state.availableModels)) return null
    const availableModels = state.availableModels.slice(0, 16).map((model) => ({
      modelId: String(model.modelId).slice(0, 64),
      name: String(model.name).slice(0, 80),
      ...(model.currentReasoningEffort ? { currentReasoningEffort: String(model.currentReasoningEffort).slice(0, 32) } : {}),
      reasoningEfforts: (model.reasoningEfforts ?? []).slice(0, 8).map((effort) => ({
        id: String(effort.id).slice(0, 32),
        value: String(effort.value).slice(0, 32),
        label: String(effort.label).slice(0, 48)
      }))
    }))
    return { currentModelId: state.currentModelId ? String(state.currentModelId).slice(0, 64) : null, availableModels }
  }

  private snapshotModes(): RemoteModeState | null {
    const caps = this.deps.getCapabilities?.()
    if (!caps || !Array.isArray(caps.modes) || caps.modes.length === 0) return null
    const availableModes = caps.modes.slice(0, 16).map((mode) => ({
      id: String(mode.id).slice(0, 64),
      name: String(mode.name).slice(0, 80)
    }))
    return { currentModeId: caps.currentModeId ? String(caps.currentModeId).slice(0, 64) : null, availableModes }
  }

  async refreshSessions(): Promise<SessionSummary[]> {
    try {
      const list = await Promise.resolve(this.deps.listSessions())
      // Drop optimistic rows once disk shows them
      for (const row of list) {
        this.optimisticSessions.delete(row.id)
      }
      this.lastSessions = list
      this.mergeOptimisticIntoLastSessions()
      this.sessionsListFresh = true
      return this.lastSessions
    } catch {
      this.sessionsListFresh = false
      return this.lastSessions
    }
  }

  /** CLI never wrote the session to disk → stop advertising it after 10 minutes. */
  private static readonly OPTIMISTIC_TTL_MS = 10 * 60_000

  private mergeOptimisticIntoLastSessions(): void {
    if (this.optimisticSessions.size === 0) return
    const now = this.now()
    for (const [id, entry] of this.optimisticSessions) {
      if (now - entry.addedAt > RemoteController.OPTIMISTIC_TTL_MS) this.optimisticSessions.delete(id)
    }
    if (this.optimisticSessions.size === 0) return
    const merged = [...this.lastSessions]
    for (const entry of this.optimisticSessions.values()) {
      if (!merged.some((s) => s.id === entry.summary.id)) merged.unshift(entry.summary)
    }
    this.lastSessions = merged
  }
}

function toRemoteTranscriptItem(event: UiSessionEvent): RemoteTranscriptItem | null {
  const id = event.id.slice(0, 128)
  if (event.kind === 'message') {
    return { id, kind: 'message', role: event.role, text: event.text.slice(0, 1_500) }
  }
  if (event.kind === 'tool') {
    return {
      id,
      kind: 'tool',
      text: event.title.slice(0, 200),
      status: String(event.status).slice(0, 64)
    }
  }
  if (event.kind === 'turn') {
    const st = String(event.status).slice(0, 64)
    return { id, kind: 'turn', text: st, status: st }
  }
  if (event.kind === 'error') {
    return { id, kind: 'error', text: event.message.slice(0, 500) }
  }
  if (event.kind === 'compact') {
    return {
      id,
      kind: 'compact',
      text: event.source === 'official' ? '已自動壓縮上下文' : '可能已壓縮上下文'
    }
  }
  return null
}

/** Public tail wire size (JSON UTF-8, includes escaping). */
function remoteTailPayloadBytes(list: RemoteTranscriptItem[]): number {
  return Buffer.byteLength(JSON.stringify(list), 'utf8')
}

/**
 * Ensure list serializes to ≤ maxBytes. Drop oldest items first; for a single
 * oversize row, strip optional fields then shrink text; if still over, drop it.
 */
function enforceTailPayloadBudget(list: RemoteTranscriptItem[], maxBytes = REMOTE_TAIL_MAX_BYTES): void {
  while (list.length > 1 && remoteTailPayloadBytes(list) > maxBytes) {
    list.shift()
  }
  if (list.length === 0 || remoteTailPayloadBytes(list) <= maxBytes) return

  const row = list[0]!
  // Non-text fields can also explode wire size — clear optionals first
  delete row.role
  delete row.status
  row.id = row.id.slice(0, 32)
  if (remoteTailPayloadBytes(list) <= maxBytes) return

  const full = row.text
  let lo = 0
  let hi = full.length
  let best = 0
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    row.text = full.slice(0, mid)
    if (remoteTailPayloadBytes(list) <= maxBytes) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  row.text = full.slice(0, best)
  if (remoteTailPayloadBytes(list) > maxBytes) {
    list.shift() // fail-closed: never expose an oversize tail
  }
}
