// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackgroundTasksPanel } from '../src/renderer/src/components/BackgroundTasksPanel'
import type { BackgroundActivityEntry } from '../src/shared/background-activity'
import type { UiSessionEvent } from '../src/shared/types'

afterEach(cleanup)

const StubEventCard = ({ event }: { event: UiSessionEvent; query: string }): React.JSX.Element => (
  <div data-testid="stub-event-card">
    {event.kind === 'tool' ? event.output ?? 'no-output' : event.kind === 'task' || event.kind === 'subagent' ? event.description : 'n/a'}
  </div>
)

const baseEntry = (over: Partial<BackgroundActivityEntry> = {}): BackgroundActivityEntry => ({
  id: 'e1',
  sessionId: 's1',
  source: 'task',
  name: 'task',
  kindLabel: '背景任務',
  title: 'npm run build --watch',
  status: 'running',
  statusLabel: '執行中',
  loopLike: false,
  event: { id: 'e1', sessionId: 's1', kind: 'task', taskId: 't1', description: 'npm run build --watch', status: 'running' },
  ...over
})

/** A real recurring-loop entry (matches the 2026-08-03 /loop capture): stoppable via scheduler_delete. */
const schedulerEntry = (over: Partial<BackgroundActivityEntry> = {}): BackgroundActivityEntry => baseEntry({
  id: 'sched-1',
  source: 'tool',
  name: 'scheduler_create',
  kindLabel: '建立排程',
  title: 'Create scheduled task (every 60s)',
  status: 'running',
  statusLabel: '執行中（every 1 minute）',
  detail: '排程 ID：019fc84ace8a',
  stopAction: { kind: 'scheduler_delete', schedulerId: '019fc84ace8a' },
  event: {
    id: 'sched-1', sessionId: 's1', kind: 'tool', toolCallId: 'call-0', title: 'Create scheduled task (every 60s)',
    status: 'completed', toolName: 'scheduler_create', rawOutput: { type: 'SchedulerCreate', id: '019fc84ace8a', humanSchedule: 'every 1 minute' }
  },
  ...over
})

function renderPanel(overrides: Partial<React.ComponentProps<typeof BackgroundTasksPanel>> = {}) {
  const onClose = vi.fn()
  const onCreateLoop = vi.fn().mockResolvedValue(undefined)
  const onStop = vi.fn().mockResolvedValue(undefined)
  const props: React.ComponentProps<typeof BackgroundTasksPanel> = {
    entries: [],
    usage: null,
    ready: true,
    running: false,
    loopCommandAvailable: true,
    onClose,
    onCreateLoop,
    onStop,
    EventCard: StubEventCard,
    ...overrides
  }
  render(<BackgroundTasksPanel {...props} />)
  return { onClose, onCreateLoop, onStop }
}

