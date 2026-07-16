// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { QuotaRings } from '../src/renderer/src/components/QuotaRings'
import type { BillingInfo } from '../src/shared/types'

const billing: BillingInfo = {
  creditUsagePercent: 79,
  billingPeriodStart: '2026-07-10T02:38:18Z',
  billingPeriodEnd: '2026-07-17T02:38:18Z',
  currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', start: '2026-07-10T02:38:18Z', end: '2026-07-17T02:38:18Z' },
  productUsage: [
    { product: 'GrokBuild', usagePercent: 50 },
    { product: 'GrokImagine', usagePercent: 23 },
    { product: 'Api', usagePercent: 6 }
  ]
}

describe('QuotaRings', () => {
  afterEach(cleanup)

  it('keeps total, Build, Imagine, and API visible in the enlarged summary', async () => {
    const user = userEvent.setup()
    render(<QuotaRings billing={billing} now={new Date('2026-07-12T02:38:18Z')} />)

    const summary = within(screen.getByTestId('quota-summary'))
    expect(summary.getByLabelText('總額度已使用 79%')).toBeInTheDocument()
    expect(summary.getByLabelText('Build 已使用 50%')).toBeInTheDocument()
    expect(summary.getByLabelText('Imagine 已使用 23%')).toBeInTheDocument()
    expect(summary.getByLabelText('API 已使用 6%')).toBeInTheDocument()
    expect(screen.getByText('7/17 重置 · 剩 5 天')).toBeInTheDocument()

    await user.hover(screen.getByTestId('quota-reactor'))
    const details = within(screen.getByRole('region', { name: '週額度明細' }))
    expect(details.getByText('WEEKLY')).toBeInTheDocument()
    expect(details.getByText('GrokImagine')).toBeInTheDocument()
    expect(details.getByText('API')).toBeInTheDocument()
  })

  it('renders a non-blocking unavailable state', () => {
    render(<QuotaRings billing={null} unavailable />)
    expect(screen.getByText('額度資料暫不可用')).toBeInTheDocument()
  })

  it('does not misreport missing product usage as zero percent', () => {
    render(<QuotaRings billing={{ creditUsagePercent: 79, productUsage: [] }} />)
    const summary = within(screen.getByTestId('quota-summary'))
    expect(summary.getByLabelText('Build 額度暫無資料')).toBeInTheDocument()
    expect(summary.getByLabelText('Imagine 額度暫無資料')).toBeInTheDocument()
    expect(summary.getByLabelText('API 額度暫無資料')).toBeInTheDocument()
    expect(screen.queryByLabelText('Build 已使用 0%')).not.toBeInTheDocument()
  })

  it('T-Billing-1: unified weekly account with empty productUsage shows total + notice + em dashes', async () => {
    const user = userEvent.setup()
    render(<QuotaRings billing={{
      creditUsagePercent: 42,
      isUnifiedBillingUser: true,
      productUsage: [],
      billingPeriodEnd: '2026-07-17T02:38:18Z'
    }} now={new Date('2026-07-12T02:38:18Z')} />)

    const summary = within(screen.getByTestId('quota-summary'))
    expect(summary.getByLabelText('總額度已使用 42%')).toBeInTheDocument()
    expect(summary.getByLabelText('Build 額度暫無資料')).toBeInTheDocument()
    expect(summary.getByLabelText('Imagine 額度暫無資料')).toBeInTheDocument()
    expect(summary.getByLabelText('API 額度暫無資料')).toBeInTheDocument()
    expect(screen.queryByLabelText('Build 已使用 0%')).not.toBeInTheDocument()

    await user.hover(screen.getByTestId('quota-reactor'))
    const notice = screen.getByTestId('unified-billing-notice')
    expect(notice).toHaveTextContent('統一週額度')
    expect(notice).toHaveTextContent('Build')
    expect(notice).toHaveTextContent('Imagine（Image）')
    expect(notice).toHaveTextContent('API')
    expect(notice).toHaveTextContent('並非讀取失敗')
  })

  it('T-Billing-2: productUsage present wins over isUnifiedBillingUser — no main unified notice', async () => {
    const user = userEvent.setup()
    render(<QuotaRings billing={{
      creditUsagePercent: 79,
      isUnifiedBillingUser: true,
      productUsage: [
        { product: 'GrokBuild', usagePercent: 50 },
        { product: 'GrokImagine', usagePercent: 23 },
        { product: 'Api', usagePercent: 6 }
      ]
    }} />)

    expect(screen.getByLabelText('Build 已使用 50%')).toBeInTheDocument()
    await user.hover(screen.getByTestId('quota-reactor'))
    expect(screen.queryByTestId('unified-billing-notice')).not.toBeInTheDocument()
  })

  it('T-Billing-3: partial productUsage shows real % and — without main banner', async () => {
    const user = userEvent.setup()
    render(<QuotaRings billing={{
      creditUsagePercent: 60,
      isUnifiedBillingUser: true,
      productUsage: [{ product: 'GrokBuild', usagePercent: 33 }]
    }} />)

    const summary = within(screen.getByTestId('quota-summary'))
    expect(summary.getByLabelText('Build 已使用 33%')).toBeInTheDocument()
    expect(summary.getByLabelText('Imagine 額度暫無資料')).toBeInTheDocument()
    expect(summary.getByLabelText('API 額度暫無資料')).toBeInTheDocument()
    await user.hover(screen.getByTestId('quota-reactor'))
    expect(screen.queryByTestId('unified-billing-notice')).not.toBeInTheDocument()
  })
})
