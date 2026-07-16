import { describe, expect, it } from 'vitest'
import { findPromptTemplate, PROMPT_TEMPLATES } from '../src/shared/prompt-templates'

describe('prompt-templates', () => {
  it('ships at least three zh templates with bodies', () => {
    expect(PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(3)
    for (const item of PROMPT_TEMPLATES) {
      expect(item.id).toBeTruthy()
      expect(item.label).toBeTruthy()
      expect(item.body.trim().length).toBeGreaterThan(4)
    }
  })

  it('finds templates by id', () => {
    expect(findPromptTemplate('plan')?.label).toBe('先做計畫')
    expect(findPromptTemplate('missing')).toBeUndefined()
  })
})
