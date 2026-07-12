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
    expect(summary.getByLabelText('Build 額度暫無資料')).toHaveAttribute('title', '服務未提供此項額度')
    expect(summary.getByLabelText('Imagine 額度暫無資料')).toHaveAttribute('title', '服務未提供此項額度')
    expect(summary.getByLabelText('API 額度暫無資料')).toHaveAttribute('title', '服務未提供此項額度')
    expect(screen.queryByLabelText('Build 已使用 0%')).not.toBeInTheDocument()
  })
})
