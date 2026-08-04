import React, { useState } from 'react'
import { Activity, Bot, Check, ChevronDown, ChevronRight, Circle, CircleAlert, LoaderCircle, Send, Square, X } from 'lucide-react'
import type { SessionUsage, UiSessionEvent } from '../../../shared/types'
import {
  formatDeepResearchCommand,
  formatGoalCommand,
  formatLoopCommand,
  formatTokenCount,
  formatWorkflowCommand,
  type BackgroundActivityEntry
} from '../../../shared/background-activity'

export type BackgroundTasksPanelProps = {
  entries: BackgroundActivityEntry[]
  usage: SessionUsage | null
  usageTotal?: number
  usagePercent?: number
  /** Session ready for actions (mirrors composer's activeReady gate). */
  ready: boolean
  /** A turn is currently visibly running — gates loop creation only. */
  running: boolean
  /** R2 rework: only true when the CLI's availableCommands actually advertised `loop`. */
  loopCommandAvailable: boolean
  /** R3: CLI advertised `workflow` / `goal` / `deep-research` in availableCommands. */
  workflowAvailable: boolean
  goalAvailable: boolean
  deepResearchAvailable: boolean
  onClose: () => void
  /** Resolves on a successful send; rejects with a user-facing message on failure. Never
   *  touches the main composer either way — the panel shows its own error locally. */
  onCreateLoop: (commandText: string) => Promise<void>
  /** R3: generic panel send for /workflow /goal /deep-research (launch + management). Same
   *  composer-safe path as onCreateLoop — never touches drafts/attachments. */
  onLaunchCommand: (commandText: string) => Promise<void>
  /** Rejects when the entry has no verified stop mechanism, or the send fails. */
  onStop: (entry: BackgroundActivityEntry) => Promise<void>
  EventCard: React.ComponentType<{ event: UiSessionEvent; query: string }>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function StatusIcon({ status }: { status: BackgroundActivityEntry['status'] }): React.JSX.Element {
  if (status === 'running') return <LoaderCircle className="spin" size={12} />
  if (status === 'failed') return <CircleAlert size={12} />
  if (status === 'done') return <Check size={12} />
  return <Circle size={12} />
}

function SourceIcon({ source }: { source: BackgroundActivityEntry['source'] }): React.JSX.Element {
  return source === 'subagent' ? <Bot size={14} /> : <Activity size={14} />
}

export function BackgroundTasksPanel({
  entries,
  usage,
  usageTotal,
  usagePercent,
  ready,
  running,
  loopCommandAvailable,
  workflowAvailable,
  goalAvailable,
  deepResearchAvailable,
  onClose,
  onCreateLoop,
  onLaunchCommand,
  onStop,
  EventCard
}: BackgroundTasksPanelProps): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [intervalText, setIntervalText] = useState('')
  const [promptText, setPromptText] = useState('')
  const [loopSubmitting, setLoopSubmitting] = useState(false)
  const [loopError, setLoopError] = useState<string | null>(null)
  // R3 autonomous launch forms (workflow / goal / deep-research)
  const [workflowName, setWorkflowName] = useState('')
  const [workflowArgs, setWorkflowArgs] = useState('')
  const [workflowSubmitting, setWorkflowSubmitting] = useState(false)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [goalObjective, setGoalObjective] = useState('')
  const [goalBudget, setGoalBudget] = useState('')
  const [goalSubmitting, setGoalSubmitting] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [deepResearchQuery, setDeepResearchQuery] = useState('')
  const [deepResearchSubmitting, setDeepResearchSubmitting] = useState(false)
  const [deepResearchError, setDeepResearchError] = useState<string | null>(null)
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [stopRequestedIds, setStopRequestedIds] = useState<ReadonlySet<string>>(new Set())
  const [stopErrors, setStopErrors] = useState<Record<string, string>>({})

  const preview = formatLoopCommand(intervalText, promptText)
  const workflowPreview = formatWorkflowCommand(workflowName, workflowArgs)
  const goalPreview = formatGoalCommand(goalObjective, goalBudget)
  const deepResearchPreview = formatDeepResearchCommand(deepResearchQuery)
  const displayEntries = [...entries].reverse()
  const runningCount = entries.filter((entry) => entry.status === 'running').length
  const canSubmitLoop = ready && !running && loopCommandAvailable && preview.length > 0 && !loopSubmitting
  const canSubmitWorkflow = ready && !running && workflowAvailable && workflowPreview.length > 0 && !workflowSubmitting
  const canManageWorkflow = ready && !running && workflowAvailable && !workflowSubmitting
  const canSubmitGoal = ready && !running && goalAvailable && goalPreview.length > 0 && !goalSubmitting
  const canManageGoal = ready && !running && goalAvailable && !goalSubmitting
  const canSubmitDeepResearch = ready && !running && deepResearchAvailable && deepResearchPreview.length > 0 && !deepResearchSubmitting

  const submitLoop = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!canSubmitLoop) return
    setLoopSubmitting(true)
    setLoopError(null)
    onCreateLoop(preview)
      .then(() => setPromptText(''))
      .catch((error: unknown) => setLoopError(errorMessage(error)))
      .finally(() => setLoopSubmitting(false))
  }

  const runLaunch = (
    text: string,
    canSubmit: boolean,
    setSubmitting: (value: boolean) => void,
    setError: (value: string | null) => void,
    onSuccess?: () => void
  ): void => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    onLaunchCommand(text)
      .then(() => onSuccess?.())
      .catch((error: unknown) => setError(errorMessage(error)))
      .finally(() => setSubmitting(false))
  }

  const submitWorkflow = (event: React.FormEvent): void => {
    event.preventDefault()
    runLaunch(workflowPreview, canSubmitWorkflow, setWorkflowSubmitting, setWorkflowError, () => {
      setWorkflowName('')
      setWorkflowArgs('')
    })
  }

  const submitGoal = (event: React.FormEvent): void => {
    event.preventDefault()
    runLaunch(goalPreview, canSubmitGoal, setGoalSubmitting, setGoalError, () => {
      setGoalObjective('')
      setGoalBudget('')
    })
  }

  const submitDeepResearch = (event: React.FormEvent): void => {
    event.preventDefault()
    runLaunch(deepResearchPreview, canSubmitDeepResearch, setDeepResearchSubmitting, setDeepResearchError, () => {
      setDeepResearchQuery('')
    })
  }

  const handleStop = (entry: BackgroundActivityEntry): void => {
    setStoppingId(entry.id)
    setStopErrors((current) => {
      if (!(entry.id in current)) return current
      const next = { ...current }
      delete next[entry.id]
      return next
    })
    onStop(entry)
      .then(() => setStopRequestedIds((current) => new Set(current).add(entry.id)))
      .catch((error: unknown) => setStopErrors((current) => ({ ...current, [entry.id]: errorMessage(error) })))
      .finally(() => setStoppingId((current) => (current === entry.id ? null : current)))
  }

  return (
    <aside className="drawer bgtasks-drawer" data-testid="background-tasks-panel" aria-label="背景任務／Loop 面板">
      <div className="drawer-head">
        <div>
          <span className="eyebrow">BACKGROUND ACTIVITY</span>
          <h2>背景任務／Loop</h2>
        </div>
        <button type="button" className="icon-button" aria-label="關閉背景任務面板" onClick={onClose}><X /></button>
      </div>
      <p className="drawer-intro">
        彙整這個對話裡的排程、監視器、子代理與背景指令（來自 tool_call 與 subagent／task 通知），不是新的 ACP 呼叫。
        目前只有排程迴圈（scheduler_create）有已驗證的停止方式：送出指示請代理呼叫 scheduler_delete；
        取消目前回合（session/cancel）不會停止已分離的背景排程。子代理與一般背景任務暫無可靠的個別終止方式，因此不提供停止按鈕。
      </p>

      <section className="bgtasks-usage" data-testid="bgtasks-usage" aria-label="Context 與回合用量">
        <h3>額度透明</h3>
        <div className="bgtasks-usage-grid">
          <div className="bgtasks-usage-cell">
            <span>Context</span>
            <strong>{usagePercent !== undefined ? `${usagePercent}%` : '—'}</strong>
            <small>{formatTokenCount(usage?.contextTokensUsed)} / {formatTokenCount(usageTotal)}</small>
          </div>
          <div className="bgtasks-usage-cell">
            <span>回合數</span>
            <strong>{usage?.turnCount ?? '—'}</strong>
          </div>
          <div className="bgtasks-usage-cell">
            <span>工具呼叫</span>
            <strong>{usage?.toolCallCount ?? '—'}</strong>
          </div>
          <div className="bgtasks-usage-cell unavailable" title="服務未提供此項資料">
            <span>單回合成本</span>
            <strong>—</strong>
            <small>服務未提供</small>
          </div>
        </div>
      </section>

      <form className="bgtasks-loop-form" onSubmit={submitLoop}>
        <h3>建立定時任務</h3>
        {!loopCommandAvailable && (
          <p className="bgtasks-loop-warn" data-testid="bgtasks-loop-unavailable">
            這次連線的 CLI 未廣播 /loop 命令（availableCommands 沒有列出），暫時無法建立定時任務。
          </p>
        )}
        <label>
          間隔（選填）
          <input
            value={intervalText}
            disabled={!ready || !loopCommandAvailable}
            placeholder="例如 5m、30s；CLI 可能自行調整（曾實測 15s 被調整為 60s）"
            onChange={(event) => setIntervalText(event.target.value)}
          />
        </label>
        <label>
          提示內容
          <textarea
            value={promptText}
            disabled={!ready || !loopCommandAvailable}
            rows={2}
            required
            placeholder="要重複執行的任務內容…"
            onChange={(event) => setPromptText(event.target.value)}
          />
        </label>
        {preview && <code className="bgtasks-loop-preview">{preview}</code>}
        <button type="submit" className="primary" disabled={!canSubmitLoop}>
          <Send size={14} />{loopSubmitting ? '建立中…' : '建立定時任務'}
        </button>
        {!ready && <p className="bgtasks-loop-warn">此對話尚未就緒，無法建立</p>}
        {ready && running && <p className="bgtasks-loop-warn">回合執行中，請待完成後再建立（或於主要輸入框插話）</p>}
        {loopError && <p className="bgtasks-error" role="alert" data-testid="bgtasks-loop-error">{loopError}</p>}
      </form>

      <section className="bgtasks-autonomous" data-testid="bgtasks-autonomous" aria-label="自主任務">
        <h3>自主任務</h3>
        <p className="bgtasks-autonomous-intro">
          這些會送出 /workflow、/goal、/deep-research 給 CLI；進度會出現在下方背景活動清單／對話流；
          回合執行中需先完成才能送出；本區只負責啟動與送出管理指令，不追蹤個別執行狀態。
        </p>

        <form className="bgtasks-auto-form" data-testid="bgtasks-workflow-form" onSubmit={submitWorkflow}>
          <h4>Workflow</h4>
          {!workflowAvailable && (
            <p className="bgtasks-loop-warn" data-testid="bgtasks-workflow-unavailable">
              這次連線的 CLI 未廣播 /workflow 命令（availableCommands 沒有列出），暫時無法啟動或管理 Workflow。
            </p>
          )}
          <label>
            工作流名稱
            <input
              value={workflowName}
              disabled={!ready || !workflowAvailable}
              required
              placeholder="例如 review-changes"
              onChange={(event) => setWorkflowName(event.target.value)}
            />
          </label>
          <label>
            參數（選填）
            <input
              value={workflowArgs}
              disabled={!ready || !workflowAvailable}
              placeholder="例如 --budget 10"
              onChange={(event) => setWorkflowArgs(event.target.value)}
            />
          </label>
          {workflowPreview && <code className="bgtasks-loop-preview" data-testid="bgtasks-workflow-preview">{workflowPreview}</code>}
          <button type="submit" className="primary" disabled={!canSubmitWorkflow}>
            <Send size={14} />{workflowSubmitting ? '送出中…' : '啟動 Workflow'}
          </button>
          <div className="bgtasks-auto-manage" role="group" aria-label="Workflow 管理指令">
            <button type="button" aria-label="送出 /workflow pause" disabled={!canManageWorkflow} onClick={() => runLaunch('/workflow pause', canManageWorkflow, setWorkflowSubmitting, setWorkflowError)}>暫停</button>
            <button type="button" aria-label="送出 /workflow resume" disabled={!canManageWorkflow} onClick={() => runLaunch('/workflow resume', canManageWorkflow, setWorkflowSubmitting, setWorkflowError)}>繼續</button>
            <button type="button" aria-label="送出 /workflow stop" disabled={!canManageWorkflow} onClick={() => runLaunch('/workflow stop', canManageWorkflow, setWorkflowSubmitting, setWorkflowError)}>停止</button>
          </div>
          {!ready && <p className="bgtasks-loop-warn">此對話尚未就緒，無法送出</p>}
          {ready && running && <p className="bgtasks-loop-warn">回合執行中，請待完成後再送出（或於主要輸入框插話）</p>}
          {workflowError && <p className="bgtasks-error" role="alert" data-testid="bgtasks-workflow-error">{workflowError}</p>}
        </form>

        <form className="bgtasks-auto-form" data-testid="bgtasks-goal-form" onSubmit={submitGoal}>
          <h4>Goal</h4>
          {!goalAvailable && (
            <p className="bgtasks-loop-warn" data-testid="bgtasks-goal-unavailable">
              這次連線的 CLI 未廣播 /goal 命令（availableCommands 沒有列出），暫時無法啟動或管理 Goal。
            </p>
          )}
          <label>
            目標內容
            <textarea
              value={goalObjective}
              disabled={!ready || !goalAvailable}
              rows={2}
              required
              placeholder="要達成的目標…"
              onChange={(event) => setGoalObjective(event.target.value)}
            />
          </label>
          <label>
            預算 tokens（選填）
            <input
              value={goalBudget}
              disabled={!ready || !goalAvailable}
              inputMode="numeric"
              placeholder="例如 100000；僅正整數會附加 --budget"
              onChange={(event) => setGoalBudget(event.target.value)}
            />
          </label>
          {goalPreview && <code className="bgtasks-loop-preview" data-testid="bgtasks-goal-preview">{goalPreview}</code>}
          <button type="submit" className="primary" disabled={!canSubmitGoal}>
            <Send size={14} />{goalSubmitting ? '送出中…' : '啟動 Goal'}
          </button>
          <div className="bgtasks-auto-manage" role="group" aria-label="Goal 管理指令">
            <button type="button" aria-label="送出 /goal status" disabled={!canManageGoal} onClick={() => runLaunch('/goal status', canManageGoal, setGoalSubmitting, setGoalError)}>狀態</button>
            <button type="button" aria-label="送出 /goal pause" disabled={!canManageGoal} onClick={() => runLaunch('/goal pause', canManageGoal, setGoalSubmitting, setGoalError)}>暫停</button>
            <button type="button" aria-label="送出 /goal resume" disabled={!canManageGoal} onClick={() => runLaunch('/goal resume', canManageGoal, setGoalSubmitting, setGoalError)}>繼續</button>
            <button type="button" aria-label="送出 /goal clear" disabled={!canManageGoal} onClick={() => runLaunch('/goal clear', canManageGoal, setGoalSubmitting, setGoalError)}>清除</button>
          </div>
          {!ready && <p className="bgtasks-loop-warn">此對話尚未就緒，無法送出</p>}
          {ready && running && <p className="bgtasks-loop-warn">回合執行中，請待完成後再送出（或於主要輸入框插話）</p>}
          {goalError && <p className="bgtasks-error" role="alert" data-testid="bgtasks-goal-error">{goalError}</p>}
        </form>

        <form className="bgtasks-auto-form" data-testid="bgtasks-deep-research-form" onSubmit={submitDeepResearch}>
          <h4>深度研究</h4>
          {!deepResearchAvailable && (
            <p className="bgtasks-loop-warn" data-testid="bgtasks-deep-research-unavailable">
              這次連線的 CLI 未廣播 /deep-research 命令（availableCommands 沒有列出），暫時無法啟動深度研究。
            </p>
          )}
          <label>
            研究查詢
            <textarea
              value={deepResearchQuery}
              disabled={!ready || !deepResearchAvailable}
              rows={2}
              required
              placeholder="要深入調查的問題…"
              onChange={(event) => setDeepResearchQuery(event.target.value)}
            />
          </label>
          {deepResearchPreview && <code className="bgtasks-loop-preview" data-testid="bgtasks-deep-research-preview">{deepResearchPreview}</code>}
          <button type="submit" className="primary" disabled={!canSubmitDeepResearch}>
            <Send size={14} />{deepResearchSubmitting ? '送出中…' : '啟動深度研究'}
          </button>
          {!ready && <p className="bgtasks-loop-warn">此對話尚未就緒，無法送出</p>}
          {ready && running && <p className="bgtasks-loop-warn">回合執行中，請待完成後再送出（或於主要輸入框插話）</p>}
          {deepResearchError && <p className="bgtasks-error" role="alert" data-testid="bgtasks-deep-research-error">{deepResearchError}</p>}
        </form>
      </section>

      <section className="bgtasks-list-section" aria-label="背景活動清單">
        <h3>背景活動{runningCount > 0 ? ` · ${runningCount} 進行中` : ''}</h3>
        {displayEntries.length === 0 && <p className="bgtasks-empty">目前沒有偵測到背景任務、子代理或排程活動。</p>}
        {displayEntries.length > 0 && (
          <ul className="bgtasks-list">
            {displayEntries.map((entry) => {
              const expanded = expandedId === entry.id
              const hasOutput = Boolean(entry.output && entry.output.trim())
              const toggleLabel = hasOutput ? '查看輸出' : '事件詳情'
              const stopRequested = stopRequestedIds.has(entry.id)
              const stopping = stoppingId === entry.id
              const stopError = stopErrors[entry.id]
              return (
                <li key={entry.id} className={`bgtasks-item status-${entry.status}`} data-testid="bgtasks-item">
                  <button
                    type="button"
                    className="bgtasks-item-head"
                    aria-expanded={expanded}
                    aria-label={`${entry.title} － ${toggleLabel}（${expanded ? '收合' : '展開'}）`}
                    onClick={() => setExpandedId(expanded ? null : entry.id)}
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <SourceIcon source={entry.source} />
                    <span className="bgtasks-item-title">{entry.title}</span>
                    {entry.loopLike && <b className="bgtasks-loop-badge">LOOP</b>}
                    <em className={`bgtasks-status status-${entry.status}`}><StatusIcon status={entry.status} />{entry.statusLabel}</em>
                  </button>
                  <div className="bgtasks-item-meta">
                    <small>{entry.kindLabel}{entry.detail ? ` · ${entry.detail}` : ''}</small>
                    <span className="bgtasks-item-toggle-label">{toggleLabel}</span>
                    {entry.stopAction && !stopRequested && (
                      <button
                        type="button"
                        className="bgtasks-stop-button"
                        disabled={!ready || stopping || running}
                        title={running
                          ? '回合執行中無法送出停止指示：scheduler_delete 需要一個空檔回合，請待目前回合完成'
                          : '送出指示請代理呼叫 scheduler_delete 刪除這個排程；不是立即終止，需等代理執行'}
                        aria-label={`停止排程「${entry.title}」：送出 scheduler_delete 指示，非立即終止`}
                        onClick={() => handleStop(entry)}
                      ><Square size={11} />{stopping ? '送出中…' : '停止'}</button>
                    )}
                    {stopRequested && <em className="bgtasks-stop-requested" data-testid="bgtasks-stop-requested">已送出停止請求</em>}
                  </div>
                  {stopError && <p className="bgtasks-error" role="alert" data-testid="bgtasks-stop-error">{stopError}</p>}
                  {expanded && (
                    <div className="bgtasks-item-detail">
                      <EventCard event={entry.event} query="" />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </aside>
  )
}
