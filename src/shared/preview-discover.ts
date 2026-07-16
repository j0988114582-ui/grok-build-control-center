/**
 * Pure discovery of preview candidates from message / tool text.
 * Scan only on complete messages (caller debounce); no filesystem I/O.
 */

import {
  PREVIEW_MAX_ITEMS_PER_SESSION,
  type PreviewItem,
  type PreviewKind,
  type PreviewSource
} from './preview-types'
import { basenameOf, extensionOf, isAbsoluteLocalPath, kindFromPath, normalizePreviewPathKey } from './preview-path-policy'

export type DiscoverOptions = {
  sessionId: string
  cwd?: string
  nowMs?: number
  /** Existing items for merge/dedup. */
  existing?: PreviewItem[]
  maxItems?: number
}

// Disallow whitespace inside path matches so prose after a path does not get swallowed.
const WIN_PATH_RE = /(?<![A-Za-z0-9_])([A-Za-z]:\\(?:[^<>:"|?*\r\n\s]+\\)*[^<>:"|?*\r\n\s\\]+)/g
const POSIX_PATH_RE = /(?<![A-Za-z0-9_])(\/(?:[\w.-]+\/)+[\w.-]+)/g
const MD_IMAGE_RE = /!\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g
const FENCE_RE = /```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g
const HTTP_IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)(\?[^#\s]*)?(#\S*)?$/i

function simpleHash(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

function shortRelative(cwd: string | undefined, absPath: string): string | undefined {
  if (!cwd) return undefined
  const root = normalizePreviewPathKey(cwd)
  const key = normalizePreviewPathKey(absPath)
  if (key === root) return basenameOf(absPath)
  if (key.startsWith(`${root}\\`)) return absPath.slice(cwd.length).replace(/^[\\/]+/, '')
  return undefined
}

function resolveMaybeRelative(cwd: string | undefined, candidate: string): string | null {
  const trimmed = candidate.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return null
  if (isAbsoluteLocalPath(trimmed)) return trimmed
  // Relative with backslashes or forward slashes under cwd
  if (cwd && !trimmed.includes('://') && !trimmed.startsWith('//') && !trimmed.startsWith('\\\\')) {
    if (/^[A-Za-z]:/.test(trimmed)) return null
    const joined = `${cwd.replace(/[\\/]+$/, '')}\\${trimmed.replace(/\//g, '\\').replace(/^[\\/]+/, '')}`
    if (isAbsoluteLocalPath(joined)) return joined
  }
  return null
}

function itemId(kind: PreviewKind, source: PreviewSource): string {
  if (source.type === 'file') return `file:${normalizePreviewPathKey(source.path)}`
  if (source.type === 'remote-url') return `remote:${source.url}`
  return `code:${source.hash}:${source.language ?? ''}`
}

function pushUnique(
  map: Map<string, PreviewItem>,
  item: PreviewItem
): void {
  const existing = map.get(item.id)
  if (existing) {
    // Keep newest discovery time
    if (item.discoveredAt >= existing.discoveredAt) map.set(item.id, { ...existing, ...item, id: existing.id })
    return
  }
  map.set(item.id, item)
}

/** Extract fenced code blocks as inline-code preview candidates. */
export function discoverCodeFences(
  text: string,
  sessionId: string,
  nowMs = Date.now()
): PreviewItem[] {
  const items: PreviewItem[] = []
  FENCE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FENCE_RE.exec(text)) !== null) {
    const language = (match[1] || '').trim() || undefined
    const content = match[2] ?? ''
    if (!content.trim()) continue
    // Skip tiny fences (e.g. single-word) unless language-tagged
    if (!language && content.trim().length < 40) continue
    const hash = simpleHash(content.slice(0, 8000))
    const source: PreviewSource = { type: 'inline-code', language, content, hash }
    items.push({
      id: itemId('code', source),
      kind: 'code',
      source,
      label: language ? `${language} 程式碼` : '程式碼區塊',
      discoveredAt: nowMs,
      sessionId,
      sizeBytes: content.length
    })
  }
  return items
}

