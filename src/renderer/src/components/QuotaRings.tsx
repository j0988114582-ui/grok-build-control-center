import React from 'react'
import {
  formatBillingReset,
  productUsagePercent,
  quotaLevel,
  shouldShowUnifiedBillingNotice,
  UNIFIED_BILLING_NOTICE
} from '../../../shared/billing'
import type { BillingInfo } from '../../../shared/types'

type QuotaRingsProps = {
  billing: BillingInfo | null
  unavailable?: boolean
  now?: Date
}

const PRODUCT_LABELS: Record<string, string> = {
  GrokBuild: 'GrokBuild',
  GrokImagine: 'GrokImagine',
  Api: 'API'
}

function ReactorRing({ label, percent, missingTitle }: { label: string; percent?: number; missingTitle?: string }): React.JSX.Element {
  if (percent === undefined) {
    return <div className="quota-ring unavailable" aria-label={`${label} 額度暫無資料`} title={missingTitle ?? '服務未提供此項額度'}>
      <svg viewBox="0 0 40 40" aria-hidden="true"><circle className="quota-ring-track" cx="20" cy="20" r="15" /></svg>
      <span><strong>—</strong><small>{label}</small></span>
    </div>
  }
  const normalized = Math.min(100, Math.max(0, percent))
  const radius = 15
  const circumference = 2 * Math.PI * radius
  return <div className={`quota-ring ${quotaLevel(normalized)}`} aria-label={`${label}${label === '總額度' ? '' : ' '}已使用 ${Math.round(percent)}%`}>
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle className="quota-ring-track" cx="20" cy="20" r={radius} />
      <circle className="quota-ring-value" cx="20" cy="20" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - normalized / 100)} />
    </svg>
    <span><strong>{Math.round(percent)}%</strong><small>{label}</small></span>
  </div>
}

export function QuotaRings({ billing, unavailable = false, now }: QuotaRingsProps): React.JSX.Element | null {
  if (!billing) return unavailable ? <div className="quota-unavailable">額度資料暫不可用</div> : null
  const usageFor = (product: string): number | undefined => productUsagePercent(billing, product)
  const fixedProducts = [
    { product: 'GrokBuild', label: 'Build' },
    { product: 'GrokImagine', label: 'Imagine' },
    { product: 'Api', label: 'API' }
  ]
  /** P-QUOTA: hide product rings with no data; never fabricate 0%. Keep total always. */
  const visibleProducts = fixedProducts
    .map((item) => ({ ...item, percent: usageFor(item.product) }))
    .filter((item): item is typeof item & { percent: number } => item.percent !== undefined)
  const periodStart = billing.billingPeriodStart ?? billing.currentPeriod?.start
  const periodEnd = billing.billingPeriodEnd ?? billing.currentPeriod?.end
  const showUnifiedNotice = shouldShowUnifiedBillingNotice(billing)

  return <div className="quota-reactor" data-testid="quota-reactor" data-billing-zone="subscription" tabIndex={0}>
    <div className="quota-reactor-main" data-testid="quota-summary" aria-label="訂閱週額度摘要">
      <ReactorRing label="總額度" percent={billing.creditUsagePercent} />
      {visibleProducts.map((item) => <ReactorRing key={item.product} label={item.label} percent={item.percent} />)}
      <time>{formatBillingReset(periodEnd, now)}</time>
    </div>
    <section className="quota-popover" aria-label="週額度明細">
      <header><strong>訂閱週額度</strong><span>WEEKLY</span></header>
      {showUnifiedNotice && <p className="quota-unified-notice" data-testid="unified-billing-notice">{UNIFIED_BILLING_NOTICE}</p>}
      {visibleProducts.length > 0 && <div className="quota-products">{visibleProducts.map((fixed) => (
        <div key={fixed.product}>
          <label><span>{PRODUCT_LABELS[fixed.product]}</span><b>{`${Math.round(fixed.percent)}%`}</b></label>
          <i><span className={quotaLevel(fixed.percent)} style={{ width: `${Math.min(100, Math.max(0, fixed.percent))}%` }} /></i>
        </div>
      ))}</div>}
      {showUnifiedNotice && <p className="quota-unified-hint">服務未提供分項 Build／Imagine（Image）／API 百分比時會隱藏分項環，僅保留總額度；並非讀取失敗。</p>}
      <footer><span>{periodStart ? new Date(periodStart).toLocaleDateString('zh-TW') : '—'}</span><em>→</em><span>{periodEnd ? new Date(periodEnd).toLocaleDateString('zh-TW') : '—'}</span></footer>
    </section>
  </div>
}
