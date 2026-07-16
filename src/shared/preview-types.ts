/** Preview Dock shared types and limits (pure; no node imports). */

export type PreviewKind = 'image' | 'video' | 'html' | 'code' | 'remote-image'

export type PreviewSource =
  | { type: 'file'; path: string }
  | { type: 'inline-code'; language?: string; content: string; hash: string }
  | { type: 'remote-url'; url: string }

export type PreviewItem = {
  id: string
  kind: PreviewKind
  source: PreviewSource
  /** Display label (filename or language fence). */
  label: string
  /** Short path relative to cwd when known. */
  shortPath?: string
  discoveredAt: number
  mtimeMs?: number
  sizeBytes?: number
  sessionId: string
}

/** Persisted subset of a preview list entry (paths may go stale). */
export type PreviewRecentEntry = {
  path?: string
  kind: PreviewKind
  label: string
  mtimeMs?: number
  language?: string
  /** Inline code only — truncated for storage. */
  contentPreview?: string
}

export type PreviewSettings = {
  open: boolean
  width: number
  autoPreviewLatestMedia: boolean
  showHtmlScriptAdvanced: boolean
  maxImageMb: number
  maxVideoMb: number
  /** Per-session recent items; globally capped to maxRecentSessions keys. */
  recentBySession: Record<string, PreviewRecentEntry[]>
}

export const PREVIEW_BASE64_IMAGE_MAX_BYTES = 8 * 1024 * 1024
export const PREVIEW_CODE_READ_MAX_BYTES = 400 * 1024
export const PREVIEW_CODE_HIGHLIGHT_MAX_BYTES = 200 * 1024
export const PREVIEW_MAX_ITEMS_PER_SESSION = 50
export const PREVIEW_MAX_RECENT_SESSIONS = 20
export const PREVIEW_MIN_WIDTH = 260
export const PREVIEW_MAX_WIDTH = 480
export const PREVIEW_DEFAULT_WIDTH = 360
export const PREVIEW_DEFAULT_MAX_IMAGE_MB = 25
export const PREVIEW_DEFAULT_MAX_VIDEO_MB = 200
export const PREVIEW_RAIL_WIDTH = 40

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  open: false,
  width: PREVIEW_DEFAULT_WIDTH,
  autoPreviewLatestMedia: false,
  showHtmlScriptAdvanced: false,
  maxImageMb: PREVIEW_DEFAULT_MAX_IMAGE_MB,
  maxVideoMb: PREVIEW_DEFAULT_MAX_VIDEO_MB,
  recentBySession: {}
}

export type PreviewStatResult =
  | {
      ok: true
      path: string
      kind: Exclude<PreviewKind, 'remote-image'>
      sizeBytes: number
      mtimeMs: number
      mimeType: string
      /** ≤8MB images may use base64; larger images + all video use protocol. */
      loadVia: 'base64' | 'protocol' | 'text'
      tooLarge: boolean
      maxBytes: number
    }
  | { ok: false; reason: string }

export type PreviewRegisterResult =
  | {
      ok: true
      path: string
      kind: Exclude<PreviewKind, 'remote-image'>
      sizeBytes: number
      mtimeMs: number
      mimeType: string
      protocolUrl?: string
      base64DataUrl?: string
      loadVia: 'base64' | 'protocol' | 'text'
    }
  | { ok: false; reason: string; revealOnly?: boolean }

export type PreviewReadTextResult =
  | { ok: true; path: string; text: string; truncated: boolean; sizeBytes: number; kind: 'html' | 'code' }
  | { ok: false; reason: string }
