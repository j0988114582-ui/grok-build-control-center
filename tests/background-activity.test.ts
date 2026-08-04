import { describe, expect, it } from 'vitest'
import type { UiSessionEvent } from '../src/shared/types'
import {
  activityStatusLabel,
  deriveBackgroundActivity,
  formatLoopCommand,
  formatSchedulerDeletePrompt,
  formatTokenCount,
  normalizeActivityStatus
} from '../src/shared/background-activity'

/** The fully-merged event a real `/loop 15s echo …` capture produces for its scheduler_create
 *  toolCallId (see tests/event-adapter.test.ts and tests/session-state.test.ts for the raw
 *  per-update fixtures this collapses from). */
const schedulerCreateRunningEvent: UiSessionEvent = {
  id: 'e1',
  sessionId: 's1',
  kind: 'tool',
  toolCallId: 'call-0dd47cf8-9112-45b5-b7bb-00b3ee434628-0',
  title: 'Create scheduled task (every 60s)',
  status: 'completed',
  toolName: 'scheduler_create',
  rawInput: { variant: 'SchedulerCreate', interval: '60s', recurring: true, fire_immediately: true },
  rawOutput: { type: 'SchedulerCreate', id: '019fc84ace8a', humanSchedule: 'every 1 minute', updated: false }
}

/** get_command_or_subagent_output — a real control/query call captured checking on the loop's
 *  first tick; must never appear as its own entity in the derived list. */
const getOutputControlEvent: UiSessionEvent = {
  id: 'e2',
  sessionId: 's1',
  kind: 'tool',
  toolCallId: 'call-3d8becd4-d14b-4848-b90e-77b7aa9a1428-1',
  title: '[subagent:general-purpose] loop: You are a detached loop probe… (every 1 minute) (019fc84a)',
  status: 'completed',
  toolName: 'get_command_or_subagent_output',
  rawInput: { variant: 'TaskOutput', task_ids: ['019fc84a-ce8b-7690-b590-a440ec43d6c2'] },
  rawOutput: { type: 'TaskOutput', Result: { task_id: '019fc84a-ce8b-7690-b590-a440ec43d6c2', status: 'completed' } }
}

describe('deriveBackgroundActivity — real scheduler_create capture', () => {
  it('shows a completed scheduler_create as a running recurring loop, not "done"', () => {
    const [entry] = deriveBackgroundActivity([schedulerCreateRunningEvent])
    expect(entry.status).toBe('running')
    expect(entry.statusLabel).toContain('every 1 minute')
    expect(entry.statusLabel).not.toBe('已完成')
  })

  it('matches by exact toolName, not by title substring (no more false positives/negatives)', () => {
    // False positive the old title-substring heuristic had: an unrelated tool call whose
    // human title happens to contain "workflow" as an ordinary English word.
    const readWorkflowFile: UiSessionEvent = {
      id: 'e3', sessionId: 's1', kind: 'tool', toolCallId: 'read-1',
      title: 'Read .github/workflows/ci.yml', status: 'completed'
      // no toolName — this tool call never carried _meta['x.ai/tool'] in the capture
    }
    expect(deriveBackgroundActivity([readWorkflowFile])).toEqual([])

    // False negative the old heuristic had: title fully mutated away from the raw tool name.
    const humanizedTitleOnly: UiSessionEvent = {
      id: 'e4', sessionId: 's1', kind: 'tool', toolCallId: 'call-x',
      title: 'Create scheduled task (every 60s)', status: 'completed', toolName: 'scheduler_create',
      rawOutput: { type: 'SchedulerCreate', id: 'abc123' }
    }
    expect(deriveBackgroundActivity([humanizedTitleOnly])).toHaveLength(1)
  })

  it('excludes control/query calls (scheduler_delete, scheduler_list, get_command_or_subagent_output, kill_command_or_subagent) from the entity list', () => {
    const entries = deriveBackgroundActivity([getOutputControlEvent])
    expect(entries).toEqual([])
  })

  it('a running scheduler_create carries a scheduler_delete stopAction with the real id', () => {
    const [entry] = deriveBackgroundActivity([schedulerCreateRunningEvent])
    expect(entry.stopAction).toEqual({ kind: 'scheduler_delete', schedulerId: '019fc84ace8a' })
    expect(entry.detail).toContain('019fc84ace8a')
  })

  it('a scheduler_create still pending (no rawOutput yet) is running but not stoppable (no id to delete)', () => {
    const pending: UiSessionEvent = {
      id: 'e5', sessionId: 's1', kind: 'tool', toolCallId: 'call-y',
      title: 'scheduler_create', status: 'pending', toolName: 'scheduler_create',
      rawInput: { interval: '60s' }
    }
    const [entry] = deriveBackgroundActivity([pending])
    expect(entry.status).toBe('running')
    expect(entry.stopAction).toBeUndefined()
  })

  it('subagent and task entries never get a stopAction (no verified per-id stop mechanism)', () => {
    const events: UiSessionEvent[] = [
      { id: '1', sessionId: 's', kind: 'subagent', subagentId: 'a1', description: 'Review PR', status: 'running' },
      { id: '2', sessionId: 's', kind: 'task', taskId: 't1', description: 'npm run build', status: 'running' }
    ]
    for (const entry of deriveBackgroundActivity(events)) {
      expect(entry.stopAction).toBeUndefined()
    }
  })

  it('ignores unrelated event kinds and plain tool calls without a recognized toolName', () => {
    const events: UiSessionEvent[] = [
      { id: '1', sessionId: 's', kind: 'message', role: 'assistant', text: 'hi' },
      { id: '2', sessionId: 's', kind: 'tool', toolCallId: 'edit-1', title: 'Edit src/App.tsx', status: 'completed' }
    ]
    expect(deriveBackgroundActivity(events)).toEqual([])
  })

  it('preserves chronological input order (caller decides display order)', () => {
    const events: UiSessionEvent[] = [
      { id: '1', sessionId: 's', kind: 'task', taskId: 't1', description: 'first', status: 'running' },
      { id: '2', sessionId: 's', kind: 'task', taskId: 't2', description: 'second', status: 'running' }
    ]
    expect(deriveBackgroundActivity(events).map((entry) => entry.title)).toEqual(['first', 'second'])
  })
})

