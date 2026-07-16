/**
 * Path safety policy for Preview Dock.
 * Pure string helpers — no node: imports (shared is used by web tsconfig too).
 * Main must still realpath() before trust and re-validate on protocol serve.
 */

import type { PreviewKind } from './preview-types'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])
const VIDEO_EXTS = new Set(['.mp4', '.webm'])
const HTML_EXTS = new Set(['.html', '.htm'])
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.txt', '.css', '.scss', '.less',
  '.py', '.rs', '.go', '.java', '.kt', '.cs',
  '.c', '.h', '.cpp', '.hpp', '.cc',
  '.sh', '.bash', '.ps1', '.bat', '.cmd',
  '.yml', '.yaml', '.toml', '.ini', '.env',
  '.xml', '.svg', // svg can also be image; kind prefers image
  '.sql', '.graphql', '.vue', '.svelte',
  '.rb', '.php', '.swift', '.r', '.lua',
  '.dockerfile', '.makefile', '.cmake',
  '.log', '.csv', '.tsv'
])

const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
])

const isWindowsDriveAbs = (filePath: string): boolean => /^[a-zA-Z]:[\\/]/.test(filePath)
const isPosixAbs = (filePath: string): boolean => filePath.startsWith('/')

/** Absolute local path (drive or posix). UNC and device paths are NOT accepted. */
export function isAbsoluteLocalPath(filePath: string): boolean {
  if (typeof filePath !== 'string' || !filePath.trim()) return false
  return isWindowsDriveAbs(filePath) || (isPosixAbs(filePath) && !filePath.startsWith('//'))
}

/**
 * Normalize for allowlist / root comparison on Windows-insensitive filesystems:
 * backslashes, strip trailing separators, lowercase.
 */
