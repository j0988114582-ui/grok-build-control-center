import React, { useEffect, useRef, useState } from 'react'
import { Bookmark, X } from 'lucide-react'
import type { UiSessionEvent } from '../../../shared/types'
import { collectPromptBookmarks, type PromptBookmark } from '../../../shared/prompt-bookmarks'

/**
 * P-BOOKMARK: jump back to any prompt you sent in this conversation.
 *
 * Picking one deliberately does NOT re-enable followTail: you asked to go back and read,
 * not to be dragged forward again by the next streamed token.
 */

export function PromptBookmarks({
  events,
  onJump
}: {
  events: UiSessionEvent[]
  onJump: (eventId: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const bookmarks = collectPromptBookmarks(events)

  // Newest first: the thing you want is usually near the end of a long conversation.
  const ordered = [...bookmarks].reverse()

  useEffect(() => {
    if (!open) return
    setHighlighted(0)
    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, highlighted])

  const close = (restoreFocus = true): void => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  const pick = (bookmark: PromptBookmark): void => {
    onJump(bookmark.id)
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (!ordered.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlighted((current) => (current + 1) % ordered.length); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted((current) => (current - 1 + ordered.length) % ordered.length); return }
    if (event.key === 'Home') { event.preventDefault(); setHighlighted(0); return }
    if (event.key === 'End') { event.preventDefault(); setHighlighted(ordered.length - 1); return }
    if (event.key === 'Enter') {
      event.preventDefault()
      const target = ordered[highlighted]
      if (target) pick(target)
    }
  }

  return <div className="prompt-bookmarks" ref={rootRef} onKeyDown={onKeyDown}>
    <button
      ref={buttonRef}
      type="button"
      className={`icon-button prompt-bookmarks-trigger ${open ? 'open' : ''}`}
      data-testid="prompt-bookmarks-trigger"
      title="我發出的指令（跳回任一則）"
      aria-label="我發出的指令"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    ><Bookmark />{bookmarks.length > 0 && <em>{bookmarks.length}</em>}</button>
    {open && <div className="prompt-bookmarks-panel" data-testid="prompt-bookmarks-panel">
      <header>
        <span>我發出的指令</span>
        <button type="button" className="icon-button" aria-label="關閉" onClick={() => close()}><X /></button>
      </header>
      {ordered.length === 0
        ? <p className="prompt-bookmarks-empty">這個對話還沒有你發出的指令。</p>
        : <div className="prompt-bookmarks-list" role="listbox" aria-label="我發出的指令" ref={listRef}>
          {ordered.map((bookmark, index) => <button
            key={bookmark.id}
            type="button"
            role="option"
            aria-selected={index === highlighted}
            data-highlighted={index === highlighted}
            data-testid="prompt-bookmark-item"
            onMouseEnter={() => setHighlighted(index)}
            onClick={() => pick(bookmark)}
          ><b>#{bookmark.ordinal}</b><span>{bookmark.label}</span></button>)}
        </div>}
    </div>}
  </div>
}
