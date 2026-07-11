import { describe, expect, it, vi } from 'vitest'
import { formatBillingReset, normalizeBilling, quotaLevel, selectCrossedQuotaThreshold } from '../src/shared/billing'
import { BillingCache } from '../src/main/billing-cache'

const sample = {
  config: {
    creditUsagePercent: 79,
    currentPeriod: {
      type: 'USAGE_PERIOD_TYPE_WEEKLY',
      start: '2026-07-10T02:38:18Z',
      end: '2026-07-17T02:38:18Z'
    },
    billingPeriodStart: '2026-07-10T02:38:18Z',
    billingPeriodEnd: '2026-07-17T02:38:18Z',
    productUsage: [
      { product: 'GrokBuild', usagePercent: 50 },
      { product: 'GrokImagine', usagePercent: 23 },
      { product: 'Api', usagePercent: 6 }
    ],
    isUnifiedBillingUser: true,
    prepaidBalance: { val: 0 }
  }
}

describe('billing normalization', () => {
  it('normalizes the verified _x.ai/billing payload', () => {
    expect(normalizeBilling(sample)).toEqual({
      creditUsagePercent: 79,
      currentPeriod: {
        type: 'USAGE_PERIOD_TYPE_WEEKLY',
        start: '2026-07-10T02:38:18Z',
        end: '2026-07-17T02:38:18Z'
      },
      billingPeriodStart: '2026-07-10T02:38:18Z',
      billingPeriodEnd: '2026-07-17T02:38:18Z',
      productUsage: [
        { product: 'GrokBuild', usagePercent: 50 },
        { product: 'GrokImagine', usagePercent: 23 },
        { product: 'Api', usagePercent: 6 }
      ],
      isUnifiedBillingUser: true,
      prepaidBalance: 0
    })
  })

  it('keeps optional product and date fields safe when the extension omits them', () => {
    expect(normalizeBilling({ config: { creditUsagePercent: 12, productUsage: 'missing' } })).toEqual({
      creditUsagePercent: 12,
      productUsage: []
    })
    expect(normalizeBilling({ config: { creditUsagePercent: '79' } })).toBeNull()
    expect(normalizeBilling(undefined)).toBeNull()
  })
})

describe('billing presentation', () => {
  it('formats reset dates in zh-TW with day and hour countdowns', () => {
    expect(formatBillingReset('2026-07-17T02:38:18Z', new Date('2026-07-12T02:38:18Z'))).toBe('7/17 重置 · 剩 5 天')
    expect(formatBillingReset('2026-07-17T02:38:18Z', new Date('2026-07-16T12:38:18Z'))).toBe('7/17 重置 · 剩 14 小時')
    expect(formatBillingReset(undefined, new Date('2026-07-12T02:38:18Z'))).toBe('重置時間未提供')
  })

  it('maps reactor warning levels and only announces newly crossed thresholds', () => {
    expect(quotaLevel(79)).toBe('normal')
    expect(quotaLevel(80)).toBe('warn')
    expect(quotaLevel(95)).toBe('danger')
    expect(selectCrossedQuotaThreshold(79, 82, new Set())).toBe(80)
    expect(selectCrossedQuotaThreshold(90, 97, new Set([80]))).toBe(95)
    expect(selectCrossedQuotaThreshold(96, 97, new Set([80, 95]))).toBeNull()
  })
})

describe('BillingCache', () => {
  it('reuses successful billing data for ten minutes and refreshes after expiry', async () => {
    let now = 1_000
    const load = vi.fn().mockResolvedValue(sample)
    const cache = new BillingCache(600_000, () => now)

    expect(await cache.get(load)).toBe(sample)
    now += 599_999
    expect(await cache.get(load)).toBe(sample)
    expect(load).toHaveBeenCalledTimes(1)
    now += 2
    expect(await cache.get(load)).toBe(sample)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('coalesces simultaneous renderer refreshes into one upstream request', async () => {
    let resolveLoad!: (value: typeof sample) => void
    const load = vi.fn(() => new Promise<typeof sample>((resolve) => { resolveLoad = resolve }))
    const cache = new BillingCache()

    const first = cache.get(load)
    const second = cache.get(load)
    expect(load).toHaveBeenCalledTimes(1)
    resolveLoad(sample)
    await expect(Promise.all([first, second])).resolves.toEqual([sample, sample])
  })
})
