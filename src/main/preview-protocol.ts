/**
 * grok-preview:// custom protocol — serves registered media with Range support.
 * registerSchemesAsPrivileged MUST run before app.whenReady() (module top-level).
 */

import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import {
  fromGrokPreviewUrl,
  mimeForPreviewPath,
  normalizePreviewPathKey,
  rejectUnsafePreviewPath,
  toGrokPreviewUrl
} from '../shared/preview-path-policy'
import type { PreviewKind } from '../shared/preview-types'

export const GROK_PREVIEW_SCHEME = 'grok-preview'

/** In-memory allowlist of absolute paths registered this process lifetime. */
export class PreviewMediaAllowlist {
  private readonly paths = new Map<string, { path: string; kind: Exclude<PreviewKind, 'remote-image'> }>()

  register(filePath: string, kind: Exclude<PreviewKind, 'remote-image'>): string {
    const key = normalizePreviewPathKey(filePath)
    this.paths.set(key, { path: filePath, kind })
    return toGrokPreviewUrl(filePath)
  }

  get(filePath: string): { path: string; kind: Exclude<PreviewKind, 'remote-image'> } | null {
    return this.paths.get(normalizePreviewPathKey(filePath)) ?? null
  }

  has(filePath: string): boolean {
    return this.paths.has(normalizePreviewPathKey(filePath))
  }

  clear(): void {
    this.paths.clear()
  }

  get size(): number {
    return this.paths.size
  }
}

/** Call at module load — before app.whenReady(). */
export function registerGrokPreviewSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: GROK_PREVIEW_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
      corsEnabled: false
    }
  }])
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match) return null
  const startStr = match[1]
  const endStr = match[2]
  let start = startStr ? Number(startStr) : NaN
  let end = endStr ? Number(endStr) : NaN
  if (!startStr && endStr) {
    // suffix bytes: bytes=-500
    const suffix = Number(endStr)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    if (!Number.isFinite(start)) start = 0
    if (!Number.isFinite(end) || endStr === '') end = size - 1
  }
  if (start < 0 || end < start || start >= size) return null
  end = Math.min(end, size - 1)
  return { start, end }
}

async function fileResponse(
  filePath: string,
  request: Request
): Promise<Response> {
  const info = await stat(filePath)
  if (!info.isFile()) {
    return new Response('Not a file', { status: 404 })
  }
  const size = info.size
  const mime = mimeForPreviewPath(filePath) ?? 'application/octet-stream'
  const rangeHeader = request.headers.get('range') ?? request.headers.get('Range')
  const range = parseRange(rangeHeader, size)

  if (range) {
    const { start, end } = range
    const chunkSize = end - start + 1
    const handle = await open(filePath, 'r')
    try {
      const buffer = Buffer.alloc(chunkSize)
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, start)
      const body = buffer.subarray(0, bytesRead)
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(bytesRead),
          'Content-Range': `bytes ${start}-${start + bytesRead - 1}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store'
        }
      })
    } finally {
      await handle.close()
    }
  }

  // Full body via stream for large files (video)
  if (size > 4 * 1024 * 1024) {
    const nodeStream = createReadStream(filePath)
    const webStream = Readable.toWeb(nodeStream) as ReadableStream
    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store'
      }
    })
  }

  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await handle.read(buffer, 0, size, 0)
    return new Response(buffer.subarray(0, bytesRead), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytesRead),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store'
      }
    })
  } finally {
    await handle.close()
  }
}

/**
 * Install protocol handler. Must run after app.whenReady().
 * Re-validates allowlist + path policy on every request (TOCTOU defense).
 */
export function installGrokPreviewProtocol(allowlist: PreviewMediaAllowlist): void {
  protocol.handle(GROK_PREVIEW_SCHEME, async (request) => {
    try {
      const filePath = fromGrokPreviewUrl(request.url)
      if (!filePath) {
        return new Response('Invalid preview URL', { status: 400 })
      }
      const unsafe = rejectUnsafePreviewPath(filePath)
      if (unsafe) {
        return new Response(unsafe, { status: 403 })
      }
      const entry = allowlist.get(filePath)
      if (!entry) {
        return new Response('路徑未註冊預覽', { status: 403 })
      }
      // Serve-time existence check
      try {
        await stat(entry.path)
      } catch {
        return new Response('找不到檔案，可能已被移動或刪除', { status: 404 })
      }
      return await fileResponse(entry.path, request)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return new Response(message, { status: 500 })
    }
  })
}
