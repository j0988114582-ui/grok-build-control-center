/** Remote control DTOs and error codes (R-SEC). Minimal surface for mobile SPA. */

export const REMOTE_HEADER = 'x-grok-remote'
export const REMOTE_COOKIE_NAME = 'grok_remote_session'
export const REMOTE_PAIRING_TTL_MS = 3 * 60_000
export const REMOTE_SESSION_IDLE_MS = 30 * 60_000
export const REMOTE_SESSION_ABSOLUTE_MS = 4 * 60 * 60_000
export const REMOTE_PROMPT_MAX_CHARS = 4_000
export const REMOTE_TAIL_MAX_ITEMS = 40
export const REMOTE_TAIL_MAX_CHARS = 8_000

export type RemoteErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_request'
  | 'pairing_expired'
  | 'pairing_closed'
  | 'pin_invalid'
  | 'rate_limited'
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

export type RemoteSessionListItem = {
  id: string
  title: string
  /** Intentionally omit cwd by default (R-SEC-9). */
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
  /** Typed summary only — no raw tool input. */
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
  running: boolean
  sessions: RemoteSessionListItem[]
  permissions: RemotePermissionCard[]
  tail: RemoteTranscriptItem[]
  notices: string[]
}

export type RemotePairRequest = {
  pairingSecret: string
  pin: string
}

export type RemotePairResponse = {
  ok: true
  /** Cookie is Set-Cookie only; body never includes session token. */
}

export type RemotePromptRequest = {
  text: string
}

export type RemotePermissionRespondRequest = {
  requestId: string
  optionId: string
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