describe('BackgroundTasksPanel', () => {
  it('shows an empty state when there is no background activity', () => {
    renderPanel({ entries: [] })
    expect(screen.getByText(/目前沒有偵測到背景任務/)).toBeInTheDocument()
  })

  it('lists entries with title and status label, most-recent first', () => {
    renderPanel({
      entries: [
        baseEntry({ id: 'e1', title: 'first task', status: 'running', statusLabel: '執行中' }),
        baseEntry({ id: 'e2', title: 'second task', status: 'done', statusLabel: '已完成' })
      ]
    })
    const items = screen.getAllByTestId('bgtasks-item')
    expect(items).toHaveLength(2)
    // most-recent-first: the second (later) entry renders first
    expect(within(items[0]).getByText('second task')).toBeInTheDocument()
    expect(within(items[0]).getByText('已完成')).toBeInTheDocument()
    expect(within(items[1]).getByText('first task')).toBeInTheDocument()
    expect(within(items[1]).getByText('執行中')).toBeInTheDocument()
  })

  it('shows a scheduler entry\'s detail (id + schedule) at a glance, without expanding', () => {
    renderPanel({ entries: [schedulerEntry()] })
    expect(screen.getByText(/排程 ID：019fc84ace8a/)).toBeInTheDocument()
    expect(screen.getByText('執行中（every 1 minute）')).toBeInTheDocument()
  })

  it('labels the expand toggle "事件詳情" when there is no narrative output (e.g. scheduler_create), "查看輸出" when there is', async () => {
    const user = userEvent.setup()
    renderPanel({
      entries: [
        schedulerEntry({ id: 'no-output' }), // event.output is undefined for scheduler_create
        baseEntry({
          id: 'has-output',
          title: 'subagent with output',
          source: 'subagent',
          // `entry.output` (top-level) is what drives the label — set by deriveBackgroundActivity
          // from event.output at real-derive time; set explicitly here since this fixture
          // constructs the BackgroundActivityEntry directly rather than deriving it.
          output: 'result text',
          event: { id: 'has-output', sessionId: 's1', kind: 'subagent', subagentId: 'a1', description: 'subagent with output', status: 'completed', output: 'result text' }
        })
      ]
    })
    const items = screen.getAllByTestId('bgtasks-item')
    const withOutputItem = items.find((item) => item.textContent?.includes('has-output') || item.textContent?.includes('subagent with output'))!
    const noOutputItem = items.find((item) => item.textContent?.includes('Create scheduled task'))!
    expect(within(noOutputItem).getByText('事件詳情')).toBeInTheDocument()
    expect(within(withOutputItem).getByText('查看輸出')).toBeInTheDocument()
    await user.click(within(withOutputItem).getByRole('button', { name: /查看輸出/ }))
    // StubEventCard renders `description` for subagent-kind events; the label decision above
    // (查看輸出 vs 事件詳情) is driven by entry.output, independent of what EventCard shows.
    expect(screen.getByTestId('stub-event-card')).toHaveTextContent('subagent with output')
  })

  it('expands an item to reuse the existing EventCard rendering, and collapses again', async () => {
    const user = userEvent.setup()
    renderPanel({
      entries: [baseEntry({ id: 'e1', title: 'watch build', event: { id: 'e1', sessionId: 's1', kind: 'task', taskId: 't1', description: 'watch build output', status: 'running' } })]
    })
    expect(screen.queryByTestId('stub-event-card')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /watch build/ }))
    expect(screen.getByTestId('stub-event-card')).toHaveTextContent('watch build output')
    await user.click(screen.getByRole('button', { name: /watch build/ }))
    expect(screen.queryByTestId('stub-event-card')).not.toBeInTheDocument()
  })

  it('shows a Stop button only for entries with a known stopAction, names the item and the real scope, and calls onStop with that entry', async () => {
    const user = userEvent.setup()
    const stoppableEntry = schedulerEntry({ id: 'e1', title: 'running loop' })
    const nonStoppableEntry = baseEntry({ id: 'e2', title: 'plain task', status: 'running' }) // no stopAction
    const { onStop } = renderPanel({ entries: [stoppableEntry, nonStoppableEntry] })

    const items = screen.getAllByTestId('bgtasks-item')
    const stoppableItem = items.find((item) => item.textContent?.includes('running loop'))!
    const nonStoppableItem = items.find((item) => item.textContent?.includes('plain task'))!
    const stopButton = within(stoppableItem).getByRole('button', { name: /running loop.*scheduler_delete/ })
    expect(stopButton).toBeInTheDocument()
    expect(within(nonStoppableItem).queryByRole('button', { name: '停止' })).not.toBeInTheDocument()

    await user.click(stopButton)
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledWith(stoppableEntry)
  })

  it('marks a stopped entry as requested and hides the button after a successful stop (does not claim confirmed-stopped)', async () => {
    const user = userEvent.setup()
    renderPanel({ entries: [schedulerEntry()] })
    await user.click(screen.getByRole('button', { name: /停止/ }))
    expect(await screen.findByTestId('bgtasks-stop-requested')).toHaveTextContent('已送出停止請求')
    expect(screen.queryByRole('button', { name: /^停止/ })).not.toBeInTheDocument()
  })

  it('shows a local error and keeps the Stop button when the stop request fails', async () => {
    const user = userEvent.setup()
    const onStop = vi.fn().mockRejectedValue(new Error('這個項目沒有已驗證的停止方式'))
    renderPanel({ entries: [schedulerEntry()], onStop })
    await user.click(screen.getByRole('button', { name: /停止/ }))
    expect(await screen.findByTestId('bgtasks-stop-error')).toHaveTextContent('這個項目沒有已驗證的停止方式')
    expect(screen.getByRole('button', { name: /停止/ })).toBeInTheDocument()
  })

  it('disables Stop while the session is not ready', () => {
    renderPanel({ entries: [schedulerEntry()], ready: false })
    expect(screen.getByRole('button', { name: /停止/ })).toBeDisabled()
  })

  it('previews and submits the formatted /loop command, then clears the prompt field on success', async () => {
    const user = userEvent.setup()
    const { onCreateLoop } = renderPanel()

    await user.type(screen.getByLabelText('間隔（選填）'), '5m')
    await user.type(screen.getByLabelText('提示內容'), 'watch the build')
    expect(screen.getByText('/loop 5m watch the build')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /建立定時任務/ }))
    expect(onCreateLoop).toHaveBeenCalledTimes(1)
    expect(onCreateLoop).toHaveBeenCalledWith('/loop 5m watch the build')
    await waitFor(() => expect(screen.getByLabelText('提示內容')).toHaveValue(''))
  })

  it('shows a local error and keeps the typed prompt when loop creation fails (never touches the composer)', async () => {
    const user = userEvent.setup()
    const onCreateLoop = vi.fn().mockRejectedValue(new Error('回合執行中，請待完成後再試'))
    renderPanel({ onCreateLoop })
    await user.type(screen.getByLabelText('提示內容'), 'watch the build')
    await user.click(screen.getByRole('button', { name: /建立定時任務/ }))
    expect(await screen.findByTestId('bgtasks-loop-error')).toHaveTextContent('回合執行中，請待完成後再試')
    expect(screen.getByLabelText('提示內容')).toHaveValue('watch the build')
  })

  it('omits the interval when left blank', async () => {
    const user = userEvent.setup()
    const { onCreateLoop } = renderPanel()
    await user.type(screen.getByLabelText('提示內容'), 'watch the build')
    await user.click(screen.getByRole('button', { name: /建立定時任務/ }))
    expect(onCreateLoop).toHaveBeenCalledWith('/loop watch the build')
  })

  it('keeps the create button disabled with an empty prompt', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /建立定時任務/ })).toBeDisabled()
  })

  it('disables the whole loop form and explains why when the session is not ready', () => {
    renderPanel({ ready: false })
    expect(screen.getByLabelText('間隔（選填）')).toBeDisabled()
    expect(screen.getByLabelText('提示內容')).toBeDisabled()
    expect(screen.getByText('此對話尚未就緒，無法建立')).toBeInTheDocument()
  })

  it('disables loop creation AND the Stop button while a turn is running (M1: scheduler_delete needs an idle turn)', () => {
    renderPanel({ ready: true, running: true, entries: [schedulerEntry()] })
    expect(screen.getByText('回合執行中，請待完成後再建立（或於主要輸入框插話）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /停止/ })).toBeDisabled()
  })

  it('R2 rework: capability-gates /loop — disables the form and explains when availableCommands lacks loop', () => {
    renderPanel({ loopCommandAvailable: false })
    expect(screen.getByTestId('bgtasks-loop-unavailable')).toHaveTextContent('未廣播 /loop 命令')
    expect(screen.getByLabelText('間隔（選填）')).toBeDisabled()
    expect(screen.getByLabelText('提示內容')).toBeDisabled()
  })

  it('shows context/turns numbers and always labels per-turn cost as unavailable', () => {
    renderPanel({
      usage: { sessionId: 's1', contextTokensUsed: 186783, contextWindowTokens: 500000, turnCount: 7, toolCallCount: 12 },
      usageTotal: 500000,
      usagePercent: 37
    })
    expect(screen.getByText('37%')).toBeInTheDocument()
    expect(screen.getByText('187k / 500k')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('服務未提供')).toBeInTheDocument()
  })

  it('shows an em dash for context/turns when usage is unavailable', () => {
    renderPanel({ usage: null })
    const usageSection = screen.getByTestId('bgtasks-usage')
    expect(within(usageSection).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('calls onClose from the header close button', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByRole('button', { name: '關閉背景任務面板' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
