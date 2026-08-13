import { describe, expect, it } from 'vitest'
import {
  AT_BOTTOM_LEAVE_DEBOUNCE_MS,
  COMPOSER_RESIZE_EPSILON_PX,
  isTranscriptAtBottom,
  POST_LOAD_STICK_DELAYS_MS,
  TRANSCRIPT_BOTTOM_THRESHOLD_PX,
  shouldPinAfterResize
} from '../src/shared/scroll-anchor'

describe('transcript bottom-lock policy (P-SCROLL)', () => {
  // D1 regression: composer 88→470px left the transcript 289px from the bottom with the
  // newest message hidden behind the composer and no way back.
  it('re-pins when a following transcript loses height to the composer', () => {
    expect(shouldPinAfterResize(88, 470, true)).toBe(true)
    expect(shouldPinAfterResize(470, 88, true)).toBe(true)
  })

  it('never re-pins when the user has deliberately scrolled up', () => {
    expect(shouldPinAfterResize(88, 470, false)).toBe(false)
    expect(shouldPinAfterResize(470, 88, false)).toBe(false)
  })

  it('ignores sub-pixel jitter so a settled layout does not thrash', () => {
    expect(shouldPinAfterResize(88, 88, true)).toBe(false)
    expect(shouldPinAfterResize(88, 88 + COMPOSER_RESIZE_EPSILON_PX, true)).toBe(false)
    expect(shouldPinAfterResize(88, 88 + COMPOSER_RESIZE_EPSILON_PX + 0.5, true)).toBe(true)
  })

  it('treats unmeasurable geometry as "do nothing"', () => {
    expect(shouldPinAfterResize(Number.NaN, 470, true)).toBe(false)
    expect(shouldPinAfterResize(88, Number.NaN, true)).toBe(false)
  })

  // D2 regression: a resize transient must not outlive the debounce, but a real scroll-up
  // must still surface the 「跳到最新」 pill quickly.
  it('debounces leaving the bottom by a perceptible-but-short window', () => {
    expect(AT_BOTTOM_LEAVE_DEBOUNCE_MS).toBeGreaterThan(100)
    expect(AT_BOTTOM_LEAVE_DEBOUNCE_MS).toBeLessThan(400)
  })

  it('re-pins after a load more than once so a slow replay still lands at the bottom', () => {
    expect(POST_LOAD_STICK_DELAYS_MS.length).toBeGreaterThanOrEqual(3)
    expect(POST_LOAD_STICK_DELAYS_MS[0]).toBe(0)
    const ascending = [...POST_LOAD_STICK_DELAYS_MS].every(
      (value, index, all) => index === 0 || value > all[index - 1]
    )
    expect(ascending).toBe(true)
  })

  it('uses the same bounded bottom geometry for manual-scroll resume decisions', () => {
    expect(isTranscriptAtBottom(896, 1000, 100)).toBe(true)
    expect(isTranscriptAtBottom(895, 1000, 100)).toBe(false)
    expect(isTranscriptAtBottom(0, 80, 100)).toBe(true)
    expect(isTranscriptAtBottom(Number.NaN, 1000, 100)).toBe(false)
    expect(TRANSCRIPT_BOTTOM_THRESHOLD_PX).toBe(4)
  })
})
