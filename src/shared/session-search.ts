import type { SessionSummary } from './types'

export type SessionSearchDoc = {
  id: string
  /** Pre-normalized haystack for case-insensitive includes. */
  haystack: string
}

const MAX_DRAFT_CHARS = 4_000

export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function buildSessionSearchDoc(
  session: SessionSummary,
  options?: {
    titleOverrides?: Record<string, string>
    drafts?: Record<string, string>
  }
): SessionSearchDoc {
  const localTitle = options?.titleOverrides?.[session.id] ?? ''
  const draft = options?.drafts?.[session.id] ?? ''
  const draftSlice = draft.length > MAX_DRAFT_CHARS ? draft.slice(0, MAX_DRAFT_CHARS) : draft
  const raw = [session.title, localTitle, session.cwd, draftSlice].filter(Boolean).join('\n')
  return { id: session.id, haystack: normalizeSearchText(raw) }
}

export function buildSessionSearchIndex(
  sessions: readonly SessionSummary[],
  options?: {
    titleOverrides?: Record<string, string>
    drafts?: Record<string, string>
  }
): SessionSearchDoc[] {
  return sessions.map((session) => buildSessionSearchDoc(session, options))
}

/**
 * Filter sessions by query against a prebuilt index (O(n) includes, no re-normalize of huge drafts).
 */
export function filterSessionsBySearch(
  sessions: readonly SessionSummary[],
  index: readonly SessionSearchDoc[],
  query: string
): SessionSummary[] {
  const q = normalizeSearchText(query)
  if (!q) return [...sessions]
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const hits: SessionSummary[] = []
  for (const doc of index) {
    if (!doc.haystack.includes(q)) continue
    const session = byId.get(doc.id)
    if (session) hits.push(session)
  }
  return hits
}
