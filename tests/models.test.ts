import { describe, expect, it } from 'vitest'
import { normalizeModelState } from '../src/main/acp-client'

describe('normalizeModelState', () => {
  it('normalizes the Grok model-picker ACP extension', () => {
    expect(normalizeModelState({ currentModelId: 'grok-4.5', availableModels: [{
      modelId: 'grok-4.5', name: 'Grok 4.5', description: 'Frontier model',
      _meta: { reasoningEffort: 'high', reasoningEfforts: [{ id: 'high', value: 'high', label: 'High Effort', default: true }] }
    }] })).toEqual({ currentModelId: 'grok-4.5', availableModels: [{
      modelId: 'grok-4.5', name: 'Grok 4.5', description: 'Frontier model', currentReasoningEffort: 'high',
      reasoningEfforts: [{ id: 'high', value: 'high', label: 'High Effort', default: true }]
    }] })
  })
})
