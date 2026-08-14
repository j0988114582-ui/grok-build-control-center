import { describe, expect, it } from 'vitest'
import {
  formatRunningSubagentDetail,
  mergeRunningSubagents,
  parseRunningSubagents,
  SUBAGENT_LIST_RUNNING_METHOD,
  type RunningSubagent
} from '../src/shared/subagent-roster'
import type { BackgroundActivityEntry } from '../src/shared/background-activity'

/** Verbatim entry captured from grok 1.0.3 by work/subagent_list_probe.mjs. */
const LIVE_ENTRY = {
  subagentId: '019f0000-0000-7000-8000-00000000c0de',
  parentSessionId: '019f0000-0000-7000-8000-00000000a000',
  childSessionId: '019f0000-0000-7000-8000-00000000c0de',
  subagentType: 'general-purpose',
  description: '撰寫版本控制短文',
  startedAtEpochMs: 1786676836587,
  durationMs: 1352,
  turnCount: 1,
  toolCallCount: 0,
  tokensUsed: 2007,
  contextWindowTokens: 500000,
  contextUsagePct: 0,
  toolsUsed: [],
  errorCount: 0
}

const entry = (over: Partial<BackgroundActivityEntry> & { id: string }): BackgroundActivityEntry => ({
  sessionId: 'parent',
  source: 'subagent',
  name: 'spawn_subagent',
  kindLabel: '子代理',
  title: over.title ?? '子代理',
  status: 'unknown',
  statusLabel: '狀態未知',
  loopLike: false,
  event: { id: over.id, sessionId: 'parent', kind: 'subagent', subagentId: over.id, description: over.title ?? '子代理', status: 'unknown' },
  ...over
})

describe('subagent roster (_x.ai/subagent/list_running)', () => {
  it('uses the underscore-prefixed extension method', () => {
    expect(SUBAGENT_LIST_RUNNING_METHOD).toBe('_x.ai/subagent/list_running')
  })

  it('parses the live ext-method envelope', () => {
    const parsed = parseRunningSubagents({ result: { subagents: [LIVE_ENTRY] } })
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0]).toMatchObject({
      subagentId: LIVE_ENTRY.subagentId,
      childSessionId: LIVE_ENTRY.childSessionId,
      subagentType: 'general-purpose',
      description: '撰寫版本控制短文',
      turnCount: 1,
      tokensUsed: 2007
    })
  })

  it('accepts the unwrapped form and an empty roster', () => {
    expect(parseRunningSubagents({ subagents: [LIVE_ENTRY] })).toHaveLength(1)
    expect(parseRunningSubagents({ result: { subagents: [] } })).toEqual([])
  })

  /** null and [] mean different things: "no answer" vs "nothing running". */
  it('returns null when there is no usable answer', () => {
    for (const bad of [null, undefined, 'nope', [], {}, { result: {} }, { subagents: 'no' }]) {
      expect(parseRunningSubagents(bad)).toBeNull()
    }
    expect(parseRunningSubagents({ subagents: [] })).toEqual([])
  })

  it('skips entries with no id rather than inventing one', () => {
    expect(parseRunningSubagents({ subagents: [{ description: 'orphan' }, LIVE_ENTRY] })).toHaveLength(1)
  })

  it('formats a one-line detail', () => {
    expect(formatRunningSubagentDetail(parseRunningSubagents({ subagents: [LIVE_ENTRY] })![0]))
      .toBe('general-purpose · 1 輪 · 0 次工具 · 2.0k tokens')
  })

  describe('merge', () => {
    const running: RunningSubagent[] = parseRunningSubagents({ subagents: [LIVE_ENTRY] })!

    it('leaves everything alone when there is no roster (fallback to inference)', () => {
      const derived = [entry({ id: 'a', status: 'running', statusLabel: '執行中' })]
      expect(mergeRunningSubagents(derived, null, 'parent')).toEqual(derived)
    })

    it('upgrades a matching card to the official running status', () => {
      const derived = [entry({ id: LIVE_ENTRY.subagentId, title: '撰寫版本控制短文' })]
      const merged = mergeRunningSubagents(derived, running, 'parent')
      expect(merged).toHaveLength(1)
      expect(merged[0].status).toBe('running')
      expect(merged[0].statusLabel).toBe('執行中（官方回報）')
      expect(merged[0].detail).toContain('general-purpose')
    })

    it('adds a card for a child the event stream never mentioned', () => {
      const merged = mergeRunningSubagents([], running, 'parent')
      expect(merged).toHaveLength(1)
      expect(merged[0].title).toBe('撰寫版本控制短文')
      expect(merged[0].source).toBe('subagent')
      expect(merged[0].status).toBe('running')
    })

    it('keeps one card per subagent instead of duplicating', () => {
      const derived = [entry({ id: LIVE_ENTRY.childSessionId })]
      expect(mergeRunningSubagents(derived, running, 'parent')).toHaveLength(1)
    })

    /** A snapshot between polls must never be read as "it finished". */
    it('never downgrades a card that is missing from the roster', () => {
      const derived = [entry({ id: 'other', status: 'running', statusLabel: '執行中' })]
      const merged = mergeRunningSubagents(derived, [], 'parent')
      expect(merged).toHaveLength(1)
      expect(merged[0].status).toBe('running')
      expect(merged[0].statusLabel).toBe('執行中')
    })

    it('does not touch non-subagent entries', () => {
      const scheduler = entry({ id: 's', source: 'tool', name: 'scheduler_create', title: '排程', status: 'done', statusLabel: '完成' })
      const merged = mergeRunningSubagents([scheduler], running, 'parent')
      expect(merged[0]).toEqual(scheduler)
      expect(merged).toHaveLength(2)
    })
  })
})