export function normalizePreviewPathKey(filePath: string): string {
  let value = filePath.replace(/\//g, '\\')
  // Strip \\?\ long-path prefix for comparison (keep drive form).
  if (value.startsWith('\\\\?\\')) value = value.slice(4)
  // Collapse duplicate separators (but keep drive root C:\).
  value = value.replace(/\\{2,}/g, '\\')
  value = value.replace(/[\\/]+$/, '')
  return value.toLowerCase()
}

export function extensionOf(filePath: string): string {
  const base = filePath.replace(/\//g, '\\').split('\\').pop() ?? ''
  // Strip ADS stream name if present after extension: file.png:Zone.Identifier
  const noAds = base.includes(':') ? base.slice(0, base.indexOf(':')) : base
  const dot = noAds.lastIndexOf('.')
  if (dot <= 0) return ''
  return noAds.slice(dot).toLowerCase()
}

export function basenameOf(filePath: string): string {
  const base = filePath.replace(/\//g, '\\').split('\\').pop() ?? filePath
  return base.includes(':') && !/^[a-zA-Z]:$/.test(base) ? base.slice(0, base.indexOf(':')) : base
}

export function kindFromPath(filePath: string): Exclude<PreviewKind, 'remote-image'> | null {
  const ext = extensionOf(filePath)
  if (!ext) return null
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (HTML_EXTS.has(ext)) return 'html'
  if (CODE_EXTS.has(ext)) return 'code'
  return null
}

export function mimeForPreviewPath(filePath: string): string | null {
  const ext = extensionOf(filePath)
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.jsx': 'text/javascript',
    '.py': 'text/x-python',
    '.rs': 'text/x-rust',
    '.xml': 'application/xml',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml'
  }
  return map[ext] ?? (kindFromPath(filePath) === 'code' ? 'text/plain' : null)
}

export function isPreviewableExtension(filePath: string): boolean {
  return kindFromPath(filePath) !== null
}

/** Windows reserved device names as a path segment (CON, NUL, …). */
function hasReservedSegment(normalized: string): boolean {
  const parts = normalized.split('\\').filter(Boolean)
  for (const part of parts) {
    const stem = part.includes('.') ? part.slice(0, part.indexOf('.')) : part
    if (RESERVED_NAMES.has(stem.toUpperCase())) return true
  }
  return false
}

/** NTFS alternate data stream: extra colon after drive letter. */
function hasAlternateDataStream(filePath: string): boolean {
  const normalized = filePath.replace(/\//g, '\\')
  if (isWindowsDriveAbs(normalized)) {
    // Drive colon at index 1 is fine; any later colon is ADS or device noise.
    return normalized.indexOf(':', 2) !== -1
  }
  // Non-drive absolute: any colon is suspicious on Windows-oriented policy.
  return normalized.includes(':')
}

function hasTrailingDotOrSpaceSegment(normalized: string): boolean {
  const parts = normalized.split('\\').filter(Boolean)
  return parts.some((part) => /[. ]$/.test(part))
}

/**
 * String-level path rejection. Returns a Chinese reason or null if acceptable.
 * Does not check existence or root membership.
 */
export function rejectUnsafePreviewPath(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || !filePath.trim()) return '無效的檔案路徑'
  const raw = filePath.trim()

  // UNC shares
  if (raw.startsWith('\\\\') || raw.startsWith('//')) {
    if (raw.startsWith('\\\\?\\') || raw.startsWith('//?/')) {
      // Long-path prefix is OK only when followed by a drive letter.
      const rest = raw.replace(/^[/\\]{2}\?[/\\]/, '')
      if (!/^[a-zA-Z]:[/\\]/.test(rest)) return '不支援的裝置或 UNC 路徑'
    } else if (/^[/\\]{2}\.[/\\]/.test(raw)) {
      return '不支援的裝置路徑'
    } else {
      return '不支援 UNC 網路路徑'
    }
  }

  // Device namespace without long-path form already handled
  if (/^\\\\\.\\/.test(raw) || /^\/\/\.\//.test(raw)) return '不支援的裝置路徑'

  if (!isAbsoluteLocalPath(raw) && !raw.startsWith('\\\\?\\') && !raw.startsWith('//?/')) {
    return '僅允許本機絕對路徑'
  }

  // After stripping long-path prefix for remaining checks
  let check = raw
  if (check.startsWith('\\\\?\\')) check = check.slice(4)
  if (check.startsWith('//?/')) check = check.slice(4)

  if (!isAbsoluteLocalPath(check)) return '僅允許本機絕對路徑'

  // Path traversal markers (even if absolute)
  if (/(^|[\\/])\.\.([\\/]|$)/.test(check)) return '路徑含有非法的上層目錄參照'

  if (hasAlternateDataStream(check)) return '不支援 NTFS 替代資料流路徑'

  const key = normalizePreviewPathKey(check)
  if (hasReservedSegment(key)) return '路徑含有系統保留名稱'
  if (hasTrailingDotOrSpaceSegment(key)) return '路徑區段不可以點或空白結尾'

  if (!isPreviewableExtension(check)) return '此格式暫不支援預覽'

  return null
}

/**
 * Whether `filePath` is equal to or nested under any allowlisted root.
 * Both sides are compared with normalizePreviewPathKey (case-insensitive).
 */
export function isPathInsideRoots(filePath: string, roots: readonly string[]): boolean {
  const key = normalizePreviewPathKey(filePath)
  for (const root of roots) {
    if (typeof root !== 'string' || !root.trim()) continue
    const rootKey = normalizePreviewPathKey(root)
    if (!rootKey) continue
    if (key === rootKey) return true
    if (key.startsWith(rootKey.endsWith('\\') ? rootKey : `${rootKey}\\`)) return true
  }
  return false
}

/** Build protocol URL for a validated absolute path. */
export function toGrokPreviewUrl(absolutePath: string): string {
  // Host "local", single path segment = encodeURIComponent(full path)
  return `grok-preview://local/${encodeURIComponent(absolutePath)}`
}

/** Extract absolute path from grok-preview:// URL; null if malformed. */
export function fromGrokPreviewUrl(url: string): string | null {
  if (typeof url !== 'string' || !url.trim()) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'grok-preview:') return null
    // Accept host "local" with pathname /encoded or host empty with path.
    const host = parsed.hostname || parsed.host
    if (host && host !== 'local') {
      // Some URL parsers put the first segment in hostname when opaque.
    }
    let encoded = ''
    if (parsed.pathname && parsed.pathname !== '/') {
      encoded = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname
    } else if (host && host !== 'local') {
      encoded = host
    }
    // Electron may pass grok-preview://local/C%3A%5C...
    if (!encoded && url.includes('local/')) {
      encoded = url.slice(url.indexOf('local/') + 'local/'.length).split(/[?#]/)[0] ?? ''
    }
    if (!encoded) return null
    const decoded = decodeURIComponent(encoded)
    return decoded || null
  } catch {
    // Fallback for non-standard URL parsing of custom schemes
    const match = /^grok-preview:\/\/local\/(.+?)(?:[?#]|$)/i.exec(url)
    if (!match?.[1]) return null
    try {
      return decodeURIComponent(match[1])
    } catch {
      return null
    }
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function maxBytesForKind(
  kind: Exclude<PreviewKind, 'remote-image'>,
  maxImageMb: number,
  maxVideoMb: number
): number {
  if (kind === 'image') return Math.max(1, maxImageMb) * 1024 * 1024
  if (kind === 'video') return Math.max(1, maxVideoMb) * 1024 * 1024
  // code/html use code read cap (caller may pass PREVIEW_CODE_READ_MAX_BYTES)
  return 400 * 1024
}
