import { describe, expect, it } from 'vitest'
import type { UiSessionEvent } from '../src/shared/types'
import {
  activityStatusLabel,
  deriveBackgroundActivity,
  formatDeepResearchCommand,
  formatGoalCommand,
  formatLoopCommand,
  formatSchedulerDeletePrompt,
  formatTokenCount,
  formatWorkflowCommand,
  normalizeActivityStatus
} from '../src/shared/background-activity'

/** The fully-merged event a real `/loop 15s echo …` capture produces for its scheduler_create
 *  toolCallId (see tests/event-adapter.test.ts and tests/session-state.test.ts for the raw
 *  per-update fixtures this collapses from). */
const schedulerCreateRunningEvent: UiSessionEvent = {
  id: 'e1',
  sessionId: 's1',
  kind: 'tool',
  toolCallId: 'call-00000000-0000-4000-8000-000000000003-0',
  title: 'Create scheduled task (every 60s)',
  status: 'completed',
  toolName: 'scheduler_create',
  rawInput: { variant: 'SchedulerCreate', interval: '60s', recurring: true, fire_immediately: true },
  rawOutput: { type: 'SchedulerCreate', id: '019f00000001', humanSchedule: 'every 1 minute', updated: false }
}

/** get_command_or_subagent_output — a real control/query call captured checking on the loop's
 *  first tick; must never appear as its own entity in the derived list. */
