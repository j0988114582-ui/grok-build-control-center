/**
 * In-memory allowlist of absolute paths from successful exports in this process.
 * Reveal IPC must only accept paths registered here (no arbitrary filesystem reveal).
 * Pure string helpers — no node: imports (shared is used by web tsconfig too).
 */

const isAbsolutePath = (filePath: string): boolean =>
  filePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\')

/** Normalize separators and strip trailing slashes for allowlist keys. */
export function normalizeExportPathKey(filePath: string): string {
  return filePath.replace(/\//g, '\\').replace(/[\\/]+$/, '')
}

export class ExportPathAllowlist {
  private readonly paths = new Set<string>()

  register(filePath: string): string {
    const key = normalizeExportPathKey(filePath)
    this.paths.add(key)
    return key
  }

  has(filePath: string): boolean {
    return this.paths.has(normalizeExportPathKey(filePath))
  }

  clear(): void {
    this.paths.clear()
  }

  get size(): number {
    return this.paths.size
  }
}

export function assertRevealAllowed(allowlist: ExportPathAllowlist, filePath: unknown): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('無效的匯出路徑')
  }
  if (!isAbsolutePath(filePath)) {
    throw new Error('僅允許絕對路徑')
  }
  const key = normalizeExportPathKey(filePath)
  if (!allowlist.has(key)) {
    throw new Error('只能開啟本次成功匯出的檔案')
  }
  return key
}
