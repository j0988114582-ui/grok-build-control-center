/**
 * P-BOOKMARK: derive the list of prompts the user sent in a conversation.
 *
 * No new persistence — every prompt is already in the transcript as a user `message`
 * event with a stable id, so the bookmark list is derived on render, not stored.
 */
import type { UiSessionEvent } from './types'

export type PromptBookmark = { id: string; ordinal: number; label: string }

/** Two-line summary: ~40 chars per line. */
export const PROMPT_BOOKMARK_LABEL_MAX = 80

export function collectPromptBookmarks(events: UiSessionEvent[]): PromptBookmark[] {
  const out: PromptBookmark[] = []
  for (const event of events) {
    if (event.kind !== 'message' || event.role !== 'user') continue
    const flat = event.text.replace(/\s+/g, ' ').trim()
    if (!flat) continue
    out.push({
      id: event.id,
      ordinal: out.length + 1,
      label: flat.length > PROMPT_BOOKMARK_LABEL_MAX ? `${flat.slice(0, PROMPT_BOOKMARK_LABEL_MAX)}…` : flat
    })
  }
  return out
}
