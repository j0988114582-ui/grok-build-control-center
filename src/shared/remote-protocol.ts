/** Remote control DTOs and error codes (v0.9.0 workable remote contract). */

export const REMOTE_HEADER = 'x-grok-remote'
export const REMOTE_COOKIE_NAME = 'grok_remote_session'
export const REMOTE_PAIRING_TTL_MS = 3 * 60_000
/** v0.9: no idle disconnect — absolute TTL only. Kept as alias of absolute for callers. */
export const REMOTE_SESSION_IDLE_MS = 72 * 60 * 60_000
/** Absolute session lifetime from pair / re-pair (station owner: 72h). */
export const REMOTE_SESSION_ABSOLUTE_MS = 72 * 60 * 60_000
export const REMOTE_PROMPT_MAX_CHARS = 12_000
/** T1 tail only (no full history reader in 0.9). */
export const REMOTE_TAIL_MAX_ITEMS = 120
/** UTF-8 byte budget for public tail payload (not JS string length). */
export const REMOTE_TAIL_MAX_BYTES = 64_000
/** @deprecated use REMOTE_TAIL_MAX_BYTES — kept for older imports */
export const REMOTE_TAIL_MAX_CHARS = REMOTE_TAIL_MAX_BYTES
export const REMOTE_ELEVATE_PIN_FAIL_LIMIT = 5
export const REMOTE_ELEVATE_RATE_LIMIT = 5
export const REMOTE_ELEVATE_RATE_WINDOW_MS = 10 * 60_000

export type RemoteErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_request'
  | 'pairing_expired'
  | 'pairing_closed'
  | 'pin_invalid'
  | 'elevation_locked'
  | 'rate_limited'
  /** @deprecated v0.9 coexistence — do not use for hard reject of YOLO+Remote */
  | 'yolo_conflict'
  | 'not_ready'
  | 'not_found'
  | 'method_not_allowed'
  | 'permission_mismatch'
  | 'in_flight'
  | 'server_error'

export type RemoteBannerState =
  | 'off'
  | 'starting'
  | 'url_verified'
  | 'pairable'
  | 'paired'
  | 'tunnel_failed'
  | 'expired'

export type RemoteFocusStatus = 'none' | 'loading' | 'ready' | 'error'

export type RemoteSessionListItem = {
  id: string
  title: string
  /** v0.9 single-user: cwd allowed on wire */
  cwd?: string
  updatedAt?: string
  running?: boolean
}

export type RemotePermissionOption = {
  optionId: string
  name: string
  kind: string
}

export type RemotePermissionCard = {
  requestId: string
  sessionId: string
  title: string
  summary: string
  risk: 'low' | 'medium' | 'high' | 'unknown'
  options: RemotePermissionOption[]
  expiresAt: number
}

export type RemoteTranscriptItem = {
  id: string
  kind: 'message' | 'tool' | 'turn' | 'error' | 'compact' | 'other'
  role?: 'user' | 'assistant'
  text: string
  status?: string
}

export type RemoteSnapshot = {
  banner: RemoteBannerState
  paired: boolean
  permissionMode: 'ask' | 'always-approve'
  allowPhonePermissions: boolean
  focusSessionId: string | null
  focusStatus: RemoteFocusStatus
  focusError?: string
  running: boolean
  sessions: RemoteSessionListItem[]
  permissions: RemotePermissionCard[]
  tail: RemoteTranscriptItem[]
  notices: string[]
  /** Absolute session end (ms epoch); null if unpaired */
  sessionExpiresAt: number | null
  elevationLocked: boolean
  experimentalTunnel: boolean
}

export type RemotePairRequest = {
  pairingSecret: string
  pin: string
}

export type RemoteYoloEnableRequest = {
  pin: string
}

export type RemotePromptRequest = {
  text: string
}

export type RemotePermissionRespondRequest = {
  requestId: string
  optionId: string
}

export type RemoteSessionFocusRequest = {
  sessionId: string
}

export type RemoteSessionCreateRequest = {
  cwd: string
}

export type RemotePublicStatus = {
  banner: RemoteBannerState
  pairable: boolean
  paired: boolean
  experimentalTunnel: boolean
}

export function remoteError(code: RemoteErrorCode, message: string): { error: RemoteErrorCode; message: string } {
  return { error: code, message }
}
