/**
 * Preview Dock main-process service: root allowlist + stat / register / read-text.
 */

import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { PASTE_IMAGE_DIR_NAME } from '../shared/paste-image'
import {
  isPathInsideRoots,
  kindFromPath,
  mimeForPreviewPath,
  normalizePreviewPathKey,
  rejectUnsafePreviewPath
} from '../shared/preview-path-policy'
import {
  PREVIEW_BASE64_IMAGE_MAX_BYTES,
  PREVIEW_CODE_READ_MAX_BYTES,
  PREVIEW_DEFAULT_MAX_IMAGE_MB,
  PREVIEW_DEFAULT_MAX_VIDEO_MB,
  type PreviewKind,
  type PreviewReadTextResult,
  type PreviewRegisterResult,
  type PreviewStatResult
} from '../shared/preview-types'
import type { PreviewMediaAllowlist } from './preview-protocol'

export class PreviewRootTracker {
  private readonly sessionCwds = new Map<string, string>()
  private readonly dialogPaths = new Set<string>()

  setSessionCwd(sessionId: string, cwd: string): void {
    if (typeof sessionId !== 'string' || !sessionId.trim()) return
    if (typeof cwd !== 'string' || !cwd.trim()) return
    this.sessionCwds.set(sessionId, cwd)
  }

  removeSession(sessionId: string): void {
    this.sessionCwds.delete(sessionId)
  }

  /** Register a user-selected file or its parent directory as an allowed root. */
  addDialogPath(filePath: string): void {
    if (typeof filePath !== 'string' || !filePath.trim()) return
    this.dialogPaths.add(normalizePreviewPathKey(filePath))
    // Also allow sibling access within the same parent (dialog folder scope).
    const parent = path.dirname(filePath)
    if (parent && parent !== filePath) this.dialogPaths.add(normalizePreviewPathKey(parent))
  }

  pasteRoot(): string {
    return path.join(tmpdir(), PASTE_IMAGE_DIR_NAME)
  }

  listRoots(): string[] {
    const roots = [this.pasteRoot(), ...this.sessionCwds.values()]
    for (const key of this.dialogPaths) {
      // dialogPaths stores normalized keys; keep as-is for comparison
      roots.push(key)
    }
    return roots
  }

  /** Roots for isPathInsideRoots — dialog entries are already normalized keys. */
  rootsForCompare(): string[] {
    return this.listRoots()
  }
}

async function resolveRealPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath)
  } catch {
    // File may not exist yet / dangling — fall back to normalized absolute
    return path.resolve(filePath)
  }
}

export type PreviewLimits = {
  maxImageMb?: number
  maxVideoMb?: number
}

function maxBytesFor(
  kind: Exclude<PreviewKind, 'remote-image'>,
  limits: PreviewLimits
): number {
  if (kind === 'image') return Math.max(1, limits.maxImageMb ?? PREVIEW_DEFAULT_MAX_IMAGE_MB) * 1024 * 1024
  if (kind === 'video') return Math.max(1, limits.maxVideoMb ?? PREVIEW_DEFAULT_MAX_VIDEO_MB) * 1024 * 1024
  return PREVIEW_CODE_READ_MAX_BYTES
}

export async function previewStat(
  filePath: unknown,
  roots: PreviewRootTracker,
  limits: PreviewLimits = {}
): Promise<PreviewStatResult> {
  const unsafe = rejectUnsafePreviewPath(filePath)
  if (unsafe) return { ok: false, reason: unsafe }
  const raw = String(filePath).trim()

  let real: string
  try {
    real = await resolveRealPath(raw)
  } catch {
    return { ok: false, reason: '找不到檔案，可能已被移動或刪除' }
  }

  // Re-check after realpath (symlink escape)
  const unsafeReal = rejectUnsafePreviewPath(real)
  if (unsafeReal) return { ok: false, reason: unsafeReal }

  if (!isPathInsideRoots(real, roots.rootsForCompare()) && !isPathInsideRoots(raw, roots.rootsForCompare())) {
    return { ok: false, reason: '路徑在允許的工作區外，僅能在檔案總管開啟' }
  }

  const kind = kindFromPath(real)
  if (!kind) return { ok: false, reason: '此格式暫不支援預覽' }

  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(real)
  } catch {
    return { ok: false, reason: '找不到檔案，可能已被移動或刪除' }
  }
  if (!info.isFile()) return { ok: false, reason: '此路徑不是檔案' }

  const maxBytes = maxBytesFor(kind, limits)
  const tooLarge = info.size > maxBytes
  const mimeType = mimeForPreviewPath(real) ?? 'application/octet-stream'
  let loadVia: 'base64' | 'protocol' | 'text' = 'text'
  if (kind === 'image') {
    loadVia = info.size <= PREVIEW_BASE64_IMAGE_MAX_BYTES ? 'base64' : 'protocol'
  } else if (kind === 'video') {
    loadVia = 'protocol'
  }

  return {
    ok: true,
    path: real,
    kind,
    sizeBytes: info.size,
    mtimeMs: info.mtimeMs,
    mimeType,
    loadVia,
    tooLarge,
    maxBytes
  }
}

