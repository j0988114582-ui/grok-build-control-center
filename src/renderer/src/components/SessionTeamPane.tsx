import React from 'react'
import { Virtuoso } from 'react-virtuoso'
import {
  LoaderCircle, MessageSquare, Send, Square, Users, X, Zap
} from 'lucide-react'
import type { PromptBlock, SessionSummary, UiSessionEvent } from '../../../shared/types'
import { sessionDisplayTitle } from './session-groups'

import { PROMPT_TEMPLATES } from '../../../shared/prompt-templates'

type Props = {
  session: SessionSummary
  titleOverride?: string
  events: UiSessionEvent[]
  draft: string
  running: boolean
  focused: boolean
  /** When omitted, treated as ready (handoff default until App wires T5). */
  ready?: boolean
  onFocus: () => void
  onRemoveFromTeam: () => void
  onDraftChange: (value: string) => void
  onSend: () => void
  onInterject: () => void
  onDoNow: () => void
  onStop: () => void
  EventCard: React.ComponentType<{ event: UiSessionEvent; query: string; preview?: unknown }>
}

export function SessionTeamPane({
  session,
  titleOverride,
  events,
  draft,
  running,
  focused,
  ready = true,
  onFocus,
  onRemoveFromTeam,
  onDraftChange,
  onSend,
  onInterject,
  onDoNow,
  onStop,
  EventCard
}: Props): React.JSX.Element {
  const title = titleOverride || sessionDisplayTitle(session, {})
  return (
    <section
      className={`team-pane ${focused ? 'focused' : ''} ${running ? 'running' : ''}`}
      data-testid="team-pane"
      data-session-id={session.id}
      data-focused={focused ? 'true' : 'false'}
      onClick={onFocus}
      onFocusCapture={onFocus}
      onPointerDownCapture={onFocus}
    >
      <header className="team-pane-head">
        <div>
          <span className="eyebrow">{focused ? 'FOCUS' : 'TEAM'}</span>
          <h2 title={session.cwd}>{title}</h2>
          <p>{session.cwd}</p>
        </div>
        <div className="team-pane-tools">
          {running ? <em className="team-running"><LoaderCircle className="spin" />執行中</em> : <em className="team-idle">準備就緒</em>}
          <button type="button" className="icon-button" title="移出 Agents Team" aria-label="移出 Agents Team" onClick={(e) => { e.stopPropagation(); onRemoveFromTeam() }}><X /></button>
        </div>
      </header>
      <div className="team-pane-transcript">
        <Virtuoso
          data={events}
          computeItemKey={(_i, event) => event.id}
          followOutput="auto"
          itemContent={(_i, event) => (
            <div className="event-wrap team-event">
              <EventCard event={event} query="" />
            </div>
          )}
        />
      </div>
      <footer className="team-pane-composer">
        {!running && (
          <div className="template-row team-template-row" data-testid="prompt-templates">
            {PROMPT_TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="template-chip"
                title={item.description}
                disabled={!ready}
                onClick={() => onDraftChange(`${draft ?? ''}${draft ? '\n' : ''}${item.body}`)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={draft}
          rows={3}
          disabled={!ready}
          placeholder={!ready ? '此對話尚未在目前連線就緒（載入中、失敗或已斷線）' : running ? '對此 agent 插話…' : '對此 agent 下指令…'}
          onFocus={onFocus}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (running) onInterject()
              else onSend()
            }
          }}
        />
        {running ? (
          <div className="composer-actions running team-actions">
            <button type="button" className="interject-button" disabled={!ready || !draft.trim()} onClick={onInterject}><MessageSquare />插話</button>
            <button type="button" className="do-now-button" disabled={!ready || !draft.trim()} onClick={onDoNow}><Zap />立刻改做</button>
            <button type="button" className="stop-button" disabled={!ready} onClick={onStop}><Square />停止</button>
          </div>
        ) : (
          <button type="button" className="send-button" disabled={!ready || !draft.trim()} onClick={onSend}><Send />送出</button>
        )}
      </footer>
    </section>
  )
}

export function AgentsTeamToolbar({
  enabled,
  count,
  max,
  onToggle
}: {
  enabled: boolean
  count: number
  max: number
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`team-toggle ${enabled ? 'active' : ''}`}
      data-testid="agents-team-toggle"
      title={enabled ? '關閉 Agents Team 並排' : '開啟 Agents Team 並排（最多 3 格）'}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <Users size={14} />
      Agents Team{enabled ? ` · ${count}/${max}` : ''}
    </button>
  )
}

/** Attachments strip kept minimal for team (paths only). */
export function TeamAttachments({
  items,
  onRemove
}: {
  items: PromptBlock[]
  onRemove: (index: number) => void
}): React.JSX.Element | null {
  if (!items.length) return null
  return (
    <div className="attachment-row team-attachments">
      {items.map((item, index) => (
        <span key={index}>
          {'name' in item ? item.name : 'Attachment'}
          <button type="button" aria-label="移除附件" onClick={() => onRemove(index)}><X /></button>
        </span>
      ))}
    </div>
  )
}
