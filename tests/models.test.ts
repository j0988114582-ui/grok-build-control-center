import { describe, expect, it } from 'vitest'
import { normalizeModelState } from '../src/main/acp-client'

describe('normalizeModelState', () => {
  it('normalizes the Grok model-picker ACP extension', () => {
    expect(normalizeModelState({ currentModelId: 'grok-4.6', availableModels: [{
      modelId: 'grok-4.6', name: 'Grok 4.6', description: "SpaceXAI's latest frontier model",
      _meta: { reasoningEffort: 'high', totalContextTokens: 500000, reasoningEfforts: [{ id: 'xhigh', value: 'xhigh', label: 'Extra High Effort', default: true }, { id: 'high', value: 'high', label: 'High Effort', default: true }] }
    }] })).toEqual({ currentModelId: 'grok-4.6', availableModels: [{
      modelId: 'grok-4.6', name: 'Grok 4.6', description: "SpaceXAI's latest frontier model", currentReasoningEffort: 'high', totalContextTokens: 500000,
      reasoningEfforts: [{ id: 'xhigh', value: 'xhigh', label: 'Extra High Effort', default: true }, { id: 'high', value: 'high', label: 'High Effort', default: true }]
    }] })
  })
})
