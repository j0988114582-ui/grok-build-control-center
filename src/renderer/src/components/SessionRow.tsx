import React, { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Pencil, Pin, Trash2, Users } from 'lucide-react'
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
  /** Absolute time for the tooltip; relative text stays in `updatedLabel`. */
  updatedTitle?: string
  /** Hide cwd when the group header already shows the folder. */
  showCwd?: boolean
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
  updatedTitle,
  showCwd = true,
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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenuOpen(false)
      moreRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const closeAnd = (action: () => void): void => {
    setMenuOpen(false)
    action()
  }

  return <div className={`session-row ${isActive ? 'active' : ''} ${inTeam ? 'in-team' : ''} ${isCollapsing ? 'collapsing' : ''} ${selectMode ? 'select-mode' : ''} ${isSelected ? 'selected' : ''}`}>
    {selectMode && <input className="session-check" type="checkbox" aria-label={`選擇對話 ${title}`} checked={isSelected} onChange={(event) => onToggleSelect(session.id, event.currentTarget.checked)} />}
    <button className="session-open" disabled={disabled} onClick={() => onOpen(session)}>
      <span className="session-dot" />
      <div className="session-meta">
        <strong>{title}{inTeam ? <em className="team-badge">TEAM</em> : null}</strong>
        {showCwd ? <small title={session.cwd}>{session.cwd}</small> : null}
        <time title={updatedTitle || undefined}>{updatedLabel}</time>
      </div>
    </button>
    {!selectMode && (
      <div className="session-actions" data-testid="session-actions" ref={menuRef}>
        <button
          ref={moreRef}
          type="button"
          className="session-more"
          data-testid="session-more"
          title="更多動作"
          aria-label={`更多動作 ${title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setMenuOpen(true)
            }
          }}
        ><MoreHorizontal /></button>
        {menuOpen && (
          <div className="session-more-menu" role="menu" aria-label={`${title} 動作`}>
            {teamEnabled && (
              <button type="button" role="menuitem" className={`session-team ${inTeam ? 'active' : ''}`} title={inTeam ? '移出 Agents Team' : '加入 Agents Team'} aria-label={inTeam ? `移出 Team ${title}` : `加入 Team ${title}`} onClick={() => closeAnd(() => onToggleTeam(session, inTeam))}><Users />{inTeam ? '移出 Team' : '加入 Team'}</button>
            )}
            <button type="button" role="menuitem" className={`session-pin ${isPinned ? 'pinned' : ''}`} title={isPinned ? '取消釘選' : '釘選'} aria-label={isPinned ? `取消釘選 ${title}` : `釘選 ${title}`} onClick={() => closeAnd(() => onTogglePin(session))}><Pin />{isPinned ? '取消釘選' : '釘選'}</button>
            <button type="button" role="menuitem" className="session-rename" title="重新命名" aria-label={`重新命名 ${title}`} onClick={() => closeAnd(() => onRename(session, title))}><Pencil />重新命名</button>
            <button type="button" role="menuitem" className="session-delete" data-nova-tone="danger" title="刪除對話" aria-label={`刪除對話 ${title}`} onClick={() => closeAnd(() => onDelete(session))}><Trash2 />刪除</button>
          </div>
        )}
      </div>
    )}
  </div>
}

export const SessionRow = React.memo(SessionRowImpl)
