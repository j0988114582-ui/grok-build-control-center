import { describe, expect, it } from 'vitest'
import { normalizeCapabilities } from '../src/main/acp-client'

describe('normalizeCapabilities', () => {
  it('defaults unsupported optional features to safe values', () => {
    expect(normalizeCapabilities({ loadSession: true, promptCapabilities: { image: true }, sessionCapabilities: { list: true } })).toEqual({
      loadSession: true,
      promptCapabilities: { image: true },
      sessionCapabilities: { list: true },
      modes: [],
      commands: []
    })
  })
})
