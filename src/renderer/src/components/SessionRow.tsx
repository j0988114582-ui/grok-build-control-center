import React from 'react'
import { Pencil, Pin, Trash2, Users } from 'lucide-react'
import type { SessionSummary } from '../../../shared/types'

/**
 * D4: one sidebar row, memoised.
 *
 * The sidebar renders every session with up to five buttons each (54 sessions measured as
 * 216 buttons). Inlined in App's render, all of them re-rendered on every state change —
 * including each streamed token, which fires setEvents several times a second. The row is
 * pure given these props, so React.memo turns that into "re-render only the rows whose
 * own state changed". Callbacks must be reference-stable in the parent or the memo is
 * defeated; App holds them in refs for exactly that reason.
 */
export type SessionRowProps = {
  session: SessionSummary
  title: string
  /** Pre-formatted by the parent so the row stays pure and cheap to compare. */
  updatedLabel: string
  isActive: boolean
  isPinned: boolean
  isSelected: boolean
  inTeam: boolean
  isCollapsing: boolean
  selectMode: boolean
  teamEnabled: boolean
  disabled: boolean
  onOpen: (session: SessionSummary) => void
  onToggleSelect: (sessionId: string, checked: boolean) => void
  onToggleTeam: (session: SessionSummary, inTeam: boolean) => void
  onTogglePin: (session: SessionSummary) => void
  onRename: (session: SessionSummary, title: string) => void
  onDelete: (session: SessionSummary) => void
}

function SessionRowImpl({
  session,
  title,
  updatedLabel,
  isActive,
  isPinned,
  isSelected,
  inTeam,
  isCollapsing,
  selectMode,
  teamEnabled,
  disabled,
  onOpen,
  onToggleSelect,
  onToggleTeam,
  onTogglePin,
  onRename,
  onDelete
}: SessionRowProps): React.JSX.Element {
  return <div className={`session-row ${isActive ? 'active' : ''} ${inTeam ? 'in-team' : ''} ${isCollapsing ? 'collapsing' : ''} ${selectMode ? 'select-mode' : ''} ${isSelected ? 'selected' : ''}`}>
    {selectMode && <input className="session-check" type="checkbox" aria-label={`選擇對話 ${title}`} checked={isSelected} onChange={(event) => onToggleSelect(session.id, event.currentTarget.checked)} />}
    <button className="session-open" disabled={disabled} onClick={() => onOpen(session)}>
      <span className="session-dot" />
      <div className="session-meta"><strong>{title}{inTeam ? <em className="team-badge">TEAM</em> : null}</strong><small>{session.cwd}</small><time>{updatedLabel}</time></div>
    </button>
    {!selectMode && (
      <div className="session-actions" data-testid="session-actions">
        {teamEnabled && <button type="button" className={`session-team ${inTeam ? 'active' : ''}`} title={inTeam ? '移出 Agents Team' : '加入 Agents Team'} aria-label={inTeam ? `移出 Team ${title}` : `加入 Team ${title}`} onClick={() => onToggleTeam(session, inTeam)}><Users /></button>}
        <button type="button" className={`session-pin ${isPinned ? 'pinned' : ''}`} title={isPinned ? '取消釘選' : '釘選'} aria-label={isPinned ? `取消釘選 ${title}` : `釘選 ${title}`} onClick={() => onTogglePin(session)}><Pin /></button>
        <button type="button" className="session-rename" title="重新命名" aria-label={`重新命名 ${title}`} onClick={() => onRename(session, title)}><Pencil /></button>
        <button type="button" className="session-delete" data-nova-tone="danger" title="刪除對話" aria-label={`刪除對話 ${title}`} onClick={() => onDelete(session)}><Trash2 /></button>
      </div>
    )}
  </div>
}

export const SessionRow = React.memo(SessionRowImpl)
