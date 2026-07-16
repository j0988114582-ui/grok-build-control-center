/** Max clipboard paste image payload size (matches attachment image limit). */
export const PASTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024

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

export type SavePasteImageRequest = {
  mimeType: string
  /** Raw base64 (no data: URL prefix). */
  data: string
}

export type SavePasteImageResult = {
  path: string
}