const getOutputControlEvent: UiSessionEvent = {
  id: 'e2',
  sessionId: 's1',
  kind: 'tool',
  toolCallId: 'call-00000000-0000-4000-8000-000000000004-1',
  title: '[subagent:general-purpose] loop: You are a detached loop probe… (every 1 minute) (019fc84a)',
  status: 'completed',
  toolName: 'get_command_or_subagent_output',
  rawInput: { variant: 'TaskOutput', task_ids: ['019f0000-0000-7000-8000-000000000005'] },
  rawOutput: { type: 'TaskOutput', Result: { task_id: '019f0000-0000-7000-8000-000000000005', status: 'completed' } }
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
    expect(entry.stopAction).toEqual({ kind: 'scheduler_delete', schedulerId: '019f00000001' })
    expect(entry.detail).toContain('019f00000001')
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

describe('deriveBackgroundActivity — spawn_subagent lifecycle', () => {
  const spawnCompleted: UiSessionEvent = {
    id: 'spawn-1',
    sessionId: 's1',
    kind: 'tool',
    toolCallId: 'call-spawn',
    title: 'Review the PR',
    status: 'completed',
    toolName: 'spawn_subagent',
    rawInput: { description: 'Review the PR' },
    rawOutput: { child_session_id: 'child-9' }
  }

  it('shows a completed spawn_subagent as 執行中, not 已完成', () => {
    const [entry] = deriveBackgroundActivity([spawnCompleted])
    expect(entry.status).toBe('running')
    expect(entry.statusLabel).toBe('執行中')
    expect(entry.statusLabel).not.toBe('已完成')
  })

  it('keeps a failed/cancelled spawn as failed', () => {
    const failed: UiSessionEvent = { ...spawnCompleted, status: 'failed' }
    const cancelled: UiSessionEvent = { ...spawnCompleted, id: 'spawn-2', toolCallId: 'call-2', status: 'cancelled' }
    expect(deriveBackgroundActivity([failed])[0].status).toBe('failed')
    expect(deriveBackgroundActivity([cancelled])[0].status).toBe('failed')
    expect(deriveBackgroundActivity([cancelled])[0].statusLabel).toBe('已取消')
  })

  it('TaskOutput completed updates the matching spawn to done and is not its own card', () => {
    const taskOutput: UiSessionEvent = {
      id: 'out-1',
      sessionId: 's1',
      kind: 'tool',
      toolCallId: 'call-out',
      title: 'get_command_or_subagent_output',
      status: 'completed',
      toolName: 'get_command_or_subagent_output',
      rawInput: { variant: 'TaskOutput', task_ids: ['child-9'] },
      rawOutput: { type: 'TaskOutput', Result: { task_id: 'child-9', status: 'completed' } },
      output: 'child finished'
    }
    const entries = deriveBackgroundActivity([spawnCompleted, taskOutput])
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('done')
    expect(entries[0].statusLabel).toBe('已完成')
    expect(entries[0].output).toBe('child finished')
    expect(entries[0].event).toMatchObject({ output: 'child finished' })
  })

  it('unmatched TaskOutput does not invent success — spawn stays running and control tools stay hidden', () => {
    const entries = deriveBackgroundActivity([spawnCompleted, getOutputControlEvent])
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('running')
    expect(entries[0].name).toBe('spawn_subagent')
  })

  it('merges spawn tool + subagent finish into one card; subagent wins status, tool keeps the human title', () => {
    const finish: UiSessionEvent = {
      id: 'sub-1',
      sessionId: 's1',
      kind: 'subagent',
      subagentId: 'child-9',
      description: 'Subagent',
      status: 'completed',
      output: 'review notes'
    }
    const entries = deriveBackgroundActivity([spawnCompleted, finish])
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('done')
    expect(entries[0].title).toBe('Review the PR')
    expect(entries[0].output).toBe('review notes')
    expect(entries[0].source).toBe('subagent')
  })

  it('merges spawn + subagent by human title when the spawn tool carries no child id', () => {
    const spawnNoId: UiSessionEvent = {
      id: 'spawn-noid',
      sessionId: 's1',
      kind: 'tool',
      toolCallId: 'call-noid',
      title: 'Count 1 to 8',
      status: 'completed',
      toolName: 'spawn_subagent'
    }
    const finish: UiSessionEvent = {
      id: 'sub-noid',
      sessionId: 's1',
      kind: 'subagent',
      subagentId: 'child-live-1',
      description: 'Count 1 to 8',
      status: 'completed',
      output: '1 2 3 4 5 6 7 8'
    }
    const entries = deriveBackgroundActivity([spawnNoId, finish])
    expect(entries).toHaveLength(1)
    expect(entries[0].status).toBe('done')
    expect(entries[0].title).toBe('Count 1 to 8')
    expect(entries[0].output).toBe('1 2 3 4 5 6 7 8')
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

describe('formatWorkflowCommand (R3)', () => {
  it('formats name only and name + args', () => {
    expect(formatWorkflowCommand('review-changes')).toBe('/workflow review-changes')
    expect(formatWorkflowCommand('review-changes', '--budget 10')).toBe('/workflow review-changes --budget 10')
  })

  it('returns empty string when name is blank, regardless of args', () => {
    expect(formatWorkflowCommand('', 'args')).toBe('')
    expect(formatWorkflowCommand('   ')).toBe('')
  })

  it('omits blank args and trims both fields', () => {
    expect(formatWorkflowCommand('  review-changes  ', '   ')).toBe('/workflow review-changes')
    expect(formatWorkflowCommand('  review-changes  ', '  --budget 10  ')).toBe('/workflow review-changes --budget 10')
  })
})

describe('formatGoalCommand (R3)', () => {
  it('formats objective alone and with a positive-integer budget', () => {
    expect(formatGoalCommand('ship the release')).toBe('/goal ship the release')
    expect(formatGoalCommand('ship the release', '100000')).toBe('/goal ship the release --budget 100000')
  })

  it('returns empty string when objective is blank', () => {
    expect(formatGoalCommand('  ', '100000')).toBe('')
    expect(formatGoalCommand('')).toBe('')
  })

  it('appends --budget only for a valid positive integer (not empty/0/-1/abc)', () => {
    expect(formatGoalCommand('obj', '')).toBe('/goal obj')
    expect(formatGoalCommand('obj', '0')).toBe('/goal obj')
    expect(formatGoalCommand('obj', '-1')).toBe('/goal obj')
    expect(formatGoalCommand('obj', 'abc')).toBe('/goal obj')
    expect(formatGoalCommand('obj', '1.5')).toBe('/goal obj')
    expect(formatGoalCommand('obj', '42')).toBe('/goal obj --budget 42')
  })

  it('trims objective and budget', () => {
    expect(formatGoalCommand('  ship it  ', '  100000  ')).toBe('/goal ship it --budget 100000')
  })
})

describe('formatDeepResearchCommand (R3)', () => {
  it('formats a non-blank query', () => {
    expect(formatDeepResearchCommand('compare ACP event shapes')).toBe('/deep-research compare ACP event shapes')
  })

  it('returns empty string when query is blank', () => {
    expect(formatDeepResearchCommand('')).toBe('')
    expect(formatDeepResearchCommand('   ')).toBe('')
  })

  it('trims surrounding whitespace', () => {
    expect(formatDeepResearchCommand('  compare ACP event shapes  ')).toBe('/deep-research compare ACP event shapes')
  })
})

describe('formatSchedulerDeletePrompt', () => {
  it('builds a natural-language instruction naming the exact scheduler id (agent tool, not a slash command)', () => {
    const text = formatSchedulerDeletePrompt('019f00000001')
    expect(text).toContain('scheduler_delete')
    expect(text).toContain('019f00000001')
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
