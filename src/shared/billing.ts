import type { BillingInfo, BillingProductUsage } from './types'

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const isoDate = (value: unknown): string | undefined =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined

const normalizeProducts = (value: unknown): BillingProductUsage[] => Array.isArray(value)
  ? value.flatMap((entry) => {
      const item = record(entry)
      const usagePercent = finiteNumber(item?.usagePercent)
      return item && typeof item.product === 'string' && usagePercent !== undefined
        ? [{ product: item.product, usagePercent }]
        : []
    })
  : []

export function normalizeBilling(value: unknown): BillingInfo | null {
  const envelope = record(value)
  const config = record(envelope?.config) ?? envelope
  const creditUsagePercent = finiteNumber(config?.creditUsagePercent)
  if (!config || creditUsagePercent === undefined) return null

  const period = record(config.currentPeriod)
  const type = typeof period?.type === 'string' ? period.type : undefined
  const start = isoDate(period?.start)
  const end = isoDate(period?.end)
  const prepaid = record(config.prepaidBalance)
  const prepaidBalance = finiteNumber(prepaid?.val)

  return {
    creditUsagePercent,
    ...(type || start || end ? { currentPeriod: { type: type ?? 'unknown', ...(start ? { start } : {}), ...(end ? { end } : {}) } } : {}),
    ...(isoDate(config.billingPeriodStart) ? { billingPeriodStart: isoDate(config.billingPeriodStart) } : {}),
    ...(isoDate(config.billingPeriodEnd) ? { billingPeriodEnd: isoDate(config.billingPeriodEnd) } : {}),
    productUsage: normalizeProducts(config.productUsage),
    ...(typeof config.isUnifiedBillingUser === 'boolean' ? { isUnifiedBillingUser: config.isUnifiedBillingUser } : {}),
    ...(prepaidBalance !== undefined ? { prepaidBalance } : {})
  }
}

export type QuotaLevel = 'normal' | 'warn' | 'danger'

/** Fixed product rings shown in the reactor UI (never fabricate values for these). */
export const FIXED_BILLING_PRODUCTS = ['GrokBuild', 'GrokImagine', 'Api'] as const
export type FixedBillingProduct = (typeof FIXED_BILLING_PRODUCTS)[number]

/**
 * Traditional Chinese notice for unified weekly quota when product breakdown is absent.
 * Shown only when all three fixed products lack data (P1-3) — never when partial products exist.
 */
export const UNIFIED_BILLING_NOTICE =
  '此帳號為統一週額度，總用量已涵蓋 Build、Imagine（Image）、API。服務未提供分項百分比，故顯示「—」，並非讀取失敗。'

export function productUsagePercent(billing: Pick<BillingInfo, 'productUsage'>, product: string): number | undefined {
  return billing.productUsage.find((item) => item.product === product)?.usagePercent
}

/**
 * Main unified-quota banner: only when GrokBuild, GrokImagine, and Api are all missing.
 * Partial product data → show real % where present and — for missing; no main banner.
 * Does not consult isUnifiedBillingUser alone — product presence wins (T-Billing-2).
 */
export function shouldShowUnifiedBillingNotice(billing: Pick<BillingInfo, 'productUsage'>): boolean {
  return FIXED_BILLING_PRODUCTS.every((product) => productUsagePercent(billing, product) === undefined)
}

export function quotaLevel(percent: number): QuotaLevel {
  if (percent >= 95) return 'danger'
  if (percent >= 80) return 'warn'
  return 'normal'
}

export function formatBillingReset(end: string | undefined, now = new Date()): string {
  if (!end) return '重置時間未提供'
  const reset = new Date(end)
  if (!Number.isFinite(reset.getTime())) return '重置時間未提供'
  const label = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Taipei' }).format(reset)
  const remaining = reset.getTime() - now.getTime()
  if (remaining <= 0) return `${label} 重置 · 即將更新`
  const hours = Math.ceil(remaining / 3_600_000)
  return remaining < 86_400_000
    ? `${label} 重置 · 剩 ${hours} 小時`
    : `${label} 重置 · 剩 ${Math.ceil(remaining / 86_400_000)} 天`
}

export function quotaAlertStorageKey(info: Pick<BillingInfo, 'billingPeriodEnd' | 'currentPeriod'>): string {
  return `grok-quota-alerts:${info.billingPeriodEnd ?? info.currentPeriod?.end ?? 'current'}`
}

export function selectCrossedQuotaThreshold(previous: number, current: number, reminded: ReadonlySet<number>): 80 | 95 | null {
  if (previous < 95 && current >= 95 && !reminded.has(95)) return 95
  if (previous < 80 && current >= 80 && !reminded.has(80)) return 80
  return null
}