export async function previewRegister(
  filePath: unknown,
  roots: PreviewRootTracker,
  allowlist: PreviewMediaAllowlist,
  limits: PreviewLimits = {}
): Promise<PreviewRegisterResult> {
  const st = await previewStat(filePath, roots, limits)
  if (!st.ok) {
    return {
      ok: false,
      reason: st.reason,
      revealOnly: st.reason.includes('工作區外')
    }
  }
  if (st.tooLarge) {
    const mb = Math.round(st.maxBytes / (1024 * 1024))
    return {
      ok: false,
      reason: `檔案過大（上限 ${mb}MB），請用系統程式開啟`
    }
  }

  if (st.loadVia === 'protocol') {
    const protocolUrl = allowlist.register(st.path, st.kind)
    return {
      ok: true,
      path: st.path,
      kind: st.kind,
      sizeBytes: st.sizeBytes,
      mtimeMs: st.mtimeMs,
      mimeType: st.mimeType,
      protocolUrl,
      loadVia: 'protocol'
    }
  }

  if (st.loadVia === 'base64' && st.kind === 'image') {
    try {
      const buffer = await readFile(st.path)
      if (buffer.length > PREVIEW_BASE64_IMAGE_MAX_BYTES) {
        const protocolUrl = allowlist.register(st.path, st.kind)
        return {
          ok: true,
          path: st.path,
          kind: st.kind,
          sizeBytes: st.sizeBytes,
          mtimeMs: st.mtimeMs,
          mimeType: st.mimeType,
          protocolUrl,
          loadVia: 'protocol'
        }
      }
      const base64DataUrl = `data:${st.mimeType};base64,${buffer.toString('base64')}`
      // Still register for consistency / open-in-folder
      allowlist.register(st.path, st.kind)
      return {
        ok: true,
        path: st.path,
        kind: st.kind,
        sizeBytes: st.sizeBytes,
        mtimeMs: st.mtimeMs,
        mimeType: st.mimeType,
        base64DataUrl,
        loadVia: 'base64'
      }
    } catch {
      return { ok: false, reason: '讀取圖片失敗' }
    }
  }

  // text kinds: register path so protocol/open works if needed
  allowlist.register(st.path, st.kind)
  return {
    ok: true,
    path: st.path,
    kind: st.kind,
    sizeBytes: st.sizeBytes,
    mtimeMs: st.mtimeMs,
    mimeType: st.mimeType,
    loadVia: 'text'
  }
}

export async function previewReadText(
  filePath: unknown,
  roots: PreviewRootTracker,
  limits: PreviewLimits = {}
): Promise<PreviewReadTextResult> {
  const st = await previewStat(filePath, roots, limits)
  if (!st.ok) return { ok: false, reason: st.reason }
  if (st.kind !== 'html' && st.kind !== 'code') {
    return { ok: false, reason: '此檔案不是文字／HTML 預覽類型' }
  }
  if (st.sizeBytes > PREVIEW_CODE_READ_MAX_BYTES) {
    // Read truncated prefix
    try {
      const buffer = await readFile(st.path)
      const slice = buffer.subarray(0, PREVIEW_CODE_READ_MAX_BYTES)
      return {
        ok: true,
        path: st.path,
        text: slice.toString('utf8'),
        truncated: true,
        sizeBytes: st.sizeBytes,
        kind: st.kind
      }
    } catch {
      return { ok: false, reason: '讀取檔案失敗' }
    }
  }
  try {
    const text = await readFile(st.path, 'utf8')
    return {
      ok: true,
      path: st.path,
      text,
      truncated: false,
      sizeBytes: st.sizeBytes,
      kind: st.kind
    }
  } catch {
    return { ok: false, reason: '讀取檔案失敗' }
  }
}
