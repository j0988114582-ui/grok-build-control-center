import { describe, expect, it } from 'vitest'
import {
  availableComposerMaxPx,
  MAIN_COMPOSER_MIN_PX,
  mainComposerMaxPx,
  teamComposerMaxPx,
  TEAM_COMPOSER_MAX_PX,
  TEAM_COMPOSER_MIN_PX,
  TRANSCRIPT_MIN_PX
} from '../src/shared/composer-autogrow'

describe('composer autogrow caps (P-COMP)', () => {
  it('main fallback max is 90vh with floor at min height', () => {
    expect(mainComposerMaxPx(800)).toBe(720)
    expect(mainComposerMaxPx(50)).toBe(MAIN_COMPOSER_MIN_PX)
  })

  // v0.11: the real cap is live geometry — a long draft may cover the conversation, but
  // the transcript never drops below its floor.
  it('live max lets the composer take all transcript space above TRANSCRIPT_MIN_PX', () => {
    expect(availableComposerMaxPx(88, 619)).toBe(88 + 619 - TRANSCRIPT_MIN_PX)
    expect(availableComposerMaxPx(470, 330)).toBe(470 + 330 - TRANSCRIPT_MIN_PX)
  })

  it('live max never returns less than the composer minimum', () => {
    expect(availableComposerMaxPx(88, 0)).toBe(MAIN_COMPOSER_MIN_PX)
    expect(availableComposerMaxPx(88, 100)).toBe(MAIN_COMPOSER_MIN_PX)
  })

  it('live max ignores non-finite geometry rather than producing NaN', () => {
    expect(availableComposerMaxPx(Number.NaN, 619)).toBe(MAIN_COMPOSER_MIN_PX)
    expect(availableComposerMaxPx(88, Number.POSITIVE_INFINITY)).toBe(MAIN_COMPOSER_MIN_PX)
  })

  it('team max is min(120px, 28% pane) with ~52px floor', () => {
    expect(teamComposerMaxPx(1000)).toBe(TEAM_COMPOSER_MAX_PX) // 280 → capped 120
    expect(teamComposerMaxPx(200)).toBe(56) // 28% of 200
    expect(teamComposerMaxPx(100)).toBe(TEAM_COMPOSER_MIN_PX) // 28 → floor 52
    expect(teamComposerMaxPx(0)).toBe(TEAM_COMPOSER_MAX_PX)
  })
})