describe('normalizeActivityStatus / activityStatusLabel', () => {
  it('buckets pending/in_progress/running as running', () => {
    expect(normalizeActivityStatus('pending')).toBe('running')
    expect(normalizeActivityStatus('in_progress')).toBe('running')
    expect(normalizeActivityStatus('RUNNING')).toBe('running')
  })

  it('buckets completed-like words as done', () => {
    expect(normalizeActivityStatus('completed')).toBe('done')
    expect(normalizeActivityStatus('success')).toBe('done')
  })

  it('buckets failed/cancelled as failed', () => {
    expect(normalizeActivityStatus('failed')).toBe('failed')
    expect(normalizeActivityStatus('cancelled')).toBe('failed')
  })

  it('R2 fix: an unrecognized status word lands in the neutral "unknown" bucket, not green "done"', () => {
    expect(normalizeActivityStatus('some_future_status')).toBe('unknown')
    expect(activityStatusLabel('some_future_status')).toBe('some_future_status')
  })

  it('renders Chinese labels for known words', () => {
    expect(activityStatusLabel('running')).toBe('執行中')
    expect(activityStatusLabel('failed')).toBe('失敗')
    expect(activityStatusLabel('cancelled')).toBe('已取消')
  })
})

describe('formatLoopCommand', () => {
  it('formats interval + prompt per the CLI inputHint "[interval] <prompt>"', () => {
    expect(formatLoopCommand('5m', 'watch the build')).toBe('/loop 5m watch the build')
  })

  it('omits the interval segment when left blank (interval is optional)', () => {
    expect(formatLoopCommand('', 'watch the build')).toBe('/loop watch the build')
    expect(formatLoopCommand('   ', 'watch the build')).toBe('/loop watch the build')
  })

  it('returns an empty string when the prompt is blank, regardless of interval', () => {
    expect(formatLoopCommand('5m', '  ')).toBe('')
    expect(formatLoopCommand('', '')).toBe('')
  })

  it('trims surrounding whitespace from both fields', () => {
    expect(formatLoopCommand('  5m  ', '  watch the build  ')).toBe('/loop 5m watch the build')
  })
})

describe('formatSchedulerDeletePrompt', () => {
  it('builds a natural-language instruction naming the exact scheduler id (agent tool, not a slash command)', () => {
    const text = formatSchedulerDeletePrompt('019fc84ace8a')
    expect(text).toContain('scheduler_delete')
    expect(text).toContain('019fc84ace8a')
    expect(text.startsWith('/')).toBe(false)
  })
})

describe('formatTokenCount', () => {
  it('renders an em dash for undefined', () => {
    expect(formatTokenCount(undefined)).toBe('—')
  })

  it('renders raw numbers under 1000 verbatim', () => {
    expect(formatTokenCount(420)).toBe('420')
  })

  it('renders one decimal of k below 100k and none at/above it', () => {
    expect(formatTokenCount(1500)).toBe('1.5k')
    expect(formatTokenCount(186783)).toBe('187k')
  })
})
