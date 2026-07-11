// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelPicker } from '../src/renderer/src/components/ModelPicker'
import type { ModelState } from '../src/shared/types'

const models: ModelState = {
  currentModelId: 'grok-4.5',
  availableModels: [
    { modelId: 'grok-4.5', name: 'Grok 4.5', description: 'Deep reasoning model', totalContextTokens: 500000, currentReasoningEffort: 'high', reasoningEfforts: [{ id: 'high', value: 'high', label: 'High', default: true }] },
    { modelId: 'grok-composer', name: 'Composer Fast', description: 'Fast coding model', totalContextTokens: 200000, reasoningEfforts: [] }
  ]
}

describe('ModelPicker', () => {
  afterEach(cleanup)

  it('shows model details and selects the next model with the keyboard', async () => {
    const onModelChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelPicker models={models} onModelChange={onModelChange} onEffortChange={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /模型：Grok 4.5/ })
    trigger.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(screen.getByText('Fast coding model')).toBeInTheDocument()
    expect(screen.getByText('200k context')).toBeInTheDocument()
    expect(onModelChange).toHaveBeenCalledWith('grok-composer')
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

    await user.click(screen.getByRole('radio', { name: 'Low' }))

    expect(screen.getByRole('radiogroup', { name: '推理強度' })).toBeInTheDocument()
    expect(onEffortChange).toHaveBeenCalledWith('low')
  })
})
