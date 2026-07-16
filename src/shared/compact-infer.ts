/**
 * Fallback C: infer possible context compaction from signals.json usage drops
 * when no official wire event (Scheme A) was observed.
 *
 * Hedged only — never claim an official compact event from disk alone.
 */

export type CompactUsageSample = {
  contextTokensUsed?: number
  contextWindowUsage?: number
  compactionCount?: number
}

export type InferredCompact = {
  before?: number
  after?: number
  beforePercent?: number
  afterPercent?: number
  reason: 'token_drop' | 'percent_drop' | 'compaction_count'
}

export type InferCompactOptions = {
  /** Absolute token drop required (default 8_000). */
  minTokenDrop?: number
  /** Relative token drop vs previous used (default 0.12 = 12%). */
  minTokenDropRatio?: number
  /** Percentage-point drop on contextWindowUsage (default 10). */
  minPercentDrop?: number
  /** Ignore inferred emit if official compact seen within this window (ms). */
  officialGraceMs?: number
  /** One inferred notice per drop episode (ms). */
  episodeCooldownMs?: number
  now?: number
  lastOfficialCompactAt?: number
  lastInferredEpisodeAt?: number
}

const DEFAULTS = {
  minTokenDrop: 8_000,
  minTokenDropRatio: 0.12,
  minPercentDrop: 10,
  officialGraceMs: 15_000,
  episodeCooldownMs: 60_000
}

/**
 * Detect a sharp context drop or compactionCount bump worth a hedged UI notice.
 * Pure — does not emit events.
 */
export function detectSharpContextDrop(
  prev: CompactUsageSample | null | undefined,
  next: CompactUsageSample | null | undefined,
  options: Pick<InferCompactOptions, 'minTokenDrop' | 'minTokenDropRatio' | 'minPercentDrop'> = {}
): InferredCompact | null {
  if (!prev || !next) return null
  const minTokenDrop = options.minTokenDrop ?? DEFAULTS.minTokenDrop
  const minTokenDropRatio = options.minTokenDropRatio ?? DEFAULTS.minTokenDropRatio
  const minPercentDrop = options.minPercentDrop ?? DEFAULTS.minPercentDrop

  const prevCount = prev.compactionCount
  const nextCount = next.compactionCount
  if (
    typeof prevCount === 'number' &&
    typeof nextCount === 'number' &&
    nextCount > prevCount
  ) {
    return {
      before: prev.contextTokensUsed,
      after: next.contextTokensUsed,
      beforePercent: prev.contextWindowUsage,
      afterPercent: next.contextWindowUsage,
      reason: 'compaction_count'
    }
  }

  const before = prev.contextTokensUsed
  const after = next.contextTokensUsed
  if (typeof before === 'number' && typeof after === 'number' && after < before) {
    const drop = before - after
    const ratio = before > 0 ? drop / before : 0
    if (drop >= minTokenDrop && ratio >= minTokenDropRatio) {
      return {
        before,
        after,
        beforePercent: prev.contextWindowUsage,
        afterPercent: next.contextWindowUsage,
        reason: 'token_drop'
      }
    }
  }

  const beforePct = prev.contextWindowUsage
  const afterPct = next.contextWindowUsage
  if (
    typeof beforePct === 'number' &&
    typeof afterPct === 'number' &&
    beforePct - afterPct >= minPercentDrop
  ) {
    return {
      before: prev.contextTokensUsed,
      after: next.contextTokensUsed,
      beforePercent: beforePct,
      afterPercent: afterPct,
      reason: 'percent_drop'
    }
  }

  return null
}

/**
 * Whether to surface a hedged inferred-compact notice given cooldowns / official grace.
 */
export function shouldEmitInferredCompact(
  prev: CompactUsageSample | null | undefined,
  next: CompactUsageSample | null | undefined,
  options: InferCompactOptions = {}
): InferredCompact | null {
  const now = options.now ?? Date.now()
  const officialGraceMs = options.officialGraceMs ?? DEFAULTS.officialGraceMs
  const episodeCooldownMs = options.episodeCooldownMs ?? DEFAULTS.episodeCooldownMs

  if (
    options.lastOfficialCompactAt !== undefined &&
    now - options.lastOfficialCompactAt < officialGraceMs
  ) {
    return null
  }
  if (
    options.lastInferredEpisodeAt !== undefined &&
    now - options.lastInferredEpisodeAt < episodeCooldownMs
  ) {
    return null
  }

  return detectSharpContextDrop(prev, next, options)
}

/** 繁中 body for inferred (hedged) compact card. */
export function formatInferredCompactSummary(inferred: InferredCompact): string {
  const pct =
    inferred.beforePercent !== undefined && inferred.afterPercent !== undefined
      ? `用量 ${Math.round(inferred.beforePercent)}%→${Math.round(inferred.afterPercent)}%`
      : null
  const tokens =
    inferred.before !== undefined && inferred.after !== undefined
      ? `tokens ${inferred.before}→${inferred.after}`
      : null
  const detail = [pct, tokens].filter(Boolean).join(' · ')
  return detail ? `可能已壓縮上下文（${detail}；由 signals 推斷，非官方事件）` : '可能已壓縮上下文（由 signals 推斷，非官方事件）'
}

/** 繁中 title for official wire compact. */
export function formatOfficialCompactTitle(before?: number, after?: number): string {
  if (before !== undefined && after !== undefined && before === after) {
    return '已執行上下文壓縮（用量未變）'
  }
  return '已自動壓縮上下文'
}
