// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelPicker } from '../src/renderer/src/components/ModelPicker'
import type { ModelState } from '../src/shared/types'

const models: ModelState = {
  currentModelId: 'grok-4.6',
  availableModels: [
    { modelId: 'grok-4.6', name: 'Grok 4.6', description: "SpaceXAI's latest frontier model", totalContextTokens: 500000, currentReasoningEffort: 'high', reasoningEfforts: [{ id: 'xhigh', value: 'xhigh', label: 'Extra High', default: true }, { id: 'high', value: 'high', label: 'High', default: true }] },
    { modelId: 'grok-4.5', name: 'Grok 4.5', description: 'Previous frontier model', totalContextTokens: 500000, currentReasoningEffort: 'high', reasoningEfforts: [{ id: 'high', value: 'high', label: 'High', default: true }] }
  ]
}

describe('ModelPicker', () => {
  afterEach(cleanup)

  it('shows model details and selects the next model with the keyboard', async () => {
    const onModelChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelPicker models={models} onModelChange={onModelChange} onEffortChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /模型：Grok 4.6/ })
    trigger.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(screen.getByText('Previous frontier model')).toBeInTheDocument()
    expect(screen.getByText('500k 上下文')).toBeInTheDocument()
    expect(onModelChange).toHaveBeenCalledWith('grok-4.5')
  })

  it('exposes reasoning effort as an accessible choice', async () => {
    const onEffortChange = vi.fn()
    const user = userEvent.setup()
    const effortModels: ModelState = {
      ...models,
      availableModels: [{ ...models.availableModels[0], reasoningEfforts: [
        { id: 'low', value: 'low', label: 'Low' },
        { id: 'high', value: 'high', label: 'High', default: true }
      ] }]
    }
    render(<ModelPicker models={effortModels} onModelChange={vi.fn()} onEffortChange={onEffortChange} />)

    await user.click(screen.getByRole('radio', { name: '快速' }))

    expect(screen.getByRole('radiogroup', { name: '推理強度' })).toBeInTheDocument()
    expect(onEffortChange).toHaveBeenCalledWith('low')
  })

  it('localizes high/medium/low effort and leaves unknown values as-is', () => {
    const effortModels: ModelState = {
      ...models,
      availableModels: [{ ...models.availableModels[0], reasoningEfforts: [
        { id: 'low', value: 'low', label: 'Low' },
        { id: 'medium', value: 'medium', label: 'Medium' },
        { id: 'high', value: 'high', label: 'High', default: true },
        { id: 'xhigh', value: 'xhigh', label: 'Extra High' }
      ] }]
    }
    render(<ModelPicker models={effortModels} onModelChange={vi.fn()} onEffortChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: '快速' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '一般' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '深想' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Extra High' })).toBeInTheDocument()
  })
})