/** Extract markdown images — local paths become file items; http(s) become remote-image list-only. */
export function discoverMarkdownImages(
  text: string,
  sessionId: string,
  cwd?: string,
  nowMs = Date.now()
): PreviewItem[] {
  const items: PreviewItem[] = []
  MD_IMAGE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MD_IMAGE_RE.exec(text)) !== null) {
    const src = (match[1] ?? '').trim()
    if (!src) continue
    if (/^https?:\/\//i.test(src)) {
      if (!HTTP_IMAGE_EXT.test(src.split('?')[0] ?? src)) continue
      const source: PreviewSource = { type: 'remote-url', url: src }
      items.push({
        id: itemId('remote-image', source),
        kind: 'remote-image',
        source,
        label: src.split('/').pop()?.split('?')[0] || '遠端圖片',
        discoveredAt: nowMs,
        sessionId
      })
      continue
    }
    const resolved = resolveMaybeRelative(cwd, src)
    if (!resolved) continue
    const kind = kindFromPath(resolved)
    if (kind !== 'image' && kind !== 'html' && kind !== 'video' && kind !== 'code') continue
    const source: PreviewSource = { type: 'file', path: resolved }
    items.push({
      id: itemId(kind, source),
      kind,
      source,
      label: basenameOf(resolved),
      shortPath: shortRelative(cwd, resolved),
      discoveredAt: nowMs,
      sessionId
    })
  }
  return items
}

/** Extract absolute (and cwd-relative) file paths that look previewable. */
export function discoverFilePaths(
  text: string,
  sessionId: string,
  cwd?: string,
  nowMs = Date.now()
): PreviewItem[] {
  const items: PreviewItem[] = []
  const seen = new Set<string>()

  const consider = (raw: string): void => {
    const cleaned = raw.replace(/[),.;:]+$/, '').replace(/^["'`([{]+/, '').replace(/["'`)\]}]+$/, '')
    const resolved = resolveMaybeRelative(cwd, cleaned) ?? (isAbsoluteLocalPath(cleaned) ? cleaned : null)
    if (!resolved) return
    const kind = kindFromPath(resolved)
    if (!kind) return
    const key = normalizePreviewPathKey(resolved)
    if (seen.has(key)) return
    seen.add(key)
    const source: PreviewSource = { type: 'file', path: resolved }
    items.push({
      id: itemId(kind, source),
      kind,
      source,
      label: basenameOf(resolved),
      shortPath: shortRelative(cwd, resolved),
      discoveredAt: nowMs,
      sessionId
    })
  }

  WIN_PATH_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WIN_PATH_RE.exec(text)) !== null) consider(match[1] ?? '')

  POSIX_PATH_RE.lastIndex = 0
  while ((match = POSIX_PATH_RE.exec(text)) !== null) consider(match[1] ?? '')

  // Bare relative paths with previewable extensions (under cwd)
  if (cwd) {
    const relRe = /(?<![A-Za-z0-9_./\\])((?:[\w.-]+[\\/])+[\w.-]+\.[A-Za-z0-9]+)/g
    while ((match = relRe.exec(text)) !== null) consider(match[1] ?? '')
  }

  return items
}

/**
 * Discover all preview candidates from completed message/tool text.
 * Merges with existing, dedupes, caps at maxItems (default 50), newest first.
 */
export function discoverPreviewCandidates(text: string, options: DiscoverOptions): PreviewItem[] {
  const nowMs = options.nowMs ?? Date.now()
  const maxItems = options.maxItems ?? PREVIEW_MAX_ITEMS_PER_SESSION
  const map = new Map<string, PreviewItem>()

  for (const item of options.existing ?? []) {
    map.set(item.id, item)
  }

  for (const item of discoverFilePaths(text, options.sessionId, options.cwd, nowMs)) {
    pushUnique(map, item)
  }
  for (const item of discoverMarkdownImages(text, options.sessionId, options.cwd, nowMs)) {
    pushUnique(map, item)
  }
  for (const item of discoverCodeFences(text, options.sessionId, nowMs)) {
    pushUnique(map, item)
  }

  return [...map.values()]
    .sort((a, b) => b.discoveredAt - a.discoveredAt)
    .slice(0, maxItems)
}

/** True if extension or remote URL looks like media (for auto-preview-latest). */
export function isMediaPreviewItem(item: PreviewItem): boolean {
  return item.kind === 'image' || item.kind === 'video' || item.kind === 'remote-image'
}

/** Helper for UI: language from file path for code view. */
export function languageHintFromPath(filePath: string): string | undefined {
  const ext = extensionOf(filePath).replace(/^\./, '')
  if (!ext) return undefined
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    mjs: 'javascript', cjs: 'javascript', py: 'python', rs: 'rust',
    md: 'markdown', json: 'json', css: 'css', html: 'html', htm: 'html',
    sh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml', xml: 'xml'
  }
  return map[ext] ?? ext
}
