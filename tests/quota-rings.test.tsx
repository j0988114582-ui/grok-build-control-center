// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
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
  it('renders total and GrokBuild reactor rings with a reset countdown', async () => {
    const user = userEvent.setup()
    render(<QuotaRings billing={billing} now={new Date('2026-07-12T02:38:18Z')} />)

    expect(screen.getByLabelText('總額度已使用 79%')).toBeInTheDocument()
    expect(screen.getByLabelText('GrokBuild 已使用 50%')).toBeInTheDocument()
    expect(screen.getByText('7/17 重置 · 剩 5 天')).toBeInTheDocument()

    await user.hover(screen.getByTestId('quota-reactor'))
    expect(screen.getByText('WEEKLY')).toBeInTheDocument()
    expect(screen.getByText('GrokImagine')).toBeInTheDocument()
    expect(screen.getByText('API')).toBeInTheDocument()
  })

  it('renders a non-blocking unavailable state', () => {
    render(<QuotaRings billing={null} unavailable />)
    expect(screen.getByText('額度資料暫不可用')).toBeInTheDocument()
  })

  it('does not misreport missing product usage as zero percent', () => {
    render(<QuotaRings billing={{ creditUsagePercent: 79, productUsage: [] }} />)
    expect(screen.getByLabelText('GrokBuild 額度暫無資料')).toBeInTheDocument()
    expect(screen.queryByLabelText('GrokBuild 已使用 0%')).not.toBeInTheDocument()
  })
})
