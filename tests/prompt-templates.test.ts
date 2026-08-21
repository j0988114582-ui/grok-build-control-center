import { describe, expect, it } from 'vitest'
import {
  findPromptTemplate,
  orderPromptTemplates,
  PROMPT_TEMPLATES,
  rememberPromptTemplate
} from '../src/shared/prompt-templates'

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

  it('remembers last-used ids most-recent-first and ignores unknown ids', () => {
    expect(rememberPromptTemplate([], 'plan')).toEqual(['plan'])
    expect(rememberPromptTemplate(['plan', 'fix'], 'test')).toEqual(['test', 'plan', 'fix'])
    expect(rememberPromptTemplate(['plan', 'fix'], 'plan')).toEqual(['plan', 'fix'])
    expect(rememberPromptTemplate(['plan'], 'missing')).toEqual(['plan'])
  })

  it('orders last-used templates in front of the built-in list', () => {
    const ordered = orderPromptTemplates(['plan', 'test', 'missing'])
    expect(ordered.map((item) => item.id)).toEqual(['plan', 'test', ...PROMPT_TEMPLATES.map((item) => item.id).filter((id) => id !== 'plan' && id !== 'test')])
    expect(orderPromptTemplates().map((item) => item.id)).toEqual(PROMPT_TEMPLATES.map((item) => item.id))
  })
})
