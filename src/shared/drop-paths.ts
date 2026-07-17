/** Drop / path-chip helpers (P-DRAG contract). */

export type LocalPathKind = 'file' | 'directory' | 'other' | 'missing'

export type LocalPathStat = {
  path: string
  kind: LocalPathKind
  size?: number
}

export type PathChip = {
  path: string
  previewUrl?: string
  isDirectory?: boolean
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i

export function isImageMime(mime: string | undefined | null): boolean {
  return Boolean(mime && mime.startsWith('image/'))
}

export function isImagePath(filePath: string): boolean {
  return IMAGE_EXT.test(filePath)
}

export function isAbsoluteLocalPath(value: string): boolean {
  const text = value.trim()
  if (!text) return false
  // Windows drive or UNC; POSIX absolute
  return /^[a-zA-Z]:[\\/]/.test(text) || text.startsWith('\\\\') || text.startsWith('/')
}

/** Append absolute path lines to a composer draft (one path per line). */
export function appendPathLines(draft: string, paths: readonly string[]): string {
  const lines = paths.map((item) => item.trim()).filter(Boolean)
  if (!lines.length) return draft
  const base = draft.replace(/\s+$/, '')
  return base ? `${base}\n${lines.join('\n')}` : lines.join('\n')
}

/**
 * P-DRAG-4: when image blocks are also sent, drop matching path lines from the text draft
 * so the model does not receive the same file twice.
 */
export function stripDuplicateImagePathLines(draft: string, imagePaths: readonly string[]): string {
  if (!imagePaths.length) return draft
  const set = new Set(imagePaths.map((item) => item.trim()).filter(Boolean))
  if (!set.size) return draft
  return draft
    .split('\n')
    .filter((line) => !set.has(line.trim()))
    .join('\n')
}

/** Remove one absolute path line from the draft (chip dismiss). */
export function removePathLine(draft: string, filePath: string): string {
  const target = filePath.trim()
  if (!target) return draft
  return draft
    .split('\n')
    .filter((line) => line !== target && line.trim() !== target)
    .join('\n')
}

/** Merge path chips by absolute path (last write wins for preview/dir flags). */
export function upsertPathChips(existing: readonly PathChip[], next: readonly PathChip[]): PathChip[] {
  const map = new Map<string, PathChip>()
  for (const chip of existing) map.set(chip.path, chip)
  for (const chip of next) {
    const prev = map.get(chip.path)
    if (prev?.previewUrl?.startsWith('blob:') && chip.previewUrl && chip.previewUrl !== prev.previewUrl) {
      try { URL.revokeObjectURL(prev.previewUrl) } catch { /* ignore */ }
    }
    map.set(chip.path, { ...prev, ...chip })
  }
  return [...map.values()]
}

export function revokePathChipUrls(chips: readonly PathChip[]): void {
  for (const chip of chips) {
    if (chip.previewUrl?.startsWith('blob:')) {
      try { URL.revokeObjectURL(chip.previewUrl) } catch { /* ignore */ }
    }
  }
}
