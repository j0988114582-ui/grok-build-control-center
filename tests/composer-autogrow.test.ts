import { describe, expect, it } from 'vitest'
import {
  MAIN_COMPOSER_MIN_PX,
  mainComposerMaxPx,
  teamComposerMaxPx,
  TEAM_COMPOSER_MAX_PX,
  TEAM_COMPOSER_MIN_PX
} from '../src/shared/composer-autogrow'

describe('composer autogrow caps (P-COMP)', () => {
  it('main max is 50vh with floor at min height', () => {
    expect(mainComposerMaxPx(800)).toBe(400)
    expect(mainComposerMaxPx(100)).toBe(MAIN_COMPOSER_MIN_PX)
  })

  it('team max is min(120px, 28% pane) with ~52px floor', () => {
    expect(teamComposerMaxPx(1000)).toBe(TEAM_COMPOSER_MAX_PX) // 280 → capped 120
    expect(teamComposerMaxPx(200)).toBe(56) // 28% of 200
    expect(teamComposerMaxPx(100)).toBe(TEAM_COMPOSER_MIN_PX) // 28 → floor 52
    expect(teamComposerMaxPx(0)).toBe(TEAM_COMPOSER_MAX_PX)
  })
})
