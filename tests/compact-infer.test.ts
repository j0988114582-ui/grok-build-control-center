import { describe, expect, it } from 'vitest'
import {
  detectSharpContextDrop,
  formatInferredCompactSummary,
  formatOfficialCompactTitle,
  shouldEmitInferredCompact
} from '../src/shared/compact-infer'

describe('Fallback C compact inference', () => {
  it('detects sharp token drop with enough absolute and ratio drop', () => {
    expect(detectSharpContextDrop(
      { contextTokensUsed: 100_000, contextWindowUsage: 40 },
      { contextTokensUsed: 40_000, contextWindowUsage: 16 }
    )).toMatchObject({ reason: 'token_drop', before: 100_000, after: 40_000 })
  })

  it('ignores small token wiggles', () => {
    expect(detectSharpContextDrop(
      { contextTokensUsed: 50_000, contextWindowUsage: 20 },
      { contextTokensUsed: 48_000, contextWindowUsage: 19 }
    )).toBeNull()
  })

  it('detects percent drop and compactionCount bump', () => {
    expect(detectSharpContextDrop(
      { contextWindowUsage: 55 },
      { contextWindowUsage: 30 }
    )).toMatchObject({ reason: 'percent_drop' })

    expect(detectSharpContextDrop(
      { compactionCount: 0, contextTokensUsed: 10_000 },
      { compactionCount: 1, contextTokensUsed: 9_500 }
    )).toMatchObject({ reason: 'compaction_count' })
  })

  it('suppresses inferred emit during official grace and episode cooldown', () => {
    const prev = { contextTokensUsed: 100_000, contextWindowUsage: 50 }
    const next = { contextTokensUsed: 30_000, contextWindowUsage: 15 }
    const now = 1_000_000

    expect(shouldEmitInferredCompact(prev, next, {
      now,
      lastOfficialCompactAt: now - 5_000
    })).toBeNull()

    expect(shouldEmitInferredCompact(prev, next, {
      now,
      lastInferredEpisodeAt: now - 10_000
    })).toBeNull()

    expect(shouldEmitInferredCompact(prev, next, {
      now,
      lastOfficialCompactAt: now - 20_000,
      lastInferredEpisodeAt: now - 90_000
    })).toMatchObject({ reason: 'token_drop' })
  })

  it('formats hedged 繁中 copy without claiming official event', () => {
    const text = formatInferredCompactSummary({
      before: 90_000,
      after: 20_000,
      beforePercent: 45,
      afterPercent: 10,
      reason: 'token_drop'
    })
    expect(text).toContain('可能已壓縮上下文')
    expect(text).toContain('非官方事件')
    expect(text).toContain('45%→10%')
    expect(formatOfficialCompactTitle(100, 100)).toContain('用量未變')
  })

  // v0.11: the title carries the numbers. Before the card defaulted to open, the title was
  // the only visible part — and it said nothing about how much context was reclaimed.
  it('official title reports before→after tokens', () => {
    expect(formatOfficialCompactTitle(900, 300)).toBe('已自動壓縮上下文（900 → 300 tokens）')
    expect(formatOfficialCompactTitle(191_000, 96_000)).toBe('已自動壓縮上下文（191k → 96k tokens）')
    expect(formatOfficialCompactTitle(9_500, 1_200)).toBe('已自動壓縮上下文（9.5k → 1.2k tokens）')
  })

  it('official title stays generic when the CLI gave no numbers', () => {
    expect(formatOfficialCompactTitle()).toBe('已自動壓縮上下文')
    expect(formatOfficialCompactTitle(900, undefined)).toBe('已自動壓縮上下文')
  })
})
