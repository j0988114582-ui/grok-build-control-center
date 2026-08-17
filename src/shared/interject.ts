/**
 * ACP interject extension helpers.
 * Wire method uses underscore prefix like billing: `_x.ai/interject`.
 * Official router matches `x.ai/interject`; clients must call the underscored form.
 */

export const INTERJECT_METHOD = '_x.ai/interject' as const

export type InterjectParams = {
  sessionId: string
  text: string
  interjectionId?: string
  content?: unknown[]
}

export type InterjectResult = {
  status: 'queued'
}

export type InterjectUiState =
  | { status: 'queued'; sessionId: string; text: string }
  | null

/** Status copy when the server accepted the interjection into the buffer. */
export const INTERJECT_QUEUED_NOTICE = '已排入，下一個安全點生效'

/** Shown when the CLI does not expose interject; never fall back to cancel. */
export const INTERJECT_UNSUPPORTED_NOTICE =
  '目前 Grok CLI 不支援插話（_x.ai/interject）。請更新 CLI，或使用「立刻改做」中斷後重送。'

/** Transcript rail label for an optimistic / official interjection echo. */
export const INTERJECT_MESSAGE_LABEL = 'YOU · 插話'

export function formatUserMessageLabel(origin?: string): string {
  return origin === 'interject' ? INTERJECT_MESSAGE_LABEL : '你'
}

export function buildInterjectParams(
  sessionId: string,
  text: string,
  options?: { interjectionId?: string; content?: unknown[] }
): InterjectParams {
  const trimmed = text.trim()
  if (!sessionId) throw new Error('sessionId is required')
  if (!trimmed) throw new Error('插話內容不可為空')
  return {
    sessionId,
    text: trimmed,
    ...(options?.interjectionId ? { interjectionId: options.interjectionId } : {}),
    ...(options?.content !== undefined ? { content: options.content } : {})
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readErrorMessage(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  return undefined
}

function readStatus(record: Record<string, unknown> | null): unknown {
  return record?.status
}

/**
 * Accept both the legacy `{ status:'queued' }` payload and CLI 1.0.3's
 * `ExtMethodResult` envelope `{ result:{ status:'queued' } }`.
 * A resolved object with no `error` and no conflicting status is queued —
 * official TUI only checks request Ok.
 */
export function parseInterjectResult(value: unknown): InterjectResult {
  const record = asRecord(value)
  if (!record) throw new Error('無效的插話回應')

  const inner = asRecord(record.result)
  const errorMessage = readErrorMessage(record.error) ?? readErrorMessage(inner?.error)
  if (errorMessage) throw new Error(errorMessage)

  const status = readStatus(record) ?? readStatus(inner)
  if (status !== undefined && status !== 'queued') {
    throw new Error(`未預期的插話狀態：${String(status)}`)
  }
  return { status: 'queued' }
}

/** Client-minted id so the optimistic transcript echo can dedup the official broadcast. */
export function mintInterjectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `interject-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Strip Electron's `Error invoking remote method '…': Error: ` wrapper. */
export function stripIpcErrorPrefix(message: string): string {
  return message.replace(/^(?:Error invoking remote method '[^']*':\s*)+(?:Error:\s*)?/, '').trim()
}

/** User-facing interject error: Traditional Chinese, no Electron IPC plumbing. */
export function formatInterjectError(error: unknown): string {
  const stripped = stripIpcErrorPrefix(error instanceof Error ? error.message : String(error ?? ''))
  if (!stripped) return '插話失敗'
  if (/[\u3400-\u9fff]/.test(stripped)) return stripped
  return `插話失敗：${stripped}`
}

/** Detect method-not-found style ACP/JSON-RPC errors (do not treat all failures as unsupported). */
export function isMethodNotFoundError(error: unknown): boolean {
  const message = stripIpcErrorPrefix(error instanceof Error ? error.message : String(error ?? ''))
  return /method not found/i.test(message)
    || /unknown method/i.test(message)
    || /method .* not (found|supported|available)/i.test(message)
}
