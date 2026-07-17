import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Code2, Copy, Eye, FileCode2, FileImage, FileVideo, FolderOpen, PanelRightClose,
  PanelRightOpen, RefreshCw, X
} from 'lucide-react'
import type { PreviewItem, PreviewKind } from '../../../../shared/preview-types'
import { PREVIEW_MAX_WIDTH, PREVIEW_MIN_WIDTH, PREVIEW_RAIL_WIDTH } from '../../../../shared/preview-types'
import { formatBytes } from '../../../../shared/preview-path-policy'
import { languageHintFromPath } from '../../../../shared/preview-discover'
import { ImageView } from './ImageView'
import { VideoView } from './VideoView'
import { HtmlView } from './HtmlView'
import { CodeView } from './CodeView'

export type PreviewLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; revealOnly?: boolean }
  | {
      status: 'ready'
      kind: PreviewKind
      path?: string
      mediaSrc?: string
      text?: string
      truncated?: boolean
      language?: string
      sizeBytes?: number
      mimeType?: string
    }

export type PreviewDockProps = {
  open: boolean
  width: number
  items: PreviewItem[]
  activeId: string | null
  load: PreviewLoadState
  showHtmlScriptAdvanced: boolean
  /** Per-file session-scoped script consent (caller holds map). */
  htmlScriptsAllowed: boolean
  onToggleOpen: () => void
  onWidthChange: (width: number) => void
  onSelectItem: (id: string) => void
  /** P-CLOSE-1: clear active item / load state; dock may stay open; not delete. */
  onCloseItem?: () => void
  onRefresh: () => void
  onRescan: () => void
  onOpenFile: () => void
  onToggleHtmlScripts: (allowed: boolean) => void
  onCopyPath: (path: string) => void
  onRevealPath: (path: string) => void
  onOpenExternalPath: (path: string) => void
  reducedMotion?: boolean
}

const TAB_KINDS: Array<{ id: 'auto' | PreviewKind; label: string }> = [
  { id: 'auto', label: '自動' },
  { id: 'image', label: '圖片' },
  { id: 'video', label: '影片' },
  { id: 'html', label: 'HTML' },
  { id: 'code', label: '程式碼' },
  { id: 'remote-image', label: '遠端圖' }
]

function kindIcon(kind: PreviewKind): React.ReactNode {
  if (kind === 'image' || kind === 'remote-image') return <FileImage size={14} />
  if (kind === 'video') return <FileVideo size={14} />
  if (kind === 'html') return <FileCode2 size={14} />
  return <Code2 size={14} />
}

