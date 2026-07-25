/**
 * P-SCROLL: transcript bottom-lock policy.
 *
 * Two defects this exists to fix (both reproduced on real Electron, 2026-07-25):
 *
 * D1 — the composer is a flex sibling of the transcript. Growing it (auto-grow on a long
 *      draft) shrinks the scroller under Virtuoso, which keeps its `scrollTop` and quietly
 *      pushes the newest message out of sight. Measured: composer 88→470px left the
 *      transcript 289px from the bottom with no 「跳到最新」 affordance to get back.
 *
 * D2 — that same shrink makes Virtuoso emit a transient `atBottom=false`. Treating it as
 *      "the user scrolled up" stranded followTail at false, so the 「跳到最新」 pill showed
 *      while the user was demonstrably at the newest event (measured after a window resize:
 *      distance from bottom 0px, pill visible).
 *
 * Leaving the bottom is therefore debounced; arriving at the bottom is applied immediately.
 */

/** A real scroll-up survives this; a resize transient does not. */
export const AT_BOTTOM_LEAVE_DEBOUNCE_MS = 160

/** Sub-pixel composer jitter is not worth a re-pin. */
export const COMPOSER_RESIZE_EPSILON_PX = 1

/**
 * Staggered re-pin schedule after a session load. `followOutput` alone wins the replay
 * race today, but only by timing — a slower replay or a larger history would lose it.
 * These make landing on the newest event unconditional.
 */
export const POST_LOAD_STICK_DELAYS_MS = [0, 150, 450, 900] as const

/**
 * Re-issue delays for a jump to an arbitrary transcript index.
 *
 * Virtuoso sizes items lazily: scrolling to an event whose height it has never measured
 * lands approximately, then the list settles and shifts underneath you (measured: a jump
 * to the first prompt stopped 741px short and left a different event on screen). Repeating
 * the scroll after the settle is what actually puts the target at the top.
 */
export const JUMP_SETTLE_DELAYS_MS = [220, 520] as const

/** Whether a composer height change should re-pin the transcript to the newest event. */
export function shouldPinAfterResize(
  previousHeight: number,
  nextHeight: number,
  following: boolean
): boolean {
  if (!following) return false
  if (!Number.isFinite(previousHeight) || !Number.isFinite(nextHeight)) return false
  return Math.abs(nextHeight - previousHeight) > COMPOSER_RESIZE_EPSILON_PX
}
