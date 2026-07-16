/**
 * F-INT-4: Minimal **local** next-turn queue (client-side).
 * Official research does not expose a dedicated `x.ai/queue/*` ACP method for prompts;
 * this module auto-sends via `session/prompt` when the current turn ends.
 */

import type { PromptBlock } from './types'

export type LocalQueuedPrompt = {
  sessionId: string
  text?: string
  attachments: PromptBlock[]
}

export const LOCAL_QUEUE_NOTICE = '已排隊下一輪：目前回合結束後會自動送出'
export const LOCAL_QUEUE_STATUS = '下一輪已排隊'
export const LOCAL_QUEUE_CLEARED_NOTICE = '已取消下一輪排隊'

/** True when there is something worth sending after the turn. */
export function hasQueuedPayload(item: LocalQueuedPrompt | null | undefined): boolean {
  if (!item) return false
  return Boolean(item.text?.trim()) || item.attachments.length > 0
}

/**
 * Whether a finished turn should drain the local queue.
 * We drain on any non-running terminal status (completed / cancelled / error)
 * so Stop still delivers the next-turn payload the user queued.
 */
export function shouldDrainLocalQueue(turnStatus: string): boolean {
  return turnStatus === 'completed' || turnStatus === 'cancelled' || turnStatus === 'error'
}

export function takeQueueForSession(
  queue: LocalQueuedPrompt | null,
  sessionId: string
): { next: LocalQueuedPrompt | null; drained: LocalQueuedPrompt | null } {
  if (!queue || queue.sessionId !== sessionId || !hasQueuedPayload(queue)) {
    return { next: queue, drained: null }
  }
  return { next: null, drained: queue }
}
