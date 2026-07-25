import { describe, expect, it } from 'vitest'
import { collectPromptBookmarks } from '../src/shared/prompt-bookmarks'
import type { UiSessionEvent } from '../src/shared/types'

const userMessage = (id: string, text: string): UiSessionEvent => ({ id, sessionId: 's1', kind: 'message', role: 'user', text })
const assistantMessage = (id: string, text: string): UiSessionEvent => ({ id, sessionId: 's1', kind: 'message', role: 'assistant', text })
const tool = (id: string): UiSessionEvent => ({ id, sessionId: 's1', kind: 'tool', toolCallId: id, title: 'Read file', status: 'completed' })

describe('prompt bookmarks (P-BOOKMARK)', () => {
  it('lists only the prompts I sent, in the order I sent them', () => {
    const events = [userMessage('a', '第一個任務'), assistantMessage('b', '好的'), tool('c'), userMessage('d', '第二個任務')]
    expect(collectPromptBookmarks(events).map((item) => [item.ordinal, item.id, item.label]))
      .toEqual([[1, 'a', '第一個任務'], [2, 'd', '第二個任務']])
  })

  it('carries the transcript event id so the jump can target it directly', () => {
    const events = [userMessage('evt-42', '幫我改首頁')]
    expect(collectPromptBookmarks(events)[0].id).toBe('evt-42')
  })

  it('flattens newlines so a multi-line prompt stays one readable row', () => {
    const events = [userMessage('a', '第一行\n\n  第二行\t第三行  ')]
    expect(collectPromptBookmarks(events)[0].label).toBe('第一行 第二行 第三行')
  })

  it('truncates long prompts with an ellipsis', () => {
    const events = [userMessage('a', 'x'.repeat(200))]
    const label = collectPromptBookmarks(events)[0].label
    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBeLessThanOrEqual(53)
  })

  it('skips whitespace-only prompts rather than listing blank rows', () => {
    const events = [userMessage('a', '   \n  '), userMessage('b', '真正的指令')]
    expect(collectPromptBookmarks(events).map((item) => item.id)).toEqual(['b'])
  })

  it('numbers ordinals by position among prompts, not among all events', () => {
    const events = [tool('t1'), userMessage('a', '一'), tool('t2'), assistantMessage('r', '答'), userMessage('b', '二')]
    expect(collectPromptBookmarks(events).map((item) => item.ordinal)).toEqual([1, 2])
  })

  it('returns an empty list for a conversation with no prompts yet', () => {
    expect(collectPromptBookmarks([assistantMessage('b', '你好')])).toEqual([])
    expect(collectPromptBookmarks([])).toEqual([])
  })
})
