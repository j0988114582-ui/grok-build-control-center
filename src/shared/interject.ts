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

export function parseInterjectResult(value: unknown): InterjectResult {
  if (!value || typeof value !== 'object') throw new Error('無效的插話回應')
  const status = (value as { status?: unknown }).status
  if (status !== 'queued') throw new Error(`未預期的插話狀態：${String(status)}`)
  return { status: 'queued' }
}

/** Detect method-not-found style ACP/JSON-RPC errors (do not treat all failures as unsupported). */
export function isMethodNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /method not found/i.test(message)
    || /unknown method/i.test(message)
    || /method .* not (found|supported|available)/i.test(message)
}
