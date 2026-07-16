/** Max clipboard paste image payload size (matches attachment image limit). */
export const PASTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024

/** Directory name under os.tmpdir() for paste fallback images. */
export const PASTE_IMAGE_DIR_NAME = 'grok-build-gui-paste'

/** Delete paste files older than this age during cleanup (7 days). */
export const PASTE_IMAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const EXT_FOR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

/** Map a clipboard/image mime type to a file extension, or null if unsupported. */
export function extensionForImageMime(mimeType: string): string | null {
  const key = mimeType.trim().toLowerCase()
  return EXT_FOR_MIME[key] ?? null
}

/** Strip accidental data-URL prefix. */
export function stripDataUrlBase64(data: string): string {
  return data.includes(',') ? data.slice(data.indexOf(',') + 1) : data
}

/**
 * Estimate decoded byte length of a base64 string without allocating the buffer.
 * Used as a pre-decode size gate so huge pastes fail before Buffer.from.
 */
export function estimateDecodedBase64Bytes(base64: string): number {
  const cleaned = base64.replace(/\s+/g, '')
  if (!cleaned.length) return 0
  // Reject obvious non-base64 early (estimate would still be large).
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return Number.POSITIVE_INFINITY
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0
  return Math.floor((cleaned.length * 3) / 4) - padding
}

/** Max base64 character length that can encode `maxBytes` (with small padding margin). */
export function maxBase64CharsForByteLimit(maxBytes: number): number {
  return Math.ceil(maxBytes / 3) * 4 + 8
}

export type PreparedPasteImage = {
  ext: string
  /** Whitespace-stripped base64 without data-URL prefix. */
  rawBase64: string
  estimatedBytes: number
}

/**
 * Validate mime + base64 and apply pre-decode size gate.
 * Does not allocate the decoded buffer.
 */
export function preparePasteImagePayload(mimeType: string, data: string, maxBytes = PASTE_IMAGE_MAX_BYTES): PreparedPasteImage {
  if (typeof mimeType !== 'string' || typeof data !== 'string') throw new Error('無效的貼圖資料')
  const ext = extensionForImageMime(mimeType)
  if (!ext) throw new Error(`不支援的圖片格式：${mimeType}`)
  const rawBase64 = stripDataUrlBase64(data).replace(/\s+/g, '')
  if (!rawBase64.length) throw new Error('貼圖資料為空')
  if (rawBase64.length > maxBase64CharsForByteLimit(maxBytes)) {
    throw new Error('貼圖超過 20MB 上限')
  }
  const estimatedBytes = estimateDecodedBase64Bytes(rawBase64)
  if (!Number.isFinite(estimatedBytes)) throw new Error('貼圖資料解碼失敗')
  if (estimatedBytes <= 0) throw new Error('貼圖資料為空')
  if (estimatedBytes > maxBytes) throw new Error('貼圖超過 20MB 上限')
  return { ext, rawBase64, estimatedBytes }
}

/** Optional light magic-byte check after decode (best-effort; WebP/GIF variants may still pass via mime). */
export function looksLikeImageBuffer(buffer: Uint8Array, ext: string): boolean {
  if (buffer.length < 12) return false
  if (ext === 'png') return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  if (ext === 'jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (ext === 'gif') return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46
  if (ext === 'webp') {
    return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  }
  return true
}

export type PasteFileEntry = { name: string; mtimeMs: number }

/**
 * Decide which paste filenames to delete (pure). Only `paste-*.{png,jpeg,webp,gif}`.
 */
export function selectPasteFilesToDelete(
  entries: PasteFileEntry[],
  nowMs: number,
  maxAgeMs = PASTE_IMAGE_MAX_AGE_MS
): string[] {
  const pasteName = /^paste-.+\.(png|jpeg|webp|gif)$/i
  return entries
    .filter((entry) => pasteName.test(entry.name) && nowMs - entry.mtimeMs > maxAgeMs)
    .map((entry) => entry.name)
}

export type SavePasteImageRequest = {
  mimeType: string
  /** Raw base64 (no data: URL prefix). */
  data: string
}

export type SavePasteImageResult = {
  path: string
}