export function PreviewDock(props: PreviewDockProps): React.JSX.Element {
  const {
    open, width, items, activeId, load, showHtmlScriptAdvanced, htmlScriptsAllowed,
    onToggleOpen, onWidthChange, onSelectItem, onCloseItem, onRefresh, onRescan, onOpenFile,
    onToggleHtmlScripts, onCopyPath, onRevealPath, onOpenExternalPath
  } = props

  const [tab, setTab] = useState<'auto' | PreviewKind>('auto')
  const [lightbox, setLightbox] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const active = items.find((item) => item.id === activeId) ?? null
  const filtered = useMemo(() => {
    if (tab === 'auto') return items
    return items.filter((item) => item.kind === tab)
  }, [items, tab])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setLightbox(false)
      }
    }
    // Capture phase so we win over global cancelTurn
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [lightbox])

  useEffect(() => {
    setLightbox(false)
  }, [activeId, load.status])

  const onResizePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    dragRef.current = { startX: event.clientX, startWidth: width }
    const onMove = (ev: PointerEvent): void => {
      if (!dragRef.current) return
      const delta = dragRef.current.startX - ev.clientX
      let next = dragRef.current.startWidth + delta
      // Snap to 300 / 360
      if (Math.abs(next - 300) < 12) next = 300
      if (Math.abs(next - 360) < 12) next = 360
      onWidthChange(Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, next)))
    }
    const onUp = (): void => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [width, onWidthChange])

  if (!open) {
    return <aside
      className="preview-dock preview-dock-rail"
      data-testid="preview-dock"
      data-open="false"
      style={{ width: PREVIEW_RAIL_WIDTH }}
      aria-label="預覽台（已收合）"
    >
      <button
        type="button"
        className="preview-rail-btn"
        aria-label="展開預覽台"
        title="展開預覽台 (Ctrl+Shift+V)"
        onClick={onToggleOpen}
      >
        <PanelRightOpen size={16} />
        <span>預覽</span>
        {active && <i className={`preview-type-dot kind-${active.kind}`} />}
        {items.length > 0 && <b className="preview-rail-count">{items.length > 9 ? '9+' : items.length}</b>}
      </button>
    </aside>
  }

  const pathForActions =
    (load.status === 'ready' && load.path) ||
    (active?.source.type === 'file' ? active.source.path : undefined) ||
    (active?.source.type === 'remote-url' ? active.source.url : undefined)

  return <aside
    className="preview-dock"
    data-testid="preview-dock"
    data-open="true"
    style={{ width }}
    aria-label="預覽台"
  >
    <div className="preview-resize" data-testid="preview-resize" onPointerDown={onResizePointerDown} role="separator" aria-orientation="vertical" aria-label="調整預覽台寬度" />
    <header className="preview-dock-head">
      <div>
        <span className="eyebrow">PREVIEW DOCK</span>
        <h2>預覽</h2>
      </div>
      <div className="preview-dock-actions">
        <button type="button" className="icon-button" aria-label="開啟檔案" title="開啟檔案…" onClick={onOpenFile}><Eye size={15} /></button>
        <button type="button" className="icon-button" aria-label="重新掃描對話" title="重新掃描目前對話" onClick={onRescan}><RefreshCw size={15} /></button>
        <button type="button" className="icon-button" aria-label="重新整理預覽" title="重新整理" onClick={onRefresh}><RefreshCw size={15} /></button>
        {pathForActions && active?.source.type === 'file' && <>
          <button type="button" className="icon-button" aria-label="複製路徑" onClick={() => onCopyPath(pathForActions)}><Copy size={15} /></button>
          <button type="button" className="icon-button" aria-label="在檔案總管開啟" onClick={() => onRevealPath(pathForActions)}><FolderOpen size={15} /></button>
        </>}
        {onCloseItem && (activeId || load.status !== 'idle') && (
          <button
            type="button"
            className="icon-button"
            data-testid="preview-close-item"
            aria-label="關閉目前項目"
            title="關閉目前項目（不刪除檔案、不移出清單）"
            onClick={onCloseItem}
          ><X size={15} /></button>
        )}
        <button type="button" className="icon-button" aria-label="收合預覽台" title="收合預覽台 (Ctrl+Shift+V)" onClick={onToggleOpen}><PanelRightClose size={15} /></button>
      </div>
    </header>

    <div className="preview-tabs" role="tablist" aria-label="預覽類型">
      {TAB_KINDS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="tab"
          aria-selected={tab === entry.id}
          className={tab === entry.id ? 'active' : ''}
          onClick={() => setTab(entry.id)}
        >{entry.label}</button>
      ))}
    </div>

    <div className="preview-list" data-testid="preview-list" aria-label="可預覽項目">
      {filtered.length === 0 ? (
        <div className="preview-empty-list">
          <p>從對話點路徑，或選檔開始預覽</p>
          <div className="preview-empty-actions">
            <button type="button" onClick={onOpenFile}>選檔</button>
            <button type="button" onClick={onRescan}>掃描最新訊息</button>
          </div>
        </div>
      ) : filtered.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === activeId ? 'true' : undefined}
          className={`preview-list-item ${item.id === activeId ? 'active' : ''}`}
          draggable={item.source.type === 'file'}
          title={item.source.type === 'file' ? '拖到輸入框可插入本機路徑' : undefined}
          onDragStart={(event) => {
            // P-DRAG-5: Preview→composer uses DataTransfer path only for local files
            if (item.source.type !== 'file') {
              event.preventDefault()
              return
            }
            event.dataTransfer.setData('application/x-grok-path', item.source.path)
            event.dataTransfer.setData('text/plain', item.source.path)
            event.dataTransfer.effectAllowed = 'copy'
          }}
          onClick={() => onSelectItem(item.id)}
        >
          <span className="preview-list-icon">{kindIcon(item.kind)}</span>
          <span className="preview-list-meta">
            <strong>{item.label}</strong>
            <em>{item.shortPath ?? (item.source.type === 'file' ? item.source.path : item.kind)}</em>
          </span>
          <span className={`preview-kind-badge kind-${item.kind}`}>{item.kind}</span>
        </button>
      ))}
    </div>

    <div className="preview-stage" data-testid="preview-stage">
      {load.status === 'idle' && (
        <div className="preview-empty-stage" data-testid="preview-idle">
          <Eye size={28} />
          <p>座艙預覽台待命</p>
          <small>點清單項目，或從對話中的路徑啟動預覽</small>
        </div>
      )}
      {load.status === 'loading' && (
        <div className="preview-loading" data-testid="preview-loading">
          <div className="preview-skeleton" />
          <span>讀取中…</span>
        </div>
      )}
      {load.status === 'error' && (
        <div className="preview-error" role="alert" data-testid="preview-error">
          <p>{load.message}</p>
          <div className="preview-error-actions">
            <button type="button" onClick={onRefresh}>重試</button>
            {pathForActions && active?.source.type === 'file' && (
              <button type="button" onClick={() => onRevealPath(pathForActions)}>在檔案總管開啟</button>
            )}
            {pathForActions && active?.source.type === 'file' && (
              <button type="button" onClick={() => onOpenExternalPath(pathForActions)}>用系統程式開啟</button>
            )}
          </div>
        </div>
      )}
      {load.status === 'ready' && load.kind === 'image' && load.mediaSrc && (
        <ImageView src={load.mediaSrc} alt={active?.label ?? '圖片'} onOpenLightbox={() => setLightbox(true)} />
      )}
      {load.status === 'ready' && load.kind === 'remote-image' && load.mediaSrc && (
        <ImageView src={load.mediaSrc} alt={active?.label ?? '遠端圖片'} onOpenLightbox={() => setLightbox(true)} />
      )}
      {load.status === 'ready' && load.kind === 'video' && load.mediaSrc && (
        <VideoView src={load.mediaSrc} active={open && !lightbox} />
      )}
      {load.status === 'ready' && load.kind === 'html' && load.text !== undefined && (
        <HtmlView
          html={load.text}
          allowScripts={htmlScriptsAllowed}
          showScriptControl={showHtmlScriptAdvanced}
          onToggleScripts={onToggleHtmlScripts}
        />
      )}
      {load.status === 'ready' && load.kind === 'code' && load.text !== undefined && (
        <CodeView
          code={load.text}
          language={load.language ?? (active?.source.type === 'file' ? languageHintFromPath(active.source.path) : active?.source.type === 'inline-code' ? active.source.language : undefined)}
          truncated={load.truncated}
        />
      )}
    </div>

    <footer className="preview-dock-foot">
      <span>{active?.label ?? '—'}</span>
      <span>{load.status === 'ready' && load.sizeBytes !== undefined ? formatBytes(load.sizeBytes) : '—'}</span>
      <span>{active?.kind ?? '—'}</span>
      <span className="preview-foot-keys">Ctrl+Shift+V 開關</span>
    </footer>

    {lightbox && load.status === 'ready' && load.mediaSrc && (load.kind === 'image' || load.kind === 'remote-image') && (
      <div
        className="preview-lightbox"
        data-testid="preview-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="圖片全螢幕"
        onClick={() => setLightbox(false)}
      >
        <button type="button" className="preview-lightbox-close" aria-label="關閉全螢幕" onClick={() => setLightbox(false)}><X size={18} /></button>
        <img src={load.mediaSrc} alt={active?.label ?? ''} onClick={(event) => event.stopPropagation()} />
      </div>
    )}
  </aside>
}

/** Exposed for tests: whether lightbox is open is internal; use data-testid. */
export { PREVIEW_MIN_WIDTH, PREVIEW_MAX_WIDTH, PREVIEW_RAIL_WIDTH }
