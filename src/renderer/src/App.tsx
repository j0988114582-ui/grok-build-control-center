import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import {
  Activity, Archive, Bot, Check, ChevronDown, ChevronRight, CircleAlert, Command, Cpu, FilePlus2,
  FolderOpen, Gauge, Keyboard, ListTodo, LoaderCircle, MessageSquare, Moon, Paperclip, PanelLeft, PanelLeftClose, Pencil, Pin, Play, Search, Send,
  Settings, Smartphone, Square, Sun, TerminalSquare, Trash2, UserRound, Users, Wrench, X, Zap
} from 'lucide-react'
import type { SelectedFile } from '../../shared/bridge'
import { createDefaultSettings } from '../../shared/settings'
import { selectedFilesToPrompt } from '../../shared/attachments'
import { DEFAULT_SHORTCUTS, commandForEvent, findShortcutConflicts } from '../../shared/shortcuts'
import { sessionReducer } from '../../shared/session-state'
import { quotaAlertStorageKey, selectCrossedQuotaThreshold } from '../../shared/billing'
import {
  INTERJECT_QUEUED_NOTICE,
  INTERJECT_UNSUPPORTED_NOTICE,
  isMethodNotFoundError,
  type InterjectUiState
} from '../../shared/interject'
import {
  hasQueuedPayload,
  LOCAL_QUEUE_CLEARED_NOTICE,
  LOCAL_QUEUE_NOTICE,
  LOCAL_QUEUE_STATUS,
  REMOTE_QUEUE_NOTICE_DESKTOP,
  remoteQueueStatusLabel,
  shouldDrainLocalQueue,
  takeQueueForSession,
  type LocalQueuedPrompt
} from '../../shared/local-queue'
import { buildSlashPaletteEntries } from '../../shared/palette-commands'
import { localizeSessionModes, sessionModeControlTitle } from '../../shared/session-modes'
import { QuotaRings } from './components/QuotaRings'
import { ModelPicker } from './components/ModelPicker'
import { CommandPalette, type PaletteCommand } from './components/CommandPalette'
import { CodeBlock } from './components/CodeBlock'
import { PreviewDock, type PreviewLoadState } from './components/PreviewDock/PreviewDock'
import { AgentsTeamToolbar, SessionTeamPane } from './components/SessionTeamPane'
import {
  discoverPreviewCandidates,
  isMediaPreviewItem
} from '../../shared/preview-discover'
import {
  PREVIEW_DEFAULT_WIDTH,
  PREVIEW_MAX_WIDTH,
  PREVIEW_MIN_WIDTH,
  type PreviewItem
} from '../../shared/preview-types'
import { StarfieldCanvas } from './fx/StarfieldCanvas'

const WelcomeHero3D = React.lazy(() => import('./fx/WelcomeHero3D'))

/** 3D chunk failures (driver quirks, chunk load) must fall back to the flat ornament, never crash. */
class HeroBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }
  componentDidCatch(): void { /* fallback rendered */ }
  render(): React.ReactNode { return this.state.failed ? this.props.fallback : this.props.children }
}

/** Obsidian prism hero when WebGL + motion allow; the dashed orbit ornament otherwise. */
function WelcomeHeroOrnament({ reducedMotion, theme }: { reducedMotion: boolean; theme: 'dark' | 'light' }): React.JSX.Element {
  const [webgl] = useState(() => {
    try { return Boolean(document.createElement('canvas').getContext('webgl')) } catch { return false }
  })
  const fallback = <div className="empty-orbit"><Cpu /><span /></div>
  if (!webgl || reducedMotion || theme !== 'dark') return fallback
  return (
    <div className="empty-hero3d" aria-hidden="true" data-testid="welcome-hero3d">
      <HeroBoundary fallback={fallback}>
        <React.Suspense fallback={fallback}>
          <WelcomeHero3D />
        </React.Suspense>
      </HeroBoundary>
    </div>
  )
}
import { CursorFX } from './fx/CursorFX'
import { StatusOrb, type StatusOrbMode } from './fx/StatusOrb'
import {
  AGENTS_TEAM_MAX,
  emptyAgentsTeam,
  isInTeam,
  pruneTeamSlots,
  setTeamFocus,
  toggleTeamSlot,
  type AgentsTeamState
} from '../../shared/agents-team'
import { PROMPT_TEMPLATES } from '../../shared/prompt-templates'
import {
  groupSessionsByProject,
  partitionPinnedSessions,
  sessionDisplayTitle
} from './components/session-groups'
import { pruneOrphanSessionLocalData, removeSessionLocalData, togglePinnedSession } from '../../shared/session-local-state'
import {
  bumpConnectionGeneration,
  markSessionReadyIfCurrent,
  clearSessionReady,
  invalidateAllReadiness,
  isSessionReady,
  sessionActionAllowed,
  type SessionReadyMap
} from '../../shared/session-readiness'
import {
  snapshotTeamReconnect,
  restoreTeamAfterReconnect
} from '../../shared/team-reconnect'
import {
  buildSessionSearchIndex,
  filterSessionsBySearch
} from '../../shared/session-search'
import {
  probeSessionCapabilities
} from '../../shared/session-capabilities'
import {
  formatInferredCompactSummary,
  formatOfficialCompactTitle,
  shouldEmitInferredCompact
} from '../../shared/compact-infer'
import {
  canEnableYolo,
  PERMISSION_ASK_ALREADY_NOTICE,
  PERMISSION_ASK_TOOLTIP
} from '../../shared/remote-yolo-mutex'
import {
  appendPathLines,
  isAbsoluteLocalPath,
  isImageMime,
  isImagePath,
  removePathLine,
  revokePathChipUrls,
  stripDuplicateImagePathLines,
  upsertPathChips,
  type PathChip
} from '../../shared/drop-paths'
import { fitMainComposer } from '../../shared/composer-autogrow'
import {
  cwdDisplayName,
  filterSessionsByCwd,
  listSessionCwds,
  suggestedCleanupSessions
} from '../../shared/session-hygiene'
import type {
  AgentCapabilities, AgentPermissionMode, AppSettings, BillingInfo, CliStatus, ModelState, PermissionRequest, PromptBlock,
  SessionSummary, SessionUsage, UiSessionEvent
} from '../../shared/types'
import type { RemoteDesktopQueue, RemoteDesktopState } from '../../shared/bridge'
import { RemoteControlPanel } from './components/RemoteControlPanel'

const EMPTY_CAPS: AgentCapabilities = { loadSession: false, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [] }
const emptyStatus: CliStatus = { executable: '', found: false, connected: false }
type Panel = 'none' | 'settings' | 'features' | 'commands' | 'shortcuts'
type SetupDialog = 'install' | 'account' | null

const containDialogFocus = (event: React.KeyboardEvent<HTMLElement>): void => {
  if (event.key !== 'Tab') return
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
  if (focusable.length === 0) { event.preventDefault(); event.currentTarget.focus(); return }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

const readQuotaReminders = (storageKey: string): Set<number> => {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown
    return new Set(Array.isArray(stored) ? stored.filter((item): item is number => item === 80 || item === 95) : [])
  } catch {
    return new Set()
  }
}

const formatDate = (value?: string): string => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}
const formatTokens = (value?: number): string => value === undefined ? '—' : value >= 1000 ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k` : String(value)
const eventText = (event: UiSessionEvent): string => event.kind === 'message' || event.kind === 'thought' ? event.text : event.kind === 'tool' ? `${event.title} ${event.output ?? ''}` : event.kind === 'recap' ? event.summary : event.kind === 'error' ? event.message : event.kind === 'unknown' ? event.summary : JSON.stringify(event)
const eventTitle = (event: Exclude<UiSessionEvent, { kind: 'message' } | { kind: 'turn' }>): string => {
  switch (event.kind) {
    case 'tool': return event.title
    case 'thought': return 'Reasoning'
    case 'plan': return 'Plan'
    case 'subagent': return event.description
    case 'task': return event.description
    case 'recap': return 'Session recap'
    case 'error': return 'Error'
    case 'commands': return 'Commands updated'
    case 'mode': return `Mode · ${event.modeId}`
    case 'usage': return 'Context usage'
    case 'compact':
      return event.source === 'inferred'
        ? '可能已壓縮上下文'
        : formatOfficialCompactTitle(event.before, event.after)
    case 'retry': return `Retry ${event.attempt}/${event.maxRetries}`
    case 'unknown': return event.summary
  }
}

type PreviewHandlers = {
  onPreviewPath: (path: string) => void
  onPreviewRemote: (url: string) => void
  onPreviewCode: (code: string, language?: string) => void
}

function Markdown({ children, preview }: { children: string; preview?: PreviewHandlers }): React.JSX.Element {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
    a: ({ href, children: label }) => <a href={href} onClick={(event) => { event.preventDefault(); if (href) void window.grokApi.openExternal(href) }}>{label}</a>,
    code: ({ children: code, className }) => (
      <CodeBlock className={className} onPreview={preview ? (text, language) => preview.onPreviewCode(text, language) : undefined}>{code}</CodeBlock>
    ),
    // Privacy: never auto-load remote images in transcript (tracking pixels).
    img: ({ src, alt }) => {
      if (!src) return null
      if (/^https?:\/\//i.test(src)) {
        return <button type="button" className="md-preview-chip" data-testid="md-remote-image-chip" onClick={() => preview?.onPreviewRemote(src)}>{alt || '遠端圖片 · 點擊在預覽台開啟'}</button>
      }
      return <button type="button" className="md-preview-chip" data-testid="md-local-image-chip" onClick={() => preview?.onPreviewPath(src)}>{alt || src}</button>
    }
  }}>{children}</ReactMarkdown>
}

function EventCard({ event, query, preview }: { event: UiSessionEvent; query: string; preview?: PreviewHandlers }): React.JSX.Element {
  const [open, setOpen] = useState(event.kind === 'message' || event.kind === 'error')
  const matches = query && eventText(event).toLocaleLowerCase().includes(query.toLocaleLowerCase())
  if (event.kind === 'message') return <article className={`message ${event.role} ${matches ? 'search-hit' : ''}`}>
    <div className="message-rail">{event.role === 'assistant' ? <Bot size={17} /> : <UserRound size={17} />}</div>
    <div className="message-body"><div className="message-label">{event.role === 'assistant' ? 'GROK' : 'YOU'}</div><Markdown preview={preview}>{event.text}</Markdown></div>
  </article>
  if (event.kind === 'turn') return <div className={`turn-marker ${event.status}`}><span />{event.status === 'running' ? 'Grok 正在工作' : `回合${event.status === 'completed' ? '完成' : event.status}`}</div>
  const icon = event.kind === 'tool' ? <Wrench size={16} /> : event.kind === 'thought' ? <Zap size={16} /> : event.kind === 'plan' ? <ListTodo size={16} /> : event.kind === 'subagent' ? <Bot size={16} /> : event.kind === 'task' ? <Activity size={16} /> : <CircleAlert size={16} />
  const title = eventTitle(event)
  return <article className={`event-card ${event.kind} ${matches ? 'search-hit' : ''}`}>
    <button className="event-head" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{icon}<span>{title}</span>{'status' in event && <em>{event.status}</em>}</button>
    {open && <div className="event-content">
      {event.kind === 'thought' && <Markdown preview={preview}>{event.text}</Markdown>}
      {event.kind === 'tool' && <><pre>{event.rawInput ? JSON.stringify(event.rawInput, null, 2) : 'No input details'}</pre>{event.output && <Markdown preview={preview}>{event.output}</Markdown>}</>}
      {event.kind === 'plan' && <ol>{event.entries.map((entry, index) => <li key={index} data-status={entry.status}>{entry.content}<small>{entry.status}</small></li>)}</ol>}
      {event.kind === 'subagent' && <p>{event.output ?? `Subagent ${event.status}`}</p>}
      {event.kind === 'task' && <p>Background task · {event.status}</p>}
      {event.kind === 'recap' && <Markdown preview={preview}>{event.summary}</Markdown>}
      {event.kind === 'error' && <p>{event.message}</p>}
      {event.kind === 'unknown' && <p>{event.summary}</p>}
      {event.kind === 'commands' && <p>{event.commands.length} commands available</p>}
      {event.kind === 'mode' && <p>Current mode: {event.modeId}</p>}
      {event.kind === 'usage' && <p>{event.used ?? '—'} / {event.size ?? '—'} tokens</p>}
      {event.kind === 'compact' && (
        <p>
          {event.summary
            ? event.summary
            : event.source === 'inferred'
              ? formatInferredCompactSummary({
                  before: event.before,
                  after: event.after,
                  reason: 'token_drop'
                })
              : `${event.before ?? '—'} → ${event.after ?? '—'} tokens`}
        </p>
      )}
      {event.kind === 'retry' && <p>{event.reason}</p>}
    </div>}
  </article>
}

const MemoEventCard = React.memo(EventCard)
const TranscriptFooter = (): React.JSX.Element => <div className="transcript-end">END OF CURRENT CONTEXT</div>

function SettingsPanel({
  settings,
  onSave,
  onLiveChange,
  onClose,
  cliVersion,
  onOpenRemote
}: {
  settings: AppSettings
  onSave: (settings: AppSettings) => void
  /** Instant preview for theme / font / cockpit (no need to hit Save first). */
  onLiveChange?: (settings: AppSettings) => void
  onClose: () => void
  cliVersion?: string
  /** Remote lives in the capability panel; settings is where users look for it. */
  onOpenRemote?: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(settings)
  const conflicts = findShortcutConflicts(draft.shortcuts)
  const update = (next: AppSettings): void => {
    setDraft(next)
    onLiveChange?.(next)
  }
  return <aside className="drawer" data-testid="settings-drawer"><div className="drawer-head"><div><span className="eyebrow">LOCAL PREFERENCES</span><h2>工作台設定</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <p className="settings-live-hint">深色／亮色、字級、座艙開關會<strong>即時預覽</strong>；按「儲存設定」才寫入本機。</p>
    <div className="settings-section"><label>Grok 執行檔<input value={draft.grokExecutable} onChange={(event) => update({ ...draft, grokExecutable: event.target.value })} /></label>
      <p className="cli-update-hint" data-testid="cli-update-hint">目前 CLI{cliVersion ? ` ${cliVersion}` : ''}。若缺少插話、額度或新指令，請以官方腳本更新：<code>irm https://x.ai/cli/install.ps1 | iex</code></p>
    </div>
    <div className="settings-grid">
      <label>字級 <output>{draft.fontSize}px</output><input type="range" min="12" max="22" value={draft.fontSize} onChange={(event) => update({ ...draft, fontSize: Number(event.target.value) })} /></label>
      <label>行高 <output>{draft.lineHeight.toFixed(2)}</output><input type="range" min="1.2" max="2.1" step="0.05" value={draft.lineHeight} onChange={(event) => update({ ...draft, lineHeight: Number(event.target.value) })} /></label>
      <label>內容寬度 <output>{draft.contentWidth}px</output><input type="range" min="640" max="1400" step="20" value={draft.contentWidth} onChange={(event) => update({ ...draft, contentWidth: Number(event.target.value) })} /></label>
    </div>
    <div className="theme-choice"><button type="button" className={draft.theme === 'dark' ? 'active' : ''} onClick={() => update({ ...draft, theme: 'dark' })}><Moon />深色</button><button type="button" className={draft.theme === 'light' ? 'active' : ''} onClick={() => update({ ...draft, theme: 'light' })}><Sun />亮色</button></div>
    {onOpenRemote && <div className="settings-section"><div className="section-title"><h3>手機 QR 遙控</h3><small>設定放在「功能矩陣」面板</small></div>
      <button type="button" className="secondary wide" data-testid="settings-open-remote" onClick={onOpenRemote}><Smartphone />前往手機遙控設定</button>
    </div>}
    <div className="settings-section cockpit-settings"><div className="section-title"><h3>銀河座艙</h3><small>深色與亮色各有專屬星空</small></div>
      <div className="immersion-choice"><button type="button" className={draft.immersion === 'focus' ? 'active' : ''} onClick={() => update({ ...draft, immersion: 'focus' })}><strong>閱讀優先</strong><small>紙感對話區</small></button><button type="button" className={draft.immersion === 'deep' ? 'active' : ''} onClick={() => update({ ...draft, immersion: 'deep' })}><strong>全沉浸</strong><small>深色玻璃對話區</small></button></div>
      <label className="toggle-row"><span><strong>曲速星空</strong><small>執行狀態聯動與 Canvas 降級</small></span><input type="checkbox" checked={draft.effects.galaxy} onChange={(event) => update({ ...draft, effects: { ...draft.effects, galaxy: event.target.checked } })} /></label>
      <label className="toggle-row"><span><strong>星航游標</strong><small>拖尾、nova 與磁吸</small></span><input type="checkbox" checked={draft.effects.cursor} onChange={(event) => update({ ...draft, effects: { ...draft.effects, cursor: event.target.checked } })} /></label>
      <label className="toggle-row"><span><strong>停用全部動效</strong><small>保留靜態星圖與完整功能</small></span><input type="checkbox" checked={draft.effects.reducedMotion} onChange={(event) => update({ ...draft, effects: { ...draft.effects, reducedMotion: event.target.checked } })} /></label>
      <label className="density-row"><span>粒子密度</span><select value={draft.effects.density} onChange={(event) => update({ ...draft, effects: { ...draft.effects, density: event.target.value as AppSettings['effects']['density'] } })}><option value="low">低 · 600</option><option value="medium">中 · 1000</option><option value="high">高 · 1500</option></select></label>
    </div>
    <div className="settings-section preview-settings" data-testid="preview-settings"><div className="section-title"><h3>預覽台</h3></div>
      <label className="toggle-row"><span><strong>啟動時展開預覽台</strong><small>記住展開狀態</small></span><input type="checkbox" checked={draft.preview.open} onChange={(event) => update({ ...draft, preview: { ...draft.preview, open: event.target.checked } })} /></label>
      <label className="toggle-row"><span><strong>自動預覽最新媒體</strong><small>對話完成後自動打開最新圖／影（預設關）</small></span><input type="checkbox" checked={draft.preview.autoPreviewLatestMedia} onChange={(event) => update({ ...draft, preview: { ...draft.preview, autoPreviewLatestMedia: event.target.checked } })} /></label>
      <label className="toggle-row"><span><strong>顯示 HTML「允許腳本」</strong><small>進階按鈕；腳本同意仍為逐檔逐次</small></span><input type="checkbox" checked={draft.preview.showHtmlScriptAdvanced} onChange={(event) => update({ ...draft, preview: { ...draft.preview, showHtmlScriptAdvanced: event.target.checked } })} /></label>
      <label>圖片上限 MB <output>{draft.preview.maxImageMb}</output><input type="range" min="1" max="100" value={draft.preview.maxImageMb} onChange={(event) => update({ ...draft, preview: { ...draft.preview, maxImageMb: Number(event.target.value) } })} /></label>
      <label>影片上限 MB <output>{draft.preview.maxVideoMb}</output><input type="range" min="1" max="1024" value={draft.preview.maxVideoMb} onChange={(event) => update({ ...draft, preview: { ...draft.preview, maxVideoMb: Number(event.target.value) } })} /></label>
    </div>
    <div className="settings-section"><div className="section-title"><h3>快捷鍵</h3><button type="button" className="text-button" onClick={() => update({ ...draft, shortcuts: DEFAULT_SHORTCUTS.map((binding) => ({ ...binding })) })}>恢復預設</button></div>
      {draft.shortcuts.map((binding, index) => <label className="shortcut-row" key={binding.command}><span>{binding.command}</span><input value={binding.accelerator} onChange={(event) => update({ ...draft, shortcuts: draft.shortcuts.map((item, i) => i === index ? { ...item, accelerator: event.target.value } : item) })} /><small>{binding.scope}</small></label>)}
      {conflicts.length > 0 && <div className="warning"><CircleAlert />{conflicts.map((item) => item.accelerator).join('、')} 發生衝突</div>}
    </div>
    <button type="button" className="primary wide" disabled={conflicts.length > 0} onClick={() => onSave(draft)}>儲存設定</button>
  </aside>
}

const FEATURES = [
  ['聊天、串流、工具、權限', 'ACP 原生', 'native'], ['Session 新建／載入', 'ACP 原生', 'native'], ['模型與模式', '依 capability', 'conditional'],
  ['Plan、Todos、Subagents', '結構化事件', 'native'], ['Compact／Rewind', '在 TUI 開啟', 'fallback'], ['Plugins／MCP／Memory', '在 TUI 開啟', 'fallback'],
  ['Worktree／Fork', '依 capability', 'conditional'], ['Session 匯出', 'CLI 子命令', 'native']
]

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<CliStatus>(emptyStatus)
  const [caps, setCaps] = useState<AgentCapabilities>(EMPTY_CAPS)
  const [models, setModels] = useState<ModelState | undefined>()
  const [settings, setSettings] = useState<AppSettings>(() => createDefaultSettings(''))
  const [settingsHydrated, setSettingsHydrated] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [active, setActive] = useState<SessionSummary | null>(null)
  const [events, setEvents] = useState<Record<string, UiSessionEvent[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [attachmentsBySession, setAttachmentsBySession] = useState<Record<string, PromptBlock[]>>({})
  const [sessionQuery, setSessionQuery] = useState('')
  const [connectionGeneration, setConnectionGeneration] = useState<number>(0)
  const connectionGenerationRef = useRef<number>(0)
  const [sessionReady, setSessionReady] = useState<SessionReadyMap>({})
  const [reconnecting, setReconnecting] = useState<boolean>(false)
  const [lastExportedPath, setLastExportedPath] = useState<string | null>(null)
  const [exportedPaths, setExportedPaths] = useState<Record<string, string>>({})
  const activeReady = active ? isSessionReady(sessionReady, active.id, connectionGeneration) : false
  const [transcriptQuery, setTranscriptQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>('none')
  const [permissions, setPermissions] = useState<PermissionRequest[]>([])
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>('ask')
  const [remoteControlActive, setRemoteControlActive] = useState(false)
  const [remoteState, setRemoteState] = useState<RemoteDesktopState | null>(null)
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [remoteAllowPhonePerms, setRemoteAllowPhonePerms] = useState(false)
  const [remoteUseQuickTunnel, setRemoteUseQuickTunnel] = useState(false)
  /** Skip desktop→main focus echo while aligning UI to phone-owned focus. */
  const aligningRemoteFocusRef = useRef(false)
  const lastRemoteNoticeRef = useRef<string>('')
  /** Monotonic seq so stale async focus align cannot overwrite a newer intent. */
  const remoteFocusAlignSeqRef = useRef(0)
  /** Mirror of remote main queue for drain decisions (avoid double-send). */
  const remoteMainQueueRef = useRef<RemoteDesktopQueue | null>(null)
  /** Latest main-owned focus id — stale phone align must not overwrite. */
  const remoteMainFocusRef = useRef<string | null>(null)
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({})
  const [yoloConfirm, setYoloConfirm] = useState(false)
  const [yoloBusy, setYoloBusy] = useState(false)
  const [loadingSessionIds, setLoadingSessionIds] = useState<string[]>([])
  /** P-DRAG multi path chips per session (absolute paths) with optional thumbnails. */
  const [pathChipsBySession, setPathChipsBySession] = useState<Record<string, PathChip[]>>({})
  /** Paths also sent as image blocks — strip matching draft lines on send (P-DRAG-4). */
  const [imagePathDedupeBySession, setImagePathDedupeBySession] = useState<Record<string, string[]>>({})
  /** Mid-turn interjection lifecycle (queued → cleared on turn end / cancel discard). */
  const [interjectState, setInterjectState] = useState<InterjectUiState>(null)
  const [interjectBusy, setInterjectBusy] = useState(false)
  /** F-INT-4: local next-turn queue (no official x.ai/queue/* method). */
  const [localQueue, setLocalQueue] = useState<LocalQueuedPrompt | null>(null)
  const localQueueRef = useRef<LocalQueuedPrompt | null>(null)
  localQueueRef.current = localQueue
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  /** P-FOLDER: full-cwd filter (`all` = every project). */
  const [folderFilter, setFolderFilter] = useState<string | 'all'>('all')
  const [showCleanupSuggestions, setShowCleanupSuggestions] = useState(false)
  /** Agents Team: multi-session side-by-side (opt-in). */
  const [teamEnabled, setTeamEnabled] = useState(false)
  const [team, setTeam] = useState<AgentsTeamState>(() => emptyAgentsTeam())
  const [usage, setUsage] = useState<SessionUsage | null>(null)
  /** Per-session last official (Scheme A) compact wall time — suppresses Fallback C double-notice. */
  const lastOfficialCompactAtRef = useRef<Record<string, number>>({})
  /** Per-session last inferred (Fallback C) episode — debounce spam. */
  const lastInferredCompactAtRef = useRef<Record<string, number>>({})
  /** Last usage sample per session for sharp-drop detection. */
  const usageSampleRef = useRef<Record<string, SessionUsage>>({})
  /** Smoke harness / late binding for openPreviewPath. */
  const openPreviewPathRef = useRef<(path: string) => void>(() => {})
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [billingUnavailable, setBillingUnavailable] = useState(false)
  const [errorPulse, setErrorPulse] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null)
  const [batchDeleteTargets, setBatchDeleteTargets] = useState<SessionSummary[] | null>(null)
  const [collapsingSessionId, setCollapsingSessionId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [followTail, setFollowTail] = useState(true)
  const [unread, setUnread] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [previewItemsBySession, setPreviewItemsBySession] = useState<Record<string, PreviewItem[]>>({})
  const [previewActiveId, setPreviewActiveId] = useState<string | null>(null)
  const [previewLoad, setPreviewLoad] = useState<PreviewLoadState>({ status: 'idle' })
  /** Session-scoped HTML script consent: key = item id, never persisted. */
  const [htmlScriptConsent, setHtmlScriptConsent] = useState<Record<string, boolean>>({})
  const previewDiscoverTimer = useRef<number | null>(null)
  const scanPreviewForSessionRef = useRef<((sessionId: string) => void) | null>(null)
  const [notice, setNotice] = useState('')
  // Toasts used to sit there forever until dismissed by hand; long enough to read,
  // then out of the way (the ✕ still works for an early dismiss).
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 12_000)
    return () => window.clearTimeout(timer)
  }, [notice])
  const [setupDialog, setSetupDialog] = useState<SetupDialog>(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const virtuoso = useRef<VirtuosoHandle>(null)
  const sessionSearchRef = useRef<HTMLInputElement>(null)
  const transcriptSearchRef = useRef<HTMLInputElement>(null)
  const mainComposerRef = useRef<HTMLDivElement>(null)
  const mainComposerTextareaRef = useRef<HTMLTextAreaElement>(null)
  const createSessionRef = useRef<() => void>(() => {})
  const jumpToLatestRef = useRef<() => void>(() => {})
  const followTailRef = useRef(true)
  const activeIdRef = useRef<string | null>(null)
  const billingRef = useRef<BillingInfo | null>(null)
  const loadingSessionsRef = useRef<Set<string>>(new Set())
  const permissionReturnFocusRef = useRef<HTMLElement | null>(null)
  const setupReturnFocusRef = useRef<HTMLElement | null>(null)
  const deletingSessionsRef = useRef(false)
  const cancelActiveTurnRef = useRef<(sessionId: string) => Promise<void>>(async () => {})
  const sessionsRef = useRef<SessionSummary[]>([])
  const remoteControlActiveRef = useRef(false)
  followTailRef.current = followTail
  activeIdRef.current = active?.id ?? null
  sessionsRef.current = sessions
  remoteControlActiveRef.current = remoteControlActive

  const updateConnectionGeneration = (newGen: number): void => {
    connectionGenerationRef.current = newGen
    setConnectionGeneration(newGen)
  }

  const refreshUsage = async (sessionId: string): Promise<void> => {
    try {
      const next = await window.grokApi.getUsage(sessionId)
      if (!next) return
      const previous = usageSampleRef.current[sessionId]
      usageSampleRef.current[sessionId] = next
      if (activeIdRef.current === sessionId) setUsage(next)

      // Fallback C: sharp signals.json drop without recent official compact → hedged notice.
      const inferred = shouldEmitInferredCompact(previous, next, {
        lastOfficialCompactAt: lastOfficialCompactAtRef.current[sessionId],
        lastInferredEpisodeAt: lastInferredCompactAtRef.current[sessionId]
      })
      if (inferred) {
        lastInferredCompactAtRef.current[sessionId] = Date.now()
        const event: UiSessionEvent = {
          id: `${sessionId}:compact:inferred:${Date.now()}`,
          sessionId,
          kind: 'compact',
          before: inferred.before,
          after: inferred.after,
          summary: formatInferredCompactSummary(inferred),
          source: 'inferred'
        }
        setEvents((current) => {
          const prior = current[sessionId] ?? []
          const reduced = sessionReducer(
            { sessionId, events: prior, running: false, followTail: true, unread: 0 },
            { type: 'event', event }
          )
          return { ...current, [sessionId]: reduced.events }
        })
      }
    } catch { /* usage 屬輔助資訊，讀不到不打斷操作 */ }
  }
  const refreshUsageRef = useRef(refreshUsage)
  refreshUsageRef.current = refreshUsage

  const refreshBilling = async (): Promise<void> => {
    try {
      const next = await window.grokApi.getBilling()
      if (!next) { setBilling(null); setBillingUnavailable(true); return }
      const previous = billingRef.current
      if (previous) {
        const storageKey = quotaAlertStorageKey(next)
        const reminded = readQuotaReminders(storageKey)
        const threshold = selectCrossedQuotaThreshold(previous.creditUsagePercent, next.creditUsagePercent, reminded)
        if (threshold) {
          reminded.add(threshold)
          try { localStorage.setItem(storageKey, JSON.stringify([...reminded])) } catch { /* 寫入失敗不影響提醒本身 */ }
          setNotice(threshold === 95 ? '訂閱額度已達 95%，反應爐進入紅色警戒' : '訂閱額度已達 80%，請留意本週餘量')
        }
      }
      billingRef.current = next
      setBilling(next)
      setBillingUnavailable(false)
    } catch {
      setBilling(null)
      setBillingUnavailable(true)
    }
  }
  const refreshBillingRef = useRef(refreshBilling)
  refreshBillingRef.current = refreshBilling

  const refreshSessions = async (): Promise<void> => {
    try {
      const next = await window.grokApi.listSessions()
      setSessions((current) => {
        const activeId = activeIdRef.current
        const activeSummary = activeId ? current.find((item) => item.id === activeId) : undefined
        return activeSummary && !next.some((item) => item.id === activeId) ? [activeSummary, ...next] : next
      })
    } catch { /* 側欄刷新失敗不打斷操作 */ }
  }
  const refreshSessionsRef = useRef(refreshSessions)
  refreshSessionsRef.current = refreshSessions

  const permission = permissions[0] ?? null
  const safePermissionOptionId = permission?.options.find((option) => option.kind.includes('reject'))?.optionId
  const running = active ? runningMap[active.id] === true : false
  /** Any Team/active pane still running — permission reconnect must not tear down peers. */
  const anyRunning = Object.values(runningMap).some(Boolean)
  const sessionLoading = loadingSessionIds.length > 0
  const permissionControlsLocked = lifecycleBusy || running || anyRunning || sessionLoading || yoloBusy
  const attachments = active ? attachmentsBySession[active.id] ?? [] : []
  const permissionModeTitle = running || anyRunning
    ? '請先停止所有執行中的回合（含 Agents Team）'
    : lifecycleBusy || sessionLoading
      ? '系統忙碌中，請稍候再切換權限模式'
      : PERMISSION_ASK_TOOLTIP

  useEffect(() => {
    if (permission) return
    const target = permissionReturnFocusRef.current
    permissionReturnFocusRef.current = null
    if (target?.isConnected) target.focus()
  }, [permission])

  useEffect(() => {
    if (setupDialog) return
    const target = setupReturnFocusRef.current
    setupReturnFocusRef.current = null
    if (target?.isConnected) target.focus()
  }, [setupDialog])

  const openSetupDialog = (dialog: Exclude<SetupDialog, null>): void => {
    if (!setupDialog && document.activeElement instanceof HTMLElement) setupReturnFocusRef.current = document.activeElement
    setSetupDialog(dialog)
  }

  // Electron smoke harness (preview C13): activate a session without folder dialog.
  useEffect(() => {
    const api = {
      activateSession: (session: SessionSummary) => {
        if (!session?.id || !session.cwd) return
        setSessions((current) => current.some((item) => item.id === session.id) ? current : [session, ...current])
        setActive(session)
        setEvents((current) => current[session.id] ? current : { ...current, [session.id]: [] })
        setSessionReady((current) => markSessionReadyIfCurrent(current, session.id, connectionGenerationRef.current, connectionGenerationRef.current))
      },
      openPreviewPath: (filePath: string) => {
        openPreviewPathRef.current?.(filePath)
      }
    }
    window.__grokSmoke = api
    return () => {
      if (window.__grokSmoke === api) delete window.__grokSmoke
    }
  }, [])

  useEffect(() => {
    void Promise.all([
      window.grokApi.getStatus().catch(() => ({ ...emptyStatus })),
      window.grokApi.listSessions().catch(() => [] as SessionSummary[]),
      window.grokApi.getSettings().catch(() => createDefaultSettings(''))
    ]).then(([nextStatus, nextSessions, nextSettings]) => {
      const normalizedSettings = pruneOrphanSessionLocalData(nextSettings, nextSessions.map((session) => session.id))
      if (normalizedSettings !== nextSettings) void window.grokApi.saveSettings(normalizedSettings).catch(() => undefined)
      void window.grokApi.getPermissionMode().then((mode) => setPermissionMode(mode)).catch(() => setPermissionMode('ask'))
      setStatus(nextStatus)
      setSessions(nextSessions)
      setSettings(normalizedSettings)
      setDrafts(normalizedSettings.drafts)
      setSettingsHydrated(true)
    })
    const offEvent = window.grokApi.onEvent((event) => {
      setEvents((current) => {
        const previous = current[event.sessionId] ?? []
        const next = sessionReducer({ sessionId: event.sessionId, events: previous, running: false, followTail: true, unread: 0 }, { type: 'event', event })
        return { ...current, [event.sessionId]: next.events }
      })
      if (event.kind === 'commands') setCaps((current) => ({ ...current, commands: event.commands }))
      if (event.kind === 'mode') setCaps((current) => ({ ...current, currentModeId: event.modeId }))
      if (event.kind === 'compact' && event.source !== 'inferred') {
        lastOfficialCompactAtRef.current[event.sessionId] = Date.now()
      }
      if (event.kind === 'error') setErrorPulse((value) => value + 1)
      if (event.kind === 'turn') {
        setRunningMap((current) => ({ ...current, [event.sessionId]: event.status === 'running' }))
        if (event.status !== 'running') {
          setPermissions((current) => current.filter((item) => item.sessionId !== event.sessionId))
          // P1-1: no drain evidence via SDK closed union — clear queued without claiming delivered.
          setInterjectState((current) =>
            current?.status === 'queued' && current.sessionId === event.sessionId ? null : current)
          // F-INT-4: drain local next-turn queue after the active turn ends.
          // E9: when main currently holds a queue for this session, main drains it —
          // skip local drain for that session to avoid double-send. Pre-remote local
          // queues (main queue empty) still drain here even if Remote is later enabled.
          if (shouldDrainLocalQueue(event.status)) {
            const mainQ = remoteMainQueueRef.current
            const mainOwnsSession =
              remoteControlActiveRef.current &&
              mainQ &&
              mainQ.sessionId === event.sessionId
            if (!mainOwnsSession) {
              const { next, drained } = takeQueueForSession(localQueueRef.current, event.sessionId)
              if (drained) {
                localQueueRef.current = next
                setLocalQueue(next)
                const blocks: PromptBlock[] = [
                  ...(drained.text ? [{ type: 'text' as const, text: drained.text }] : []),
                  ...drained.attachments
                ]
                setRunningMap((current) => ({ ...current, [event.sessionId]: true }))
                void window.grokApi.sendPrompt(event.sessionId, blocks).catch((error) => {
                  setNotice(error instanceof Error ? error.message : String(error))
                  setRunningMap((current) => ({ ...current, [event.sessionId]: false }))
                })
              }
            }
          }
          // F-UX-1: system notification when the turn finishes (main suppresses if focused).
          if (event.status === 'completed' || event.status === 'cancelled' || event.status === 'error') {
            const title = event.status === 'completed' ? 'Grok 回合完成' : event.status === 'cancelled' ? 'Grok 回合已取消' : 'Grok 回合結束（錯誤）'
            void window.grokApi.notify({ title, body: '回到 Grok Build Control Center 查看結果' }).catch(() => undefined)
          }
          // Preview discover on turn complete (debounced; does not steal focus unless auto-preview setting).
          if (event.status === 'completed') {
            if (previewDiscoverTimer.current) window.clearTimeout(previewDiscoverTimer.current)
            previewDiscoverTimer.current = window.setTimeout(() => {
              scanPreviewForSessionRef.current?.(event.sessionId)
            }, 280)
          }
          void refreshUsageRef.current(event.sessionId)
          void refreshSessionsRef.current()
          window.setTimeout(() => { void refreshBillingRef.current() }, 800)
        }
      }
      if (!followTailRef.current && event.sessionId === activeIdRef.current) setUnread((value) => value + 1)
    })
    const offPermission = window.grokApi.onPermission((request) => setPermissions((current) => {
      if (current.length === 0 && document.activeElement instanceof HTMLElement) permissionReturnFocusRef.current = document.activeElement
      return [...current, request]
    }))
    // Phone answered a permission — remove the matching desktop modal instead of leaving
    // a stale card that errors with「no longer active」when clicked.
    const offPermissionResolved = window.grokApi.onPermissionResolved?.((payload) =>
      setPermissions((current) => current.filter((item) => item.requestId !== payload.requestId)))
    const offStatus = window.grokApi.onStatus((next) => {
      if (next.connected !== undefined) setStatus((current) => ({ ...current, connected: next.connected === true }))
      if (next.connected === false) {
        setPermissions([])
        setCaps(EMPTY_CAPS)
        setModels(undefined)
        billingRef.current = null
        setBilling(null)
        setBillingUnavailable(false)
        // Bump generation so in-flight create/load cannot mark stale ready.
        const nextGen = bumpConnectionGeneration(connectionGenerationRef.current)
        connectionGenerationRef.current = nextGen
        setConnectionGeneration(nextGen)
        setSessionReady(invalidateAllReadiness())
      }
      if (next.stderr) console.warn('[grok stderr]', next.stderr)
      if (next.message) setNotice(next.message)
    })
    return () => { offEvent(); offPermission(); offPermissionResolved?.(); offStatus() }
  }, [])

  useEffect(() => {
    if (!status.connected) return
    void refreshBillingRef.current()
    const timer = window.setInterval(() => { void refreshBillingRef.current() }, 600_000)
    return () => window.clearInterval(timer)
  }, [status.connected])

  useEffect(() => {
    void window.grokApi.remoteGetState().then((state) => {
      setRemoteState(state)
      setRemoteControlActive(state.enabled)
    }).catch(() => undefined)
    const offState = window.grokApi.onRemoteState((state) => {
      setRemoteState(state)
      setRemoteControlActive(state.enabled)
      remoteMainQueueRef.current = state.queue ?? null
      remoteMainFocusRef.current = state.focusSessionId ?? null
      // E9: main queue last-writer wins — drop local queue for that session so we do not
      // drain text (main) + attachments (local) as two competing prompts.
      if (state.queue) {
        const local = localQueueRef.current
        if (local && local.sessionId === state.queue.sessionId) {
          localQueueRef.current = null
          setLocalQueue(null)
        }
      }
      const notice = state.notices?.[0]
      if (notice && notice !== lastRemoteNoticeRef.current) {
        lastRemoteNoticeRef.current = notice
        setNotice(notice)
      }
      // Mirror main focus readiness when load finishes (renderer does not re-load).
      if (state.focusSessionId && state.focusStatus === 'ready') {
        const id = state.focusSessionId
        setSessionReady((current) =>
          markSessionReadyIfCurrent(current, id, connectionGenerationRef.current, connectionGenerationRef.current)
        )
      }
    })
    return offState
  }, [])

  /** Wave 5: renderer only aligns UI to main-owned remote focus (no second load authority). */
  useEffect(() => {
    const off = window.grokApi.onRemoteFocusChanged((payload) => {
      const sessionId = payload.sessionId
      if (!sessionId) return
      // Trust main event immediately (state may lag behind focus-changed).
      remoteMainFocusRef.current = sessionId
      const seq = ++remoteFocusAlignSeqRef.current
      void (async () => {
        aligningRemoteFocusRef.current = true
        try {
          let session = sessionsRef.current.find((item) => item.id === sessionId)
          if (!session) {
            const list = await window.grokApi.listSessions().catch(() => [] as SessionSummary[])
            if (seq !== remoteFocusAlignSeqRef.current) return
            setSessions(list)
            session = list.find((item) => item.id === sessionId)
          }
          // seq gate only: desktop loadSession bumps seq; do not compare stale state focus id
          if (seq !== remoteFocusAlignSeqRef.current) return
          if (!session) {
            setNotice('手機已切換焦點，但本機列表尚無該對話')
            return
          }
          setActive(session)
          activeIdRef.current = sessionId
          setFollowTail(true)
          setUnread(0)
          if (payload.focusStatus === 'ready') {
            setSessionReady((current) =>
              markSessionReadyIfCurrent(current, sessionId, connectionGenerationRef.current, connectionGenerationRef.current)
            )
          } else if (payload.focusStatus === 'loading') {
            setNotice('手機焦點對話載入中…')
          } else if (payload.focusStatus === 'error') {
            setNotice('手機焦點對話載入失敗')
          }
        } finally {
          if (seq === remoteFocusAlignSeqRef.current) {
            // Allow next user-driven focus change to push to main
            window.setTimeout(() => {
              if (seq === remoteFocusAlignSeqRef.current) aligningRemoteFocusRef.current = false
            }, 0)
          }
        }
      })()
    })
    return off
  }, [])

  useEffect(() => {
    if (!remoteControlActive) return
    if (aligningRemoteFocusRef.current) return
    void window.grokApi.remoteSetFocus(active?.id ?? null).catch(() => undefined)
  }, [active?.id, remoteControlActive])

  useEffect(() => {
    if (!settingsHydrated) return
    const timer = window.setTimeout(() => { void window.grokApi.saveSettings({ ...settings, drafts }) }, 500)
    return () => window.clearTimeout(timer)
  }, [drafts, settings, settingsHydrated])

  useEffect(() => {
    if (!running || !active?.id) return
    const sessionId = active.id
    const timer = setInterval(() => { void refreshUsageRef.current(sessionId) }, 5000)
    return () => clearInterval(timer)
  }, [running, active?.id])

  /** P-COMP-MAIN: grow whole .composer up to 50vh; shrink when draft cleared. */
  const syncMainComposerHeight = useCallback((): void => {
    const box = mainComposerRef.current
    const ta = mainComposerTextareaRef.current
    if (!box || !ta) return
    fitMainComposer(box, ta, window.innerHeight)
  }, [])

  useEffect(() => {
    syncMainComposerHeight()
  }, [syncMainComposerHeight, active?.id, drafts, running, attachments.length, pathChipsBySession])

  useEffect(() => {
    const box = mainComposerRef.current
    if (!box || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncMainComposerHeight)
      return () => window.removeEventListener('resize', syncMainComposerHeight)
    }
    const ro = new ResizeObserver(() => syncMainComposerHeight())
    ro.observe(box)
    window.addEventListener('resize', syncMainComposerHeight)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncMainComposerHeight)
    }
  }, [syncMainComposerHeight, active?.id])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.isComposing) return
      if (setupDialog && event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      const editing = Boolean(target?.matches('input, textarea, select') || target?.isContentEditable)
      const command = commandForEvent(settings.shortcuts, event, editing ? ['global'] : ['global', 'transcript'])
      if (command === 'toggleSidebar') { event.preventDefault(); setSidebarOpen((current) => !current); return }
      if (command === 'togglePreview') {
        event.preventDefault()
        setSettings((current) => ({
          ...current,
          preview: { ...current.preview, open: !current.preview.open }
        }))
        return
      }
      if (command === 'searchTranscript') { event.preventDefault(); setSearchOpen(true); setTimeout(() => transcriptSearchRef.current?.focus(), 0); return }
      if (command === 'commandPalette') { event.preventDefault(); setPanel('commands'); return }
      if (command === 'searchSessions') { event.preventDefault(); if (!sidebarOpen) setSidebarOpen(true); setTimeout(() => sessionSearchRef.current?.focus(), 0); return }
      if (command === 'newSession') { event.preventDefault(); if (!lifecycleBusy) createSessionRef.current(); return }
      if (command === 'jumpToLatest') { event.preventDefault(); jumpToLatestRef.current(); return }
      if (command === 'cancelTurn' || event.key === 'Escape') {
        // P-CLOSE-2: lightbox is handled in PreviewDock capture phase first.
        if (panel !== 'none') { event.preventDefault(); setPanel('none'); return }
        if (setupDialog) { event.preventDefault(); if (!lifecycleBusy) setSetupDialog(null); return }
        if (batchDeleteTargets) { event.preventDefault(); setBatchDeleteTargets(null); return }
        if (yoloConfirm) { event.preventDefault(); setYoloConfirm(false); return }
        if (deleteTarget) { event.preventDefault(); setDeleteTarget(null); return }
        if (selectMode) { event.preventDefault(); setSelectMode(false); setSelectedIds(new Set()); return }
        if (renameTarget) { event.preventDefault(); setRenameTarget(null); return }
        if (searchOpen) { event.preventDefault(); setSearchOpen(false); setTranscriptQuery(''); return }
        // Clear active Preview item (not dock collapse, not delete, not cancel turn)
        if (previewActiveId || previewLoad.status !== 'idle') {
          event.preventDefault()
          setPreviewActiveId(null)
          setPreviewLoad({ status: 'idle' })
          return
        }
      }
      if (command === 'cancelTurn') {
        event.preventDefault()
        if (running && active) void cancelActiveTurnRef.current(active.id).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))
        return
      }
      if (event.key === '?' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setPanel('shortcuts') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [running, active, panel, setupDialog, lifecycleBusy, batchDeleteTargets, yoloConfirm, deleteTarget, renameTarget, searchOpen, selectMode, sidebarOpen, settings.shortcuts, previewActiveId, previewLoad.status])

  const activeEvents = useMemo(() => active ? events[active.id] ?? [] : [], [active, events])
  const searchHits = useMemo(() => transcriptQuery ? activeEvents.filter((event) => eventText(event).toLocaleLowerCase().includes(transcriptQuery.toLocaleLowerCase())).length : 0, [activeEvents, transcriptQuery])
  const shortcutFor = (command: string): string => settings.shortcuts.find((binding) => binding.command === command)?.accelerator ?? ''
  const shortcutLabel = (command: string): string => shortcutFor(command).replaceAll('+', ' + ')
  const sessionSearchIndex = useMemo(() => {
    return buildSessionSearchIndex(sessions, { titleOverrides: settings.sessionTitles, drafts })
  }, [sessions, settings.sessionTitles, drafts])

  const searchFilteredSessions = useMemo(() => {
    return filterSessionsBySearch(sessions, sessionSearchIndex, sessionQuery)
  }, [sessions, sessionSearchIndex, sessionQuery])
  const folderOptions = useMemo(() => listSessionCwds(sessions), [sessions])
  const filteredSessions = useMemo(
    () => filterSessionsByCwd(searchFilteredSessions, folderFilter),
    [searchFilteredSessions, folderFilter]
  )
  const { pinned, unpinned } = useMemo(
    () => partitionPinnedSessions(filteredSessions, settings.pinnedSessions),
    [filteredSessions, settings.pinnedSessions]
  )
  const sessionGroups = useMemo(() => groupSessionsByProject(unpinned), [unpinned])
  const cleanupCandidates = useMemo(() => suggestedCleanupSessions(sessions, {
    nowMs: Date.now(),
    pinnedIds: settings.pinnedSessions,
    activeSessionId: active?.id,
    teamSessionIds: team.slots
  }), [sessions, settings.pinnedSessions, active?.id, team.slots])
  const selectedCount = selectedIds.size
  const selectedSessions = useMemo(() => sessions.filter((session) => selectedIds.has(session.id)), [sessions, selectedIds])
  const showTeamBoard = teamEnabled && team.slots.length >= 2
  // L2 orb: global connection + any running turn (not sticky error — errorPulse drives starfield only).
  const orbMode: StatusOrbMode = !status.connected ? 'offline' : anyRunning || running ? 'running' : 'idle'
  const renderSessionRow = (session: SessionSummary): React.JSX.Element => {
    const title = sessionDisplayTitle(session, settings.sessionTitles)
    const isPinned = settings.pinnedSessions.includes(session.id)
    const isSelected = selectedIds.has(session.id)
    const inTeam = isInTeam(team, session.id)
    return <div key={session.id} className={`session-row ${active?.id === session.id ? 'active' : ''} ${inTeam ? 'in-team' : ''} ${collapsingSessionId === session.id ? 'collapsing' : ''} ${selectMode ? 'select-mode' : ''} ${isSelected ? 'selected' : ''}`}>
      {selectMode && <input className="session-check" type="checkbox" aria-label={`選擇對話 ${title}`} checked={isSelected} onChange={(event) => toggleSessionSelection(session.id, event.currentTarget.checked)} />}
      <button className="session-open" disabled={lifecycleBusy || loadingSessionIds.includes(session.id)} onClick={() => void loadSession(session)}>
        <span className="session-dot" />
        <div className="session-meta"><strong>{title}{inTeam ? <em className="team-badge">TEAM</em> : null}</strong><small>{session.cwd}</small><time>{formatDate(session.updatedAt)}</time></div>
      </button>
      {!selectMode && (
        <div className="session-actions" data-testid="session-actions">
          {teamEnabled && <button type="button" className={`session-team ${inTeam ? 'active' : ''}`} title={inTeam ? '移出 Agents Team' : '加入 Agents Team'} aria-label={inTeam ? `移出 Team ${title}` : `加入 Team ${title}`} onClick={() => {
            if (inTeam) setTeam((current) => toggleTeamSlot(current, session.id))
            else void loadSession(session)
          }}><Users /></button>}
          <button type="button" className={`session-pin ${isPinned ? 'pinned' : ''}`} title={isPinned ? '取消釘選' : '釘選'} aria-label={isPinned ? `取消釘選 ${title}` : `釘選 ${title}`} onClick={() => togglePinned(session)}><Pin /></button>
          <button type="button" className="session-rename" title="重新命名" aria-label={`重新命名 ${title}`} onClick={() => { setRenameTarget(session); setRenameDraft(title) }}><Pencil /></button>
          <button type="button" className="session-delete" data-nova-tone="danger" title="刪除對話" aria-label={`刪除對話 ${title}`} onClick={() => setDeleteTarget(session)}><Trash2 /></button>
        </div>
      )}
    </div>
  }
  const togglePinned = (session: SessionSummary): void => {
    const next = { ...settings, pinnedSessions: togglePinnedSession(settings.pinnedSessions, session.id) }
    setSettings(next)
    void window.grokApi.saveSettings(next).then(setSettings).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))
  }
  const toggleSessionSelection = (sessionId: string, checked: boolean): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(sessionId)
      else next.delete(sessionId)
      return next
    })
  }
  const selectAllVisibleSessions = (): void => {
    setSelectedIds(new Set(filteredSessions.map((session) => session.id)))
  }
  const beginBatchDelete = (): void => {
    const targets = selectedSessions.filter((session) => filteredSessions.some((item) => item.id === session.id))
    if (!targets.length) return
    setBatchDeleteTargets(targets)
  }
  const clearSelection = (): void => {
    setSelectedIds(new Set())
  }
  const confirmPermissionMode = async (): Promise<void> => {
    if (yoloBusy) return
    if (lifecycleBusy || running || anyRunning || sessionLoading) {
      setYoloConfirm(false)
      setNotice(running || anyRunning ? '請先停止所有執行中的回合（含 Agents Team），再切換權限模式' : '系統忙碌中，請稍候再切換權限模式')
      return
    }
    const yoloGate = canEnableYolo(remoteControlActive)
    if (!yoloGate.ok) {
      setYoloConfirm(false)
      setNotice(yoloGate.reason)
      return
    }
    setYoloBusy(true)
    try {
      await setPermissionModeWithBackend('always-approve')
      setYoloConfirm(false)
    } finally {
      setYoloBusy(false)
    }
  }
  const requestPermissionMode = (mode: AgentPermissionMode): void => {
    // Stays enabled while busy: a disabled <select> swallows its own tooltip in
    // Chromium, so users got a dead control with no reason. Explain instead —
    // the controlled value snaps back on re-render.
    if (permissionControlsLocked) {
      setNotice(running || anyRunning
        ? '回合執行中無法切換工具權限：請先按「停止」或等這一輪完成。'
        : '系統忙碌中（安裝／連線／載入對話），請稍候再切換工具權限。')
      return
    }
    // P-PERM-1: already on 每次詢問 and re-selected → notice + purpose
    if (mode === permissionMode) {
      if (mode === 'ask') setNotice(PERMISSION_ASK_ALREADY_NOTICE)
      return
    }
    if (mode === 'always-approve') {
      const yoloGate = canEnableYolo(remoteControlActive)
      if (!yoloGate.ok) {
        setNotice(yoloGate.reason)
        return
      }
      setYoloConfirm(true)
      return
    }
    void setPermissionModeWithBackend('ask')
  }
  const setPermissionModeWithBackend = async (mode: AgentPermissionMode): Promise<void> => {
    if (mode === 'always-approve') {
      const yoloGate = canEnableYolo(remoteControlActive)
      if (!yoloGate.ok) {
        setNotice(yoloGate.reason)
        return
      }
    }
    const activeSession = active
    const wasConnected = status.connected
    try {
      const nextMode = await window.grokApi.setPermissionMode(mode)
      setPermissionMode(nextMode)
      setNotice(nextMode === 'always-approve'
        ? '⚠️ 已切換到 YOLO 模式（本次啟動有效）'
        : '權限模式已切換為「每次詢問」：工具操作前會先請你確認用途與風險。')
      if (wasConnected) {
        setReconnecting(true)
        try {
          const snap = snapshotTeamReconnect(team, activeSession ? activeSession.id : null, teamEnabled)
          setSessionReady(invalidateAllReadiness())
          const value = await window.grokApi.connect()
          setCaps(value)
          setModels(value.modelState)
          setStatus((current) => ({ ...current, connected: true }))
          const nextGen = bumpConnectionGeneration(connectionGenerationRef.current)
          updateConnectionGeneration(nextGen)
          const slotsToReload = teamEnabled ? snap.slots : (activeSession ? [activeSession.id] : [])
          const loadedData: Record<string, { models: any; modes: any }> = {}
          const reloadSessionBackground = async (session: SessionSummary, gen: number): Promise<boolean> => {
            if (loadingSessionsRef.current.has(session.id)) return false
            loadingSessionsRef.current.add(session.id)
            setLoadingSessionIds((current) => current.includes(session.id) ? current : [...current, session.id])
            try {
              setEvents((current) => ({ ...current, [session.id]: [] }))
              const response = await window.grokApi.loadSession(session.id, session.cwd)
              loadedData[session.id] = { models: response.models, modes: response.modes }
              setSessionReady((current) => markSessionReadyIfCurrent(current, session.id, gen, connectionGenerationRef.current))
              window.setTimeout(() => { void refreshUsageRef.current(session.id) }, 0)
              return true
            } catch {
              setSessionReady((current) => clearSessionReady(current, session.id))
              return false
            } finally {
              loadingSessionsRef.current.delete(session.id)
              setLoadingSessionIds((current) => current.filter((id) => id !== session.id))
            }
          }
          const reloadPromises = slotsToReload.map(async (slotId) => {
            const sessionToLoad = sessions.find((s) => s.id === slotId)
            if (!sessionToLoad) return null
            const success = await reloadSessionBackground(sessionToLoad, nextGen)
            return success ? slotId : null
          })
          const results = await Promise.all(reloadPromises)
          const stillReadyIds = results.filter((id): id is string => id !== null)
          const restored = restoreTeamAfterReconnect(snap, stillReadyIds)
          setTeam(restored.team)
          const nextActive = sessions.find((s) => s.id === restored.activeId) ?? null
          setActive(nextActive)
          activeIdRef.current = restored.activeId
          const activeId = restored.activeId
          if (activeId && loadedData[activeId]) {
            setModels((current) => loadedData[activeId].models ?? current ?? value.modelState)
            applySessionModes(loadedData[activeId].modes)
          }
        } catch (error) {
          setNotice(error instanceof Error ? error.message : String(error))
        } finally {
          setReconnecting(false)
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }
  const connect = async (): Promise<AgentCapabilities | null> => {
    if (lifecycleBusy) return null
    setNotice('正在連接 Grok ACP…')
    const wasConnected = status.connected
    try {
      const value = await window.grokApi.connect()
      setCaps(value)
      setModels(value.modelState)
      setStatus((current) => ({ ...current, connected: true }))
      setNotice('ACP 已連線')
      void refreshBillingRef.current()
      if (!wasConnected || connectionGenerationRef.current === 0) {
        const nextGen = bumpConnectionGeneration(connectionGenerationRef.current)
        updateConnectionGeneration(nextGen)
        setSessionReady(invalidateAllReadiness())
      }
      return value
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
      return null
    }
  }
  const installCli = async (): Promise<void> => {
    if (lifecycleBusy) return
    setLifecycleBusy(true)
    setNotice('正在準備官方 Grok CLI 安裝程式…')
    try {
      const nextStatus = await window.grokApi.installCli()
      setStatus(nextStatus)
      const nextSettings = await window.grokApi.getSettings()
      setSettings(nextSettings)
      setNotice(`Grok CLI ${nextStatus.version ?? ''} 安裝完成，下一步請登入帳號`)
      setSetupDialog('account')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setLifecycleBusy(false)
    }
  }
  const reauthenticateAccount = async (): Promise<void> => {
    if (lifecycleBusy || running || anyRunning) return
    setLifecycleBusy(true)
    setNotice('等待瀏覽器完成 Grok 登入…')
    try {
      const value = await window.grokApi.reauthenticate()
      setCaps(value)
      setModels(value.modelState)
      setActive(null)
      setUsage(null)
      setRunningMap({})
      setTeam(emptyAgentsTeam())
      setTeamEnabled(false)
      setFollowTail(true)
      setUnread(0)
      setStatus((current) => ({ ...current, found: true, connected: true }))
      setSetupDialog(null)
      setNotice('Grok 帳號已重新登入')
      const nextGen = bumpConnectionGeneration(connectionGenerationRef.current)
      updateConnectionGeneration(nextGen)
      setSessionReady(invalidateAllReadiness())
      void refreshSessionsRef.current()
      void refreshBillingRef.current()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setLifecycleBusy(false)
    }
  }
  const applySessionModes = (modes: unknown): void => {
    if (!modes || typeof modes !== 'object') return
    const source = modes as { currentModeId?: unknown; availableModes?: unknown }
    const hasAvailableModes = Array.isArray(source.availableModes)
    const availableModes = hasAvailableModes ? (source.availableModes as unknown[]).flatMap((mode) => {
      if (!mode || typeof mode !== 'object') return []
      const entry = mode as Record<string, unknown>
      return typeof entry.id === 'string' && typeof entry.name === 'string' ? [{ id: entry.id, name: entry.name }] : []
    }) : []
    setCaps((current) => {
      const next = { ...current }
      if (hasAvailableModes) {
        next.modes = availableModes
        if (!availableModes.some((mode) => mode.id === next.currentModeId)) delete next.currentModeId
      }
      if (typeof source.currentModeId === 'string') next.currentModeId = source.currentModeId
      return next
    })
  }
  const createSession = async (): Promise<void> => {
    if (lifecycleBusy) return
    try {
      const cwd = await window.grokApi.chooseDirectory()
      if (!cwd) return
      const capsValue = await connect()
      if (!capsValue) return
      const response = await window.grokApi.createSession(cwd)
      const newSessionId = response.sessionId
      if (!newSessionId) return
      setModels(response.models ?? capsValue.modelState)
      applySessionModes(response.modes)
      const summary = { id: newSessionId, cwd, title: 'New session', updatedAt: new Date().toISOString() }
      setSessions((current) => [summary, ...current])
      setActive(summary)
      const genAtCreate = connectionGenerationRef.current
      setSessionReady((current) => markSessionReadyIfCurrent(current, newSessionId, genAtCreate, connectionGenerationRef.current))
      if (teamEnabled) {
        setTeam((current) => {
          if (isInTeam(current, summary.id)) return setTeamFocus(current, summary.id)
          return toggleTeamSlot(current, summary.id)
        })
      }
      setUsage(null)
      setFollowTail(true)
      setUnread(0)
      void refreshUsage(newSessionId)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }
  const loadSession = async (session: SessionSummary): Promise<void> => {
    if (lifecycleBusy || loadingSessionsRef.current.has(session.id)) return
    // Invalidate in-flight phone focus UI align; desktop focus is last-writer for UI.
    remoteFocusAlignSeqRef.current += 1
    aligningRemoteFocusRef.current = false
    remoteMainFocusRef.current = session.id
    loadingSessionsRef.current.add(session.id)
    setLoadingSessionIds((current) => current.includes(session.id) ? current : [...current, session.id])
    try {
      const capsValue = await connect()
      if (!capsValue) {
        setSessionReady((current) => clearSessionReady(current, session.id))
        return
      }
      const currentGen = connectionGenerationRef.current
      const previousActive = active
      const previousUsage = usage
      const previousEvents = events[session.id]
      setActive(session)
      // Eagerly align the ref so post-await mode/model apply is not raced away by render timing.
      activeIdRef.current = session.id
      if (teamEnabled) {
        setTeam((current) => {
          if (isInTeam(current, session.id)) return setTeamFocus(current, session.id)
          return toggleTeamSlot(current, session.id)
        })
      }
      setUsage(null)
      setFollowTail(true)
      setUnread(0)
      setEvents((current) => ({ ...current, [session.id]: [] }))
      try {
        const response = await window.grokApi.loadSession(session.id, session.cwd)
        if (activeIdRef.current === session.id) {
          setModels((current) => response.models ?? current ?? capsValue.modelState)
          applySessionModes(response.modes)
        }
        setSessionReady((current) => markSessionReadyIfCurrent(current, session.id, currentGen, connectionGenerationRef.current))
        window.setTimeout(() => { void refreshUsageRef.current(session.id) }, 0)
      } catch (error) {
        setSessionReady((current) => clearSessionReady(current, session.id))
        setActive((current) => current?.id === session.id ? previousActive : current)
        if (activeIdRef.current === session.id || activeIdRef.current === previousActive?.id) setUsage(previousUsage)
        setEvents((current) => {
          const next = { ...current }
          if (previousEvents) next[session.id] = previousEvents
          else delete next[session.id]
          return next
        })
        // Do not keep a failed load in Agents Team (pane would prompt an unloaded session).
        setTeam((current) => isInTeam(current, session.id) ? toggleTeamSlot(current, session.id) : current)
        setNotice(error instanceof Error ? error.message : String(error))
      }
    } catch (err) {
      setSessionReady((current) => clearSessionReady(current, session.id))
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      loadingSessionsRef.current.delete(session.id)
      setLoadingSessionIds((current) => current.filter((id) => id !== session.id))
    }
  }
  const deleteSession = async (): Promise<void> => {
    if (!deleteTarget) return
    setDeleteTarget(null)
    await deleteSessions([deleteTarget])
  }
  const deleteSessions = async (targets: SessionSummary[]): Promise<void> => {
    if (!targets.length) return
    // Always dismiss confirm UI first so a second confirm while busy cannot leave a stuck modal.
    setBatchDeleteTargets(null)
    setDeleteTarget(null)
    if (deletingSessionsRef.current) return
    deletingSessionsRef.current = true
    const succeeded: string[] = []
    const failed: string[] = []
    const ids = targets.map((target) => target.id)
    try {
      if (targets.length === 1) setCollapsingSessionId(targets[0].id)
      for (const target of targets) {
        if (runningMap[target.id]) {
          try { await window.grokApi.cancel(target.id) } catch { /* 取消失敗仍繼續刪除 */ }
        }
        try {
          await window.grokApi.deleteSession(target.id)
          succeeded.push(target.id)
        } catch {
          failed.push(target.id)
        }
      }
      if (targets.length === 1 && succeeded.length > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 260))
      }
      const succeededSet = new Set(succeeded)
      if (succeeded.length > 0) {
        setSessions((current) => current.filter((item) => !succeededSet.has(item.id)))
        setEvents((current) => {
          const next = { ...current }
          succeeded.forEach((id) => { delete next[id] })
          return next
        })
        setDrafts((current) => {
          const next = { ...current }
          succeeded.forEach((id) => { delete next[id] })
          return next
        })
        setAttachmentsBySession((current) => {
          const next = { ...current }
          succeeded.forEach((id) => { delete next[id] })
          return next
        })
        const remainingIds = sessions.map((s) => s.id).filter((id) => !succeededSet.has(id))
        const prunedTeam = pruneTeamSlots(team, remainingIds)
        setTeam(prunedTeam)
        if (active && succeededSet.has(active.id)) {
          const promote = prunedTeam.focusId
            ? sessions.find((s) => s.id === prunedTeam.focusId && !succeededSet.has(s.id))
            : undefined
          if (promote) {
            setActive(promote)
            activeIdRef.current = promote.id
          } else {
            setActive(null)
          }
          setUsage(null)
        }
        setSelectedIds((current) => {
          const next = new Set(current)
          succeeded.forEach((id) => next.delete(id))
          return next
        })
        const nextSettings = removeSessionLocalData(settings, succeeded)
        setSettings(nextSettings)
        void window.grokApi.saveSettings(nextSettings).then(setSettings).catch(() => undefined)
        if (targets.length > 1) setNotice(`已刪除 ${succeeded.length}，失敗 ${failed.length}`)
        else setNotice(failed.length > 0
          ? `刪除對話「${sessionDisplayTitle(targets[0], settings.sessionTitles)}」失敗`
          : `已刪除對話「${sessionDisplayTitle(targets[0], settings.sessionTitles)}」`)
      } else {
        setNotice(targets.length > 1 ? `已刪除 0，失敗 ${failed.length}` : `刪除對話「${sessionDisplayTitle(targets[0], settings.sessionTitles)}」失敗`)
      }
      setRunningMap((current) => {
        const next = { ...current }
        ids.forEach((id) => { delete next[id] })
        return next
      })
    } finally {
      deletingSessionsRef.current = false
      setCollapsingSessionId(null)
    }
  }
  const discardQueuedInterject = (sessionId: string): void => {
    // Clear queued UI claim immediately (cancel discards agent-side buffer). No "delivered" claim.
    setInterjectState((current) =>
      current?.status === 'queued' && current.sessionId === sessionId ? null : current)
  }

  const cancelActiveTurn = async (sessionId: string): Promise<void> => {
    const check = sessionActionAllowed(sessionReady, sessionId, connectionGenerationRef.current, {
      loading: loadingSessionIds.includes(sessionId),
      reconnecting
    })
    if (!check.ok) {
      setNotice(check.notice)
      return
    }
    // Cancel discards any buffered interjection on the agent side; clear local "queued" claim.
    discardQueuedInterject(sessionId)
    await window.grokApi.cancel(sessionId)
  }
  cancelActiveTurnRef.current = cancelActiveTurn

  const dispatchPrompt = (sessionId: string, text: string | undefined, pendingAttachments: PromptBlock[]): void => {
    const blocks: PromptBlock[] = [...(text ? [{ type: 'text' as const, text }] : []), ...pendingAttachments]
    setDrafts((current) => ({ ...current, [sessionId]: '' }))
    setAttachmentsBySession((current) => ({ ...current, [sessionId]: [] }))
    void window.grokApi.sendPrompt(sessionId, blocks).catch((error) => {
      setNotice(error instanceof Error ? error.message : String(error))
      setRunningMap((current) => ({ ...current, [sessionId]: false }))
      setDrafts((current) => {
        const newer = current[sessionId] ?? ''
        const restored = text && newer.trim() ? `${text}\n${newer}` : newer || text || ''
        return { ...current, [sessionId]: restored }
      })
      setAttachmentsBySession((current) => ({ ...current, [sessionId]: [...pendingAttachments, ...(current[sessionId] ?? [])] }))
    })
  }

  const addPathChips = (sessionId: string, chips: PathChip[]): void => {
    if (!chips.length) return
    setPathChipsBySession((current) => ({
      ...current,
      [sessionId]: upsertPathChips(current[sessionId] ?? [], chips)
    }))
  }

  const appendPathsToDraft = (sessionId: string, paths: string[]): void => {
    if (!paths.length) return
    setDrafts((current) => ({ ...current, [sessionId]: appendPathLines(current[sessionId] ?? '', paths) }))
    addPathChips(sessionId, paths.map((path) => ({ path })))
  }

  const pathChips = active ? (pathChipsBySession[active.id] ?? []) : []

  const sendPromptFor = async (sessionId: string): Promise<void> => {
    const check = sessionActionAllowed(sessionReady, sessionId, connectionGenerationRef.current, {
      loading: loadingSessionIds.includes(sessionId),
      reconnecting
    })
    if (!check.ok) {
      setNotice(check.notice)
      return
    }
    if (runningMap[sessionId]) return
    const pending = attachmentsBySession[sessionId] ?? []
    const dedupePaths = imagePathDedupeBySession[sessionId] ?? []
    const rawDraft = drafts[sessionId] ?? ''
    const text = stripDuplicateImagePathLines(rawDraft, dedupePaths).trim()
    if (!text && !pending.length) return
    setImagePathDedupeBySession((current) => {
      if (!current[sessionId]) return current
      const next = { ...current }
      delete next[sessionId]
      return next
    })
    setPathChipsBySession((current) => {
      const chips = current[sessionId]
      if (chips?.length) revokePathChipUrls(chips)
      if (!(sessionId in current)) return current
      const next = { ...current }
      delete next[sessionId]
      return next
    })
    dispatchPrompt(sessionId, text || undefined, pending)
  }

  const sendPrompt = async (): Promise<void> => {
    if (!active || running) return
    await sendPromptFor(active.id)
  }

  /** F-INT-2: queue mid-turn guidance without cancelling. */
  const sendInterjectFor = async (sessionId: string): Promise<void> => {
    const check = sessionActionAllowed(sessionReady, sessionId, connectionGenerationRef.current, {
      loading: loadingSessionIds.includes(sessionId),
      reconnecting
    })
    if (!check.ok) {
      setNotice(check.notice)
      return
    }
    if (!runningMap[sessionId] || interjectBusy) return
    const text = drafts[sessionId]?.trim()
    if (!text) return
    setInterjectBusy(true)
    try {
      const result = await window.grokApi.interject(sessionId, text)
      if (result.status === 'queued') {
        setInterjectState({ status: 'queued', sessionId, text })
        setNotice(INTERJECT_QUEUED_NOTICE)
        setDrafts((current) => ({ ...current, [sessionId]: '' }))
      }
    } catch (error) {
      // Method not found → degrade notice only; never fall back to cancel.
      if (isMethodNotFoundError(error)) setNotice(INTERJECT_UNSUPPORTED_NOTICE)
      else setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setInterjectBusy(false)
    }
  }

  const sendInterject = async (): Promise<void> => {
    if (!active || !running || interjectBusy) return
    await sendInterjectFor(active.id)
  }

  /** F-INT-3: cancel active turn then send a fresh prompt (separate control from interject). */
  const doThisNowFor = async (sessionId: string): Promise<void> => {
    const check = sessionActionAllowed(sessionReady, sessionId, connectionGenerationRef.current, {
      loading: loadingSessionIds.includes(sessionId),
      reconnecting
    })
    if (!check.ok) {
      setNotice(check.notice)
      return
    }
    if (!runningMap[sessionId] || interjectBusy) return
    const pendingAttachments = attachmentsBySession[sessionId] ?? []
    const dedupePaths = imagePathDedupeBySession[sessionId] ?? []
    const text = stripDuplicateImagePathLines(drafts[sessionId] ?? '', dedupePaths).trim()
    if (!text && !pendingAttachments.length) return
    setInterjectBusy(true)
    discardQueuedInterject(sessionId)
    // Immediately-send supersedes a local next-turn queue for this session.
    if (localQueue?.sessionId === sessionId) {
      localQueueRef.current = null
      setLocalQueue(null)
    }
    if (remoteControlActive) {
      void window.grokApi.remoteQueueClear().catch(() => undefined)
    }
    setDrafts((current) => ({ ...current, [sessionId]: '' }))
    setAttachmentsBySession((current) => ({ ...current, [sessionId]: [] }))
    setImagePathDedupeBySession((current) => {
      if (!current[sessionId]) return current
      const next = { ...current }
      delete next[sessionId]
      return next
    })
    setPathChipsBySession((current) => {
      const chips = current[sessionId]
      if (chips?.length) revokePathChipUrls(chips)
      if (!(sessionId in current)) return current
      const next = { ...current }
      delete next[sessionId]
      return next
    })
    try {
      await window.grokApi.cancel(sessionId)
      const blocks: PromptBlock[] = [...(text ? [{ type: 'text' as const, text }] : []), ...pendingAttachments]
      setRunningMap((current) => ({ ...current, [sessionId]: true }))
      await window.grokApi.sendPrompt(sessionId, blocks)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
      setRunningMap((current) => ({ ...current, [sessionId]: false }))
      setDrafts((current) => {
        const newer = current[sessionId] ?? ''
        const restored = text && newer.trim() ? `${text}\n${newer}` : newer || text || ''
        return { ...current, [sessionId]: restored }
      })
      setAttachmentsBySession((current) => ({ ...current, [sessionId]: [...pendingAttachments, ...(current[sessionId] ?? [])] }))
    } finally {
      setInterjectBusy(false)
    }
  }

  const doThisNow = async (): Promise<void> => {
    if (!active || !running || interjectBusy) return
    await doThisNowFor(active.id)
  }

  /** F-INT-4 / E9: queue next turn — main single-slot when Remote is on (last writer wins). */
  const queueNextTurn = (): void => {
    if (!active || !running || interjectBusy) return
    const sessionId = active.id
    const text = drafts[sessionId]?.trim()
    if (!text && !attachments.length) return

    // Remote on + text-only: main single-slot (E9).
    // If attachments exist, clear main first (await) then install one local queue so
    // mobile cannot co-queue a second prompt for the same session.
    if (remoteControlActive && text && attachments.length === 0) {
      void window.grokApi.remoteQueue(text).then((result) => {
        if (!result.ok) {
          setNotice(result.message || '排隊失敗')
          return
        }
        setDrafts((current) => ({ ...current, [sessionId]: '' }))
        localQueueRef.current = null
        setLocalQueue(null)
        setNotice(REMOTE_QUEUE_NOTICE_DESKTOP)
      }).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))
      return
    }

    const item: LocalQueuedPrompt = {
      sessionId,
      ...(text ? { text } : {}),
      attachments: [...attachments]
    }
    const installLocal = (): void => {
      localQueueRef.current = item
      setLocalQueue(item)
      setDrafts((current) => ({ ...current, [sessionId]: '' }))
      setAttachmentsBySession((current) => ({ ...current, [sessionId]: [] }))
      setNotice(LOCAL_QUEUE_NOTICE)
    }
    if (remoteControlActive && attachments.length > 0) {
      void window.grokApi.remoteQueueClear()
        .then(() => {
          // Mobile may have last-written during clear; do not install a second slot.
          if (remoteMainQueueRef.current?.sessionId === sessionId) {
            setNotice('手機已更新排隊，桌面附件排隊未寫入')
            return
          }
          installLocal()
        })
        .catch((error) => setNotice(error instanceof Error ? error.message : String(error)))
      return
    }
    installLocal()
  }

  const clearLocalQueue = (): void => {
    if (remoteControlActive && remoteState?.queue) {
      void window.grokApi.remoteQueueClear().then((result) => {
        if (!result.ok) setNotice(result.message || '清除排隊失敗')
        else setNotice(LOCAL_QUEUE_CLEARED_NOTICE)
      }).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))
    }
    if (!localQueue && !(remoteControlActive && remoteState?.queue)) return
    localQueueRef.current = null
    setLocalQueue(null)
    if (!remoteControlActive) setNotice(LOCAL_QUEUE_CLEARED_NOTICE)
  }

  /** Display queue: main remote slot takes precedence when Remote is enabled. */
  const displayQueue: LocalQueuedPrompt | null = (() => {
    if (remoteControlActive && remoteState?.queue) {
      return {
        sessionId: remoteState.queue.sessionId,
        text: remoteState.queue.text,
        attachments: localQueue?.sessionId === remoteState.queue.sessionId ? localQueue.attachments : []
      }
    }
    return localQueue
  })()
  const displayQueueStatus =
    remoteControlActive && remoteState?.queue
      ? remoteQueueStatusLabel(remoteState.queue.source)
      : LOCAL_QUEUE_STATUS

  const chooseFiles = async (): Promise<void> => { try { const files = await window.grokApi.chooseFiles(); addSelectedFiles(files) } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) } }
  const addSelectedFiles = (files: SelectedFile[]): void => { if (!active) return; const sessionId = active.id; const { blocks, paths } = selectedFilesToPrompt(files, caps.promptCapabilities.image === true); setAttachmentsBySession((current) => ({ ...current, [sessionId]: [...(current[sessionId] ?? []), ...blocks] })); if (paths) setDrafts((current) => ({ ...current, [sessionId]: `${current[sessionId] ?? ''}${current[sessionId] ? '\n' : ''}${paths}` })) }
  const jumpToLatest = (): void => { virtuoso.current?.scrollToIndex({ index: Math.max(0, activeEvents.length - 1), align: 'end', behavior: 'smooth' }); setFollowTail(true); setUnread(0) }
  createSessionRef.current = () => { void createSession() }
  jumpToLatestRef.current = jumpToLatest
  const composerKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) return
    const command = commandForEvent(settings.shortcuts, event, ['composer'])
    if (command === 'sendPrompt') {
      event.preventDefault()
      // While a turn is running, Enter queues an interjection (never cancels).
      if (running) void sendInterject()
      else void sendPrompt()
      return
    }
    if (command === 'newline' && active) {
      event.preventDefault()
      const sessionId = active.id
      const target = event.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      setDrafts((current) => {
        const value = current[sessionId] ?? ''
        return { ...current, [sessionId]: `${value.slice(0, start)}\n${value.slice(end)}` }
      })
      window.setTimeout(() => target.setSelectionRange(start + 1, start + 1), 0)
    }
  }
  const openTui = (cwd: string): void => { void window.grokApi.openTui(cwd).catch((error) => setNotice(error instanceof Error ? error.message : String(error))) }
  const changeModel = async (modelId: string): Promise<void> => {
    if (!active || !models) return
    try {
      const model = models.availableModels.find((item) => item.modelId === modelId)
      await window.grokApi.setModel(active.id, modelId, model?.currentReasoningEffort)
      setModels({ ...models, currentModelId: modelId })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
      setModels((current) => current ? { ...current } : current)
    }
  }
  const changeEffort = async (effort: string): Promise<void> => {
    if (!active || !models) return
    try {
      await window.grokApi.setModel(active.id, models.currentModelId, effort)
      setModels({ ...models, availableModels: models.availableModels.map((model) => model.modelId === models.currentModelId ? { ...model, currentReasoningEffort: effort } : model) })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
      setModels((current) => current ? { ...current } : current)
    }
  }
  const saveSessionTitle = async (): Promise<void> => {
    if (!renameTarget) return
    const title = renameDraft.trim()
    const sessionTitles = { ...settings.sessionTitles }
    if (title) sessionTitles[renameTarget.id] = title
    else delete sessionTitles[renameTarget.id]
    const saved = await window.grokApi.saveSettings({ ...settings, drafts, sessionTitles })
    setSettings(saved)
    setRenameTarget(null)
  }
  const rememberCommand = (commandId: string): void => {
    const recentCommands = [commandId, ...settings.recentCommands.filter((id) => id !== commandId)].slice(0, 8)
    const next = { ...settings, drafts, recentCommands }
    setSettings(next)
    void window.grokApi.saveSettings(next).then(setSettings)
  }
  const readFileAsImage = (file: File): Promise<{ data: string; mimeType: string } | null> => new Promise((resolve) => {
    if (!file.type.startsWith('image/') && file.type !== '') { resolve(null); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const data = result.includes(',') ? result.split(',')[1] : result
      if (!data) { resolve(null); return }
      resolve({ data, mimeType: file.type || 'image/png' })
    }
    reader.onerror = () => resolve(null)
    reader.onabort = () => resolve(null)
    reader.readAsDataURL(file)
  })

  /**
   * Clipboard paste images (no Explorer path): save to temp path chips, or image blocks when capable.
   */
  const ingestPastedImages = (files: File[]): void => {
    if (!files.length || !active) return
    const sessionId = active.id
    const imageFiles = files.filter((file) => isImageMime(file.type) || !file.type)
    if (!imageFiles.length) return

    if (caps.promptCapabilities.image === true) {
      void Promise.all(imageFiles.map(async (file): Promise<PromptBlock | null> => {
        const image = await readFileAsImage(file)
        if (!image) return null
        return { type: 'image', data: image.data, mimeType: image.mimeType, name: file.name || undefined }
      })).then((blocks) => {
        const usable = blocks.filter((block): block is PromptBlock => block !== null)
        if (usable.length < blocks.length) setNotice('部分圖片讀取失敗，未加入附件')
        if (usable.length) setAttachmentsBySession((current) => ({ ...current, [sessionId]: [...(current[sessionId] ?? []), ...usable] }))
      })
      return
    }

    void (async () => {
      const chips: PathChip[] = []
      let failed = 0
      for (const file of imageFiles) {
        const image = await readFileAsImage(file)
        if (!image) { failed += 1; continue }
        try {
          const saved = await window.grokApi.savePasteImage(image)
          let previewUrl: string | undefined
          try { previewUrl = URL.createObjectURL(file) } catch { /* optional */ }
          chips.push({ path: saved.path, ...(previewUrl ? { previewUrl } : {}) })
        } catch {
          failed += 1
        }
      }
      if (!chips.length) {
        setNotice(failed ? '貼圖儲存失敗，草稿未變更' : '無法讀取剪貼簿圖片')
        return
      }
      appendPathsToDraft(sessionId, chips.map((chip) => chip.path))
      addPathChips(sessionId, chips)
      setNotice(failed
        ? `已改以本機路徑附上（ACP 目前不支援內嵌圖片）；${failed} 張失敗`
        : '已改以本機路徑附上（ACP 目前不支援內嵌圖片）')
    })()
  }

  /**
   * P-DRAG: Explorer / OS drop — any local file or folder (no recursive listing).
   * Always insert absolute path lines; image capability may also add image blocks + dedupe on send.
   */
  const ingestDroppedLocalFiles = (files: File[]): void => {
    if (!files.length || !active) return
    const sessionId = active.id
    void (async () => {
      const resolvedPaths: string[] = []
      const chips: PathChip[] = []
      const imageFilesForBlocks: Array<{ file: File; path: string }> = []
      let failed = 0

      for (const file of files) {
        const pathFromOs = typeof window.grokApi.getPathForFile === 'function'
          ? window.grokApi.getPathForFile(file)
          : null
        if (!pathFromOs || !isAbsoluteLocalPath(pathFromOs)) {
          // Fallback: clipboard-like image without OS path
          if (isImageMime(file.type)) {
            try {
              const image = await readFileAsImage(file)
              if (!image) { failed += 1; continue }
              if (caps.promptCapabilities.image === true) {
                setAttachmentsBySession((current) => ({
                  ...current,
                  [sessionId]: [...(current[sessionId] ?? []), { type: 'image', data: image.data, mimeType: image.mimeType, name: file.name || undefined }]
                }))
              } else {
                const saved = await window.grokApi.savePasteImage(image)
                resolvedPaths.push(saved.path)
                let previewUrl: string | undefined
                try { previewUrl = URL.createObjectURL(file) } catch { /* optional */ }
                chips.push({ path: saved.path, ...(previewUrl ? { previewUrl } : {}) })
              }
            } catch {
              failed += 1
            }
          } else {
            failed += 1
          }
          continue
        }

        let kind: 'file' | 'directory' | 'other' | 'missing' = 'file'
        try {
          const statResult = await window.grokApi.statLocalPath(pathFromOs)
          kind = statResult.kind
        } catch {
          kind = 'file'
        }
        if (kind === 'missing') {
          failed += 1
          setNotice(`找不到路徑：${pathFromOs}`)
          continue
        }

        resolvedPaths.push(pathFromOs)
        const isDirectory = kind === 'directory'
        let previewUrl: string | undefined
        if (!isDirectory && (isImageMime(file.type) || isImagePath(pathFromOs))) {
          try { previewUrl = URL.createObjectURL(file) } catch { /* optional */ }
          imageFilesForBlocks.push({ file, path: pathFromOs })
        }
        chips.push({ path: pathFromOs, isDirectory, ...(previewUrl ? { previewUrl } : {}) })
      }

      if (resolvedPaths.length) {
        appendPathsToDraft(sessionId, resolvedPaths)
        addPathChips(sessionId, chips)
      }

      if (caps.promptCapabilities.image === true && imageFilesForBlocks.length) {
        const blocks: PromptBlock[] = []
        const dedupePaths: string[] = []
        for (const entry of imageFilesForBlocks) {
          const image = await readFileAsImage(entry.file)
          if (!image) continue
          blocks.push({ type: 'image', data: image.data, mimeType: image.mimeType, name: entry.path })
          dedupePaths.push(entry.path)
        }
        if (blocks.length) {
          setAttachmentsBySession((current) => ({ ...current, [sessionId]: [...(current[sessionId] ?? []), ...blocks] }))
          setImagePathDedupeBySession((current) => ({
            ...current,
            [sessionId]: [...new Set([...(current[sessionId] ?? []), ...dedupePaths])]
          }))
        }
      }

      if (!resolvedPaths.length && !imageFilesForBlocks.length && failed) {
        setNotice('無法取得拖放項目的本機路徑')
      } else if (failed && resolvedPaths.length) {
        setNotice(`已加入 ${resolvedPaths.length} 個路徑；${failed} 個失敗`)
      }
    })()
  }

  const paste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...event.clipboardData.files]
    if (!files.length || !active) return
    event.preventDefault()
    ingestPastedImages(files)
  }

  const onComposerDragOver = (event: React.DragEvent<HTMLElement>): void => {
    const types = [...event.dataTransfer.types]
    if (!types.includes('Files') && !types.includes('text/plain') && !types.includes('application/x-grok-path')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onComposerDrop = (event: React.DragEvent<HTMLElement>): void => {
    if (!active) return
    event.preventDefault()
    const sessionId = active.id
    const readTransfer = (type: string): string => {
      try {
        return typeof event.dataTransfer.getData === 'function' ? (event.dataTransfer.getData(type) || '') : ''
      } catch {
        return ''
      }
    }
    const grokPath = readTransfer('application/x-grok-path')
    const plain = readTransfer('text/plain')
    const pathFromPreview = [grokPath, plain].find((value) => isAbsoluteLocalPath(value))
    const files = event.dataTransfer.files ? [...event.dataTransfer.files] : []
    if (pathFromPreview && !files.length) {
      appendPathsToDraft(sessionId, [pathFromPreview.trim()])
      return
    }
    if (files.length) {
      ingestDroppedLocalFiles(files)
      return
    }
    if (pathFromPreview) appendPathsToDraft(sessionId, [pathFromPreview.trim()])
  }

  const dismissPathChip = (filePath: string): void => {
    if (!active) return
    const sessionId = active.id
    setPathChipsBySession((current) => {
      const list = current[sessionId] ?? []
      const target = list.find((chip) => chip.path === filePath)
      if (target?.previewUrl?.startsWith('blob:')) {
        try { URL.revokeObjectURL(target.previewUrl) } catch { /* ignore */ }
      }
      return { ...current, [sessionId]: list.filter((chip) => chip.path !== filePath) }
    })
    setDrafts((current) => ({ ...current, [sessionId]: removePathLine(current[sessionId] ?? '', filePath) }))
    setImagePathDedupeBySession((current) => {
      const list = current[sessionId]
      if (!list?.length) return current
      return { ...current, [sessionId]: list.filter((item) => item !== filePath) }
    })
  }

  const closePreviewItem = useCallback((): void => {
    setPreviewActiveId(null)
    setPreviewLoad({ status: 'idle' })
  }, [])

  const focusSessionId = (teamEnabled && team.focusId) || active?.id || null
  const previewSessionId = focusSessionId
  const previewItems = previewSessionId ? (previewItemsBySession[previewSessionId] ?? []) : []

  const ensurePreviewOpen = useCallback((): void => {
    setSettings((current) => current.preview.open ? current : { ...current, preview: { ...current.preview, open: true } })
  }, [])

  const loadPreviewItem = useCallback(async (item: PreviewItem): Promise<void> => {
    setPreviewActiveId(item.id)
    setPreviewLoad({ status: 'loading' })
    try {
      if (item.source.type === 'remote-url') {
        setPreviewLoad({
          status: 'ready',
          kind: 'remote-image',
          mediaSrc: item.source.url,
          mimeType: 'image/*'
        })
        return
      }
      if (item.source.type === 'inline-code') {
        setPreviewLoad({
          status: 'ready',
          kind: 'code',
          text: item.source.content,
          language: item.source.language,
          sizeBytes: item.source.content.length
        })
        return
      }
      const filePath = item.source.path
      if (item.kind === 'html' || item.kind === 'code') {
        const reg = await window.grokApi.previewRegister(filePath)
        if (!reg.ok) {
          setPreviewLoad({ status: 'error', message: reg.reason, revealOnly: reg.revealOnly })
          return
        }
        const textResult = await window.grokApi.previewReadText(filePath)
        if (!textResult.ok) {
          setPreviewLoad({ status: 'error', message: textResult.reason })
          return
        }
        setPreviewLoad({
          status: 'ready',
          kind: textResult.kind,
          path: textResult.path,
          text: textResult.text,
          truncated: textResult.truncated,
          sizeBytes: textResult.sizeBytes,
          language: item.kind === 'code' ? undefined : undefined
        })
        return
      }
      const reg = await window.grokApi.previewRegister(filePath)
      if (!reg.ok) {
        setPreviewLoad({ status: 'error', message: reg.reason, revealOnly: reg.revealOnly })
        return
      }
      const mediaSrc = reg.base64DataUrl ?? reg.protocolUrl
      if (!mediaSrc && reg.kind !== 'code' && reg.kind !== 'html') {
        setPreviewLoad({ status: 'error', message: '無法建立預覽載入路徑' })
        return
      }
      setPreviewLoad({
        status: 'ready',
        kind: reg.kind,
        path: reg.path,
        mediaSrc,
        sizeBytes: reg.sizeBytes,
        mimeType: reg.mimeType
      })
    } catch (error) {
      setPreviewLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  const upsertPreviewItems = useCallback((sessionId: string, discovered: PreviewItem[], autoSelectMedia: boolean): void => {
    setPreviewItemsBySession((current) => {
      const existing = current[sessionId] ?? []
      const merged = discoverPreviewCandidates('', {
        sessionId,
        existing: [...discovered, ...existing],
        nowMs: Date.now()
      })
      // discover with empty text just re-merges existing+discovered via existing option
      const map = new Map<string, PreviewItem>()
      for (const item of existing) map.set(item.id, item)
      for (const item of discovered) map.set(item.id, item)
      const next = [...map.values()].sort((a, b) => b.discoveredAt - a.discoveredAt).slice(0, 50)
      return { ...current, [sessionId]: next.length ? next : merged }
    })
    if (autoSelectMedia) {
      const media = discovered.find(isMediaPreviewItem) ?? discovered[0]
      if (media) {
        ensurePreviewOpen()
        void loadPreviewItem(media)
      }
    }
  }, [ensurePreviewOpen, loadPreviewItem])

  const scanPreviewForSession = useCallback((sessionId: string): void => {
    const session = sessions.find((item) => item.id === sessionId) ?? (active?.id === sessionId ? active : null)
    const list = events[sessionId] ?? []
    // Prefer completed message/tool text (skip pure running markers)
    const chunks = list.flatMap((event) => {
      if (event.kind === 'message') return [event.text]
      if (event.kind === 'tool' && event.status !== 'pending' && event.status !== 'in_progress') {
        return [`${event.title}\n${event.output ?? ''}`]
      }
      if (event.kind === 'recap') return [event.summary]
      return []
    })
    const text = chunks.join('\n')
    if (!text.trim()) return
    const discovered = discoverPreviewCandidates(text, {
      sessionId,
      cwd: session?.cwd,
      nowMs: Date.now(),
      existing: previewItemsBySession[sessionId] ?? []
    })
    const auto = settings.preview.autoPreviewLatestMedia
    upsertPreviewItems(sessionId, discovered, auto)
  }, [sessions, active, events, previewItemsBySession, settings.preview.autoPreviewLatestMedia, upsertPreviewItems])

  scanPreviewForSessionRef.current = scanPreviewForSession

  const openPreviewPath = useCallback((rawPath: string): void => {
    if (!previewSessionId) {
      setNotice('請先開啟一個對話再預覽')
      return
    }
    const session = sessions.find((item) => item.id === previewSessionId) ?? active
    const cwd = session?.cwd
    let path = rawPath.trim()
    if (cwd && !/^[a-zA-Z]:[\\/]/.test(path) && !path.startsWith('/')) {
      path = `${cwd.replace(/[\\/]+$/, '')}\\${path.replace(/^[\\/]+/, '').replace(/\//g, '\\')}`
    }
    const item: PreviewItem = {
      id: `file:${path.toLowerCase()}`,
      kind: path.match(/\.(mp4|webm)$/i) ? 'video' : path.match(/\.(html?)$/i) ? 'html' : path.match(/\.(png|jpe?g|webp|gif|svg)$/i) ? 'image' : 'code',
      source: { type: 'file', path },
      label: path.split(/[\\/]/).pop() || path,
      discoveredAt: Date.now(),
      sessionId: previewSessionId
    }
    upsertPreviewItems(previewSessionId, [item], false)
    ensurePreviewOpen()
    void loadPreviewItem(item)
  }, [previewSessionId, sessions, active, upsertPreviewItems, ensurePreviewOpen, loadPreviewItem])
  openPreviewPathRef.current = openPreviewPath

  const openPreviewRemote = useCallback((url: string): void => {
    if (!previewSessionId) {
      setNotice('請先開啟一個對話再預覽')
      return
    }
    const item: PreviewItem = {
      id: `remote:${url}`,
      kind: 'remote-image',
      source: { type: 'remote-url', url },
      label: url.split('/').pop()?.split('?')[0] || '遠端圖片',
      discoveredAt: Date.now(),
      sessionId: previewSessionId
    }
    upsertPreviewItems(previewSessionId, [item], false)
    ensurePreviewOpen()
    void loadPreviewItem(item)
  }, [previewSessionId, upsertPreviewItems, ensurePreviewOpen, loadPreviewItem])

  const openPreviewCode = useCallback((code: string, language?: string): void => {
    if (!previewSessionId) {
      setNotice('請先開啟一個對話再預覽')
      return
    }
    const hash = `${code.length}:${code.slice(0, 32)}`
    const item: PreviewItem = {
      id: `code:${hash}:${language ?? ''}`,
      kind: 'code',
      source: { type: 'inline-code', language, content: code, hash },
      label: language ? `${language} 程式碼` : '程式碼區塊',
      discoveredAt: Date.now(),
      sessionId: previewSessionId,
      sizeBytes: code.length
    }
    upsertPreviewItems(previewSessionId, [item], false)
    ensurePreviewOpen()
    void loadPreviewItem(item)
  }, [previewSessionId, upsertPreviewItems, ensurePreviewOpen, loadPreviewItem])

  const previewHandlers: PreviewHandlers = useMemo(() => ({
    onPreviewPath: openPreviewPath,
    onPreviewRemote: openPreviewRemote,
    onPreviewCode: openPreviewCode
  }), [openPreviewPath, openPreviewRemote, openPreviewCode])

  const activeModel = models?.availableModels.find((model) => model.modelId === models.currentModelId)
  const usageTotal = usage?.contextWindowTokens ?? activeModel?.totalContextTokens
  const usagePercent = usage?.contextWindowUsage ?? (usage?.contextTokensUsed !== undefined && usageTotal ? Math.round((usage.contextTokensUsed / usageTotal) * 100) : undefined)
  const usageLevel = usagePercent === undefined ? '' : usagePercent >= 85 ? 'danger' : usagePercent >= 60 ? 'warn' : ''

  const effectiveImmersion = settings.theme === 'light' ? 'focus' : settings.immersion
  const localizedModes = useMemo(() => localizeSessionModes(caps.modes), [caps.modes])
  // F-RT-5: full availableCommands (name/description/inputHint) + native GUI actions.
  const slashPalette = buildSlashPaletteEntries(caps.commands)
  const paletteCommands: PaletteCommand[] = [
    { id: 'new-session', label: '建立新對話', description: '選擇專案資料夾並啟動 Grok', keywords: 'new session 專案 資料夾', shortcut: shortcutFor('newSession').replaceAll('+', ' '), onRun: () => { createSessionRef.current() } },
    { id: 'search-transcript', label: '搜尋目前對話', description: '在已載入的訊息中找文字', keywords: 'find search transcript 尋找', shortcut: shortcutFor('searchTranscript').replaceAll('+', ' '), onRun: () => { setSearchOpen(true); window.setTimeout(() => transcriptSearchRef.current?.focus(), 0) } },
    ...slashPalette.map((entry): PaletteCommand => ({
      id: entry.id,
      label: entry.label,
      description: entry.description,
      keywords: entry.keywords,
      onRun: () => {
        if (!active) return
        setDrafts((current) => ({ ...current, [active.id]: entry.insertText }))
      }
    }))
  ]

  const previewOpen = settings.preview.open
  const previewWidth = Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, settings.preview.width || PREVIEW_DEFAULT_WIDTH))

  return <div className="app" data-theme={settings.theme} data-immersion={effectiveImmersion} data-cursor={settings.effects.cursor && !settings.effects.reducedMotion ? 'true' : undefined} data-fx-off={settings.effects.reducedMotion ? 'true' : undefined} style={{ '--font-size': `${settings.fontSize}px`, '--line-height': settings.lineHeight, '--content-width': `${settings.contentWidth}px`, '--preview-width': `${previewWidth}px` } as React.CSSProperties}>
    <StarfieldCanvas enabled={settings.effects.galaxy} theme={settings.theme} density={settings.effects.density} reducedMotion={settings.effects.reducedMotion} running={running} connected={status.connected} errorPulse={errorPulse} />
    <CursorFX enabled={settings.effects.cursor} reducedMotion={settings.effects.reducedMotion} />
    <header className="titlebar"><div className="brand-mark brand-prow" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><polygon points="18.5,3.5 10.5,7.5 6.5,19 12.5,15.2 16,19.5 19.5,10" fill="#0d1320" stroke="#e9ad47" strokeWidth="1.4" strokeLinejoin="round" /><line x1="18.5" y1="3.5" x2="12.5" y2="15.2" stroke="#f5d9a0" strokeWidth="1" /></svg></div><strong>GROK BUILD</strong><i>GALAXY COCKPIT</i><div className="drag-region" />
      <StatusOrb mode={orbMode} reducedMotion={settings.effects.reducedMotion || !settings.effects.galaxy} />
      <QuotaRings billing={billing} unavailable={billingUnavailable} />
      {active && <div className="usage-pill" data-context-zone="session" aria-label="Context 視窗用量" title={`Context 視窗（本 session，非訂閱週額度）${usage?.turnCount !== undefined ? ` · ${usage.turnCount} 回合` : ''}${usage?.toolCallCount !== undefined ? ` · ${usage.toolCallCount} 次工具` : ''}`}><Gauge /><b className="usage-pill-label">Context</b><span>{usagePercent !== undefined ? `${usagePercent}%` : '—'}</span><div className="usage-bar"><i className={usageLevel} style={{ width: `${Math.min(100, usagePercent ?? 0)}%` }} /></div><em>{formatTokens(usage?.contextTokensUsed)} / {formatTokens(usageTotal)}</em></div>}
      <label className="permission-mode-label" title={permissionModeTitle}><span className="session-mode-caption">工具權限</span><select aria-label="權限模式" data-locked={permissionControlsLocked ? 'true' : undefined} value={permissionMode} onChange={(event) => requestPermissionMode(event.target.value as AgentPermissionMode)}><option value="ask">每次詢問</option><option value="always-approve">一律核准（YOLO）</option></select></label>
      {status.found && <button className="account-pill" aria-label="切換 Grok 帳號" title={running || anyRunning ? '請先停止所有執行中的回合' : '切換 Grok 帳號'} disabled={lifecycleBusy || running || anyRunning} onClick={() => openSetupDialog('account')}><UserRound />切換帳號</button>}
      <button className={`status-pill ${status.connected ? 'online' : ''}`} disabled={lifecycleBusy || anyRunning} onClick={() => { if (status.found) void connect(); else openSetupDialog('install') }}><span />{status.found ? `Grok ${status.version ?? ''}` : 'CLI not found'} · {status.connected ? 'Connected' : status.found ? 'Connect' : 'Setup'}</button></header>
    <div className={`workspace ${sidebarOpen ? '' : 'sidebar-collapsed'} ${previewOpen ? 'preview-open' : 'preview-rail'}`}>
      <aside className="sidebar">
        <div className="sidebar-actions"><button className="primary" data-magnetic data-nova-tone="primary" disabled={lifecycleBusy} onClick={() => void createSession()}><FilePlus2 />新 Session</button><button className="icon-button sidebar-rail-expand" aria-label="展開側欄" onClick={() => setSidebarOpen(true)}><PanelLeft /></button><button className="icon-button" aria-label="收合側欄" onClick={() => setSidebarOpen(false)}><PanelLeftClose /></button></div>
        <div className="sidebar-team-bar">
          <AgentsTeamToolbar
            enabled={teamEnabled}
            count={team.slots.length}
            max={AGENTS_TEAM_MAX}
            onToggle={() => {
              setTeamEnabled((value) => {
                const next = !value
                if (next && active) setTeam((current) => (isInTeam(current, active.id) ? setTeamFocus(current, active.id) : toggleTeamSlot(current, active.id)))
                return next
              })
            }}
          />
        </div>
        <label className="searchbox"><Search /><input ref={sessionSearchRef} placeholder={`搜尋 sessions  ${shortcutFor('searchSessions').replaceAll('+', ' ')}`} value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} /></label>
        <label className="folder-filter" data-testid="folder-filter">
          <span>資料夾</span>
          <select
            aria-label="依完整專案路徑篩選"
            value={folderFilter}
            onChange={(event) => setFolderFilter(event.target.value as string | 'all')}
          >
            <option value="all">全部資料夾（{sessions.length}）</option>
            {folderOptions.map((cwd) => (
              <option key={cwd} value={cwd} title={cwd}>
                {cwdDisplayName(cwd)} — {cwd}
              </option>
            ))}
          </select>
        </label>
        <div className="session-caption">
          <span>{teamEnabled ? 'AGENTS · SESSIONS' : 'RECENT SESSIONS'}</span>
          <em>{filteredSessions.length}{folderFilter !== 'all' ? ' · 已篩選' : ''}</em>
        </div>
        <div className="sidebar-select-bar">
          {!selectMode && <button type="button" className="multi-select-entry" data-testid="multi-select-entry" onClick={() => setSelectMode(true)} title="可跨資料夾勾選後批次刪除">多選</button>}
          {selectMode && <>
            <button type="button" onClick={() => { setSelectMode(false); clearSelection() }}>取消</button>
            <button type="button" onClick={() => selectAllVisibleSessions()}>全選可見</button>
            <button type="button" className={selectedCount > 0 ? '' : undefined} onClick={beginBatchDelete} disabled={selectedCount === 0}><span className="danger-text">刪除所選({selectedCount})</span></button>
          </>}
        </div>
        {cleanupCandidates.length > 0 && (
          <div className="cleanup-suggest-bar" data-testid="cleanup-suggest-bar">
            <button
              type="button"
              className="cleanup-suggest-button"
              data-testid="cleanup-suggest-button"
              aria-expanded={showCleanupSuggestions}
              onClick={() => setShowCleanupSuggestions((value) => !value)}
            >
              建議清理（{cleanupCandidates.length}）
            </button>
            {showCleanupSuggestions && (
              <div className="cleanup-suggest-panel" data-testid="cleanup-suggest-panel">
                <p>空對話、超過 10 天未活動，或同資料夾過多的較舊項。僅建議、不會自動刪除。可多選後批次刪。</p>
                <button
                  type="button"
                  className="cleanup-select-all"
                  onClick={() => {
                    setSelectMode(true)
                    setSelectedIds(new Set(cleanupCandidates.map((item) => item.id)))
                  }}
                >全選建議項</button>
                <ul>
                  {cleanupCandidates.slice(0, 40).map((session) => {
                    const title = sessionDisplayTitle(session, settings.sessionTitles)
                    const checked = selectedIds.has(session.id)
                    return (
                      <li key={session.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setSelectMode(true)
                              toggleSessionSelection(session.id, event.currentTarget.checked)
                            }}
                          />
                          <span title={`${title}\n${session.cwd}`}>{title}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                {selectedCount > 0 && (
                  <button type="button" className="cleanup-batch-delete" onClick={beginBatchDelete}>
                    刪除所選（{selectedCount}）
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <nav className="session-list">
          {pinned.length > 0 && <section className="session-group pinned" key="pinned-group">
            <header><span>已釘選</span><em>{pinned.length}</em></header>
            {pinned.map(renderSessionRow)}
          </section>}
          {sessionGroups.map((group) => <section className="session-group" key={group.cwd}><header><span title={group.cwd}>{group.name}</span><em>{group.sessions.length}</em></header>{group.sessions.map(renderSessionRow)}</section>)}
        </nav>
        <div className="sidebar-footer"><button onClick={() => setPanel('features')}><Gauge />功能矩陣</button><button onClick={() => setPanel('settings')}><Settings />設定</button></div>
      </aside>
      <main className="main">
        {!sidebarOpen && <button className="icon-button sidebar-expand-float" aria-label="展開側欄" onClick={() => setSidebarOpen(true)}><PanelLeft /></button>}
        {permissionMode === 'always-approve' && <div className="yolo-banner">⚠️ <strong>YOLO</strong> 模式：已啟用一律核准，可能會自動通過風險操作。</div>}
        {!active && !showTeamBoard ? <section className="empty-state"><WelcomeHeroOrnament reducedMotion={settings.effects.reducedMotion} theme={settings.theme} /><span className="eyebrow">GALAXY COCKPIT · WINDOWS</span><h1>{status.found ? <>選一個專案資料夾，<br/><em>就可以開始。</em></> : <>第一次使用？<br/><em>一鍵準備 Grok。</em></>}</h1><p>{status.found ? '不用輸入終端指令。這裡會替你連接本機 Grok、保留未送出的文字，並在執行前顯示權限確認。可開啟 Agents Team 並排多個 session。' : '不用先學終端，也不用安裝 Node.js。程式會在你確認後，從 x.ai 官方來源安裝 Grok CLI。'}</p><div className="onboarding-steps">{status.found ? <><span><b>1</b>按「選擇專案開始」</span><span><b>2</b>選擇你的工作資料夾</span><span><b>3</b>用白話交代任務</span></> : <><span><b>1</b>確認安裝 Grok CLI</span><span><b>2</b>在瀏覽器登入 Grok</span><span><b>3</b>選資料夾開始</span></>}</div><div className="empty-actions">{status.found ? <><button className="primary large" data-magnetic data-nova-tone="primary" disabled={lifecycleBusy} onClick={() => void createSession()}><FolderOpen />選擇專案開始</button><button className="secondary large" disabled={lifecycleBusy} onClick={() => void connect()}><Play />連接本機 Grok</button></> : <button className="primary large" data-magnetic data-nova-tone="primary" disabled={lifecycleBusy} onClick={() => openSetupDialog('install')}><TerminalSquare />安裝 Grok CLI</button>}</div><div className="empty-stats"><span><b>{sessions.length}</b>個本機對話</span><span><b>{status.version ?? '—'}</b>Grok CLI 版本</span><span><b>L1+L2</b>銀河座艙</span></div></section> : showTeamBoard ? <section className="agents-team-board" data-testid="agents-team-board" data-count={team.slots.length}>
          {team.slots.map((sessionId) => {
            const session = sessions.find((item) => item.id === sessionId) ?? (active?.id === sessionId ? active : null)
            if (!session) return null
            const focused = (team.focusId ?? active?.id) === sessionId
            return <SessionTeamPane
              key={sessionId}
              session={session}
              titleOverride={settings.sessionTitles[sessionId]}
              events={events[sessionId] ?? []}
              draft={drafts[sessionId] ?? ''}
              running={runningMap[sessionId] === true}
              focused={focused}
              EventCard={(props) => <MemoEventCard {...props} preview={previewHandlers} />}
              ready={isSessionReady(sessionReady, sessionId, connectionGeneration)}
              onFocus={() => {
                setTeam((current) => setTeamFocus(current, sessionId))
                setActive(session)
                activeIdRef.current = sessionId
              }}
              onRemoveFromTeam={() => setTeam((current) => toggleTeamSlot(current, sessionId))}
              onDraftChange={(value) => setDrafts((current) => ({ ...current, [sessionId]: value }))}
              onSend={() => void sendPromptFor(sessionId)}
              onInterject={() => void sendInterjectFor(sessionId)}
              onDoNow={() => void doThisNowFor(sessionId)}
              onStop={() => void cancelActiveTurn(sessionId).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))}
            />
          })}
        </section> : active ? <>
          <header className="session-header"><div><span className="eyebrow">ACTIVE SESSION · PROJECT</span><h1>{sessionDisplayTitle(active, settings.sessionTitles)}</h1><p>{active.cwd}</p></div><div className="session-tools">{models && <ModelPicker models={models} onModelChange={(modelId) => void changeModel(modelId)} onEffortChange={(effort) => void changeEffort(effort)} />}{localizedModes.length > 0 && <label className="session-mode-label" title={sessionModeControlTitle(caps.currentModeId, caps.modes)}><span className="session-mode-caption">工作模式</span><select data-testid="session-mode-select" aria-label="工作模式" value={caps.currentModeId ?? ''} onChange={(event) => { if (event.target.value) void window.grokApi.setMode(active.id, event.target.value).then(() => setCaps((current) => ({ ...current, currentModeId: event.target.value }))).catch((error) => setNotice(error instanceof Error ? error.message : String(error))) }}><option value="" disabled>選擇模式</option>{localizedModes.map((mode) => <option key={mode.id} value={mode.id} title={mode.description}>{mode.name}</option>)}</select></label>}<button className="icon-button" title="搜尋" onClick={() => setSearchOpen(!searchOpen)}><Search /></button><button className="icon-button" title="匯出" onClick={() => void window.grokApi.exportSession(active.id).then((path) => { if (path) { setNotice(`已匯出：${path}（可在檔案總管開啟該路徑）`); setExportedPaths((current) => ({ ...current, [active.id]: path })); setLastExportedPath(path); } }).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))}><Archive /></button>{exportedPaths[active.id] && <button className="icon-button" title="在檔案總管開啟匯出檔案" onClick={() => void window.grokApi.revealExport(exportedPaths[active.id]).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))}><FolderOpen /></button>}<button className="icon-button" title="在 TUI 開啟" onClick={() => openTui(active.cwd)}><TerminalSquare /></button><button className="icon-button" title="命令" onClick={() => setPanel('commands')}><Command /></button></div></header>
          {searchOpen && <div className="transcript-search"><Search /><input ref={transcriptSearchRef} value={transcriptQuery} onChange={(event) => setTranscriptQuery(event.target.value)} placeholder="搜尋目前對話…" /><span>{searchHits} 筆</span><button onClick={() => { setSearchOpen(false); setTranscriptQuery('') }}><X /></button></div>}
          <section className="transcript"><Virtuoso ref={virtuoso} data={activeEvents} computeItemKey={(_index, event) => event.id} followOutput={followTail ? 'auto' : false} atBottomStateChange={(bottom) => { setFollowTail(bottom); if (bottom) setUnread(0) }} itemContent={(_index, event) => <div className="event-wrap"><MemoEventCard event={event} query={transcriptQuery} preview={previewHandlers} /></div>} components={{ Footer: TranscriptFooter }} />{!followTail && <button className="jump-latest" onClick={jumpToLatest}>跳到最新 {unread > 0 && <b>{unread}</b>}</button>}</section>
          <footer className="composer-wrap" onDragOver={onComposerDragOver} onDrop={onComposerDrop}>
            <div className="composer-status" data-testid="composer-status">
              <span className={`composer-status-pill ${running ? 'is-running' : lifecycleBusy || sessionLoading ? 'is-busy' : 'is-ready'}`}>
                {running
                  ? <><LoaderCircle className="spin" /><strong>執行中</strong><em>Grok 工作中</em></>
                  : lifecycleBusy || sessionLoading
                    ? <><LoaderCircle className="spin" /><strong>忙碌</strong><em>連線或載入</em></>
                    : <><span className="ready-dot" /><strong>就緒</strong><em>可送出任務</em></>}
              </span>
              {interjectState?.status === 'queued' && interjectState.sessionId === active.id
                ? <em className="interject-queued" data-testid="interject-status">{INTERJECT_QUEUED_NOTICE}</em>
                : null}
              {displayQueue && displayQueue.sessionId === active.id && hasQueuedPayload(displayQueue)
                ? <em className="local-queue-status" data-testid="local-queue-status">{displayQueueStatus}</em>
                : null}
              <span className="composer-status-keys">{running ? `${shortcutLabel('sendPrompt')} 插話 · ${shortcutLabel('cancelTurn')} 停止` : `${shortcutLabel('sendPrompt')} 傳送 · ${shortcutLabel('newline')} 換行`}</span>
            </div>
            {attachments.length > 0 && <div className="attachment-row">{attachments.map((item, index) => <span key={index}><Paperclip />{'name' in item ? item.name : 'Attachment'}<button aria-label={`移除附件 ${'name' in item ? item.name : index + 1}`} onClick={() => setAttachmentsBySession((current) => ({ ...current, [active.id]: (current[active.id] ?? []).filter((_item, i) => i !== index) }))}><X /></button></span>)}</div>}
            {pathChips.length > 0 && <div className="path-chip-row" data-testid="path-chip-row">{pathChips.map((chip) => (
              <span key={chip.path} className="path-chip" title={chip.path} data-testid="path-chip">
                {chip.previewUrl
                  ? <img className="path-chip-thumb" data-testid="path-chip-thumb" src={chip.previewUrl} alt="" width={28} height={28} />
                  : chip.isDirectory ? <FolderOpen /> : <Paperclip />}
                <em>{chip.path}</em>
                <button type="button" className="path-preview-btn" data-testid="path-chip-preview" aria-label={`預覽 ${chip.path}`} onClick={() => openPreviewPath(chip.path)}>預覽</button>
                <button type="button" aria-label={`移除路徑 ${chip.path}`} onClick={() => dismissPathChip(chip.path)}><X /></button>
              </span>
            ))}</div>}
            {!running && <div className="template-row" data-testid="prompt-templates">
              {PROMPT_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="template-chip"
                  title={item.description}
                  disabled={!activeReady}
                  onClick={() => setDrafts((current) => ({ ...current, [active.id]: `${current[active.id] ?? ''}${current[active.id] ? '\n' : ''}${item.body}` }))}
                >{item.label}</button>
              ))}
            </div>}
            <div className="composer" ref={mainComposerRef} data-testid="main-composer">
              <button className="attach-button" aria-label="加入檔案" disabled={!activeReady} onClick={() => void chooseFiles()}><Paperclip /></button>
              <textarea
                ref={mainComposerTextareaRef}
                value={drafts[active.id] ?? ''}
                disabled={!activeReady}
                onChange={(event) => {
                  setDrafts((current) => ({ ...current, [active.id]: event.target.value }))
                  // Grow immediately on keystroke (effect also syncs)
                  requestAnimationFrame(() => syncMainComposerHeight())
                }}
                onKeyDown={composerKey}
                onPaste={paste}
                placeholder={!activeReady ? '此對話尚未在目前連線就緒（載入中、失敗或已斷線）' : running ? '回合進行中可插話、排隊下一輪，或立刻改做…' : '交給 Grok 一個任務，或拖放本機檔案／資料夾（絕對路徑）…'}
                rows={3}
              />
              {running ? <div className="composer-actions running command-rail" data-testid="command-rail">
                <button type="button" className="interject-button" data-testid="interject-button" title="在下一個安全點插入指示（不取消目前回合）" disabled={!activeReady || interjectBusy || !(drafts[active.id] ?? '').trim()} onClick={() => void sendInterject()}><MessageSquare />插話</button>
                <button type="button" className="queue-next-button" data-testid="queue-next-button" title="目前回合結束後自動送出（本機排隊，非官方 queue API）" disabled={!activeReady || interjectBusy || (!(drafts[active.id] ?? '').trim() && attachments.length === 0)} onClick={() => queueNextTurn()}><ListTodo />排隊下一輪</button>
                {displayQueue && displayQueue.sessionId === active.id && hasQueuedPayload(displayQueue) ? <button type="button" className="queue-clear-button" data-testid="queue-clear-button" title="取消已排隊的下一輪" onClick={() => clearLocalQueue()}><X />取消排隊</button> : null}
                <button type="button" className="do-now-button" data-testid="do-this-now-button" title="取消目前回合並立刻送出新指示" disabled={!activeReady || interjectBusy || (!(drafts[active.id] ?? '').trim() && attachments.length === 0)} onClick={() => void doThisNow()}><Zap />立刻改做</button>
                <button type="button" className="stop-button" data-nova-tone="danger" data-testid="stop-button" disabled={!activeReady} onClick={() => void cancelActiveTurn(active.id).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))}><Square />停止</button>
              </div> : <button className="send-button" data-magnetic data-nova-tone="primary" disabled={!activeReady || (!(drafts[active.id] ?? '').trim() && !attachments.length)} onClick={() => void sendPrompt()}><Send />送出</button>}
            </div>
          </footer>
        </> : null}
      </main>
      <PreviewDock
        open={previewOpen}
        width={previewWidth}
        items={previewItems}
        activeId={previewActiveId}
        load={previewLoad}
        showHtmlScriptAdvanced={settings.preview.showHtmlScriptAdvanced}
        htmlScriptsAllowed={previewActiveId ? htmlScriptConsent[previewActiveId] === true : false}
        onToggleOpen={() => setSettings((current) => ({ ...current, preview: { ...current.preview, open: !current.preview.open } }))}
        onWidthChange={(width) => setSettings((current) => ({ ...current, preview: { ...current.preview, width } }))}
        onSelectItem={(id) => {
          const item = previewItems.find((entry) => entry.id === id)
          if (item) void loadPreviewItem(item)
        }}
        onCloseItem={closePreviewItem}
        onRefresh={() => {
          const item = previewItems.find((entry) => entry.id === previewActiveId)
          if (item) {
            setHtmlScriptConsent((current) => {
              if (!previewActiveId || !current[previewActiveId]) return current
              const next = { ...current }
              delete next[previewActiveId]
              return next
            })
            void loadPreviewItem(item)
          }
        }}
        onRescan={() => {
          if (previewSessionId) scanPreviewForSession(previewSessionId)
        }}
        onOpenFile={() => {
          void window.grokApi.previewChooseFile().then((file) => {
            if (file) openPreviewPath(file)
          }).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))
        }}
        onToggleHtmlScripts={(allowed) => {
          if (!previewActiveId) return
          setHtmlScriptConsent((current) => ({ ...current, [previewActiveId]: allowed }))
        }}
        onCopyPath={(path) => { void navigator.clipboard.writeText(path).then(() => setNotice('已複製路徑')).catch(() => setNotice('複製失敗')) }}
        onRevealPath={(path) => { void window.grokApi.revealPath(path).catch((error) => setNotice(error instanceof Error ? error.message : String(error))) }}
        onOpenExternalPath={(path) => { void window.grokApi.openPath(path).catch((error) => setNotice(error instanceof Error ? error.message : String(error))) }}
        reducedMotion={settings.effects.reducedMotion}
      />
      {panel === 'settings' && <SettingsPanel
        settings={settings}
        cliVersion={status.version}
        onClose={() => setPanel('none')}
        onOpenRemote={() => setPanel('features')}
        onLiveChange={(next) => setSettings((current) => ({
          ...current,
          theme: next.theme,
          immersion: next.immersion,
          effects: next.effects,
          fontSize: next.fontSize,
          lineHeight: next.lineHeight,
          contentWidth: next.contentWidth,
          grokExecutable: next.grokExecutable,
          shortcuts: next.shortcuts,
          preview: next.preview
        }))}
        onSave={(next) => void window.grokApi.saveSettings({ ...next, drafts, sessionTitles: settings.sessionTitles }).then((saved) => { setSettings(saved); setPanel('none'); setNotice('設定已儲存') })}
      />}
      {panel === 'features' && (
        <aside className="drawer">
          <div className="drawer-head">
            <div>
              <span className="eyebrow">CAPABILITY ROUTER</span>
              <h2>功能矩陣</h2>
            </div>
            <button className="icon-button" onClick={() => setPanel('none')}><X /></button>
          </div>
          <p className="drawer-intro">有結構化 ACP 介面才在 GUI 原生操作；其餘明確回到 TUI，不模擬終端按鍵。</p>
          <div className="feature-list">
            {FEATURES.map(([name, route, state]) => (
              <div key={name}>
                <span className={state}>{state === 'native' ? <Check /> : state === 'conditional' ? <Cpu /> : <TerminalSquare />}</span>
                <strong>{name}</strong>
                <small>{route}</small>
              </div>
            ))}
          </div>
          <div className="settings-section" style={{ borderTop: '1px dashed var(--line)', paddingTop: '15px' }}>
            <div className="section-title">
              <h3>對話能力矩陣 (Session Capabilities)</h3>
            </div>
            <div className="feature-list" style={{ margin: '10px 0 20px' }}>
              {probeSessionCapabilities(caps).matrix.map((row) => {
                const stateClass = row.available ? 'native' : 'fallback'
                return (
                  <div key={row.id} data-testid={`capability-row-${row.id}`}>
                    <span className={stateClass}>
                      {row.available ? <Check /> : <TerminalSquare />}
                    </span>
                    <strong>{row.id}</strong>
                    <small>{row.route === 'native' ? 'ACP 原生 (native)' : row.route === 'tui' ? '降級 TUI (tui)' : '不可用 (unavailable)'}</small>
                  </div>
                )
              })}
            </div>
          </div>
          {active && <button className="secondary wide" onClick={() => openTui(active.cwd)}><TerminalSquare />在 GROK TUI 開啟</button>}
          <RemoteControlPanel
            active={remoteControlActive}
            state={remoteState}
            busy={remoteBusy}
            permissionMode={permissionMode}
            allowPhonePerms={remoteAllowPhonePerms}
            useQuickTunnel={remoteUseQuickTunnel}
            onAllowPhonePerms={setRemoteAllowPhonePerms}
            onUseQuickTunnel={setRemoteUseQuickTunnel}
            onNotice={setNotice}
            onEnable={(opts) => window.grokApi.remoteEnable(opts)}
            onDisable={() => window.grokApi.remoteDisable()}
            onRegenerate={() => window.grokApi.remoteRegeneratePairing()}
            onState={setRemoteState}
            onActiveChange={setRemoteControlActive}
            onBusy={setRemoteBusy}
          />
        </aside>
      )}
    </div>
    {panel === 'commands' && <CommandPalette commands={paletteCommands} recentIds={settings.recentCommands} onUse={rememberCommand} onClose={() => setPanel('none')} />}
    {panel === 'shortcuts' && <div className="modal-backdrop"><section className="shortcut-overlay" role="dialog" aria-modal="true" aria-label="快捷鍵一覽"><header><div><span className="eyebrow">KEYBOARD HELP</span><h2>快捷鍵一覽</h2></div><button className="icon-button" aria-label="關閉快捷鍵" onClick={() => setPanel('none')}><X /></button></header><div>{[
      [shortcutLabel('newSession'), '建立新對話'], [shortcutLabel('searchSessions'), '搜尋本機對話'], [shortcutLabel('searchTranscript'), '搜尋目前內容'], [shortcutLabel('toggleSidebar'), '切換側欄'], [shortcutLabel('togglePreview'), '開關預覽台'], [shortcutLabel('commandPalette'), '開啟命令面板'], [shortcutLabel('jumpToLatest'), '跳到最新訊息'], [shortcutLabel('cancelTurn'), '取消執行（Esc 永遠先關閉視窗）'], ['?', '顯示這張說明']
    ].map(([keys, action]) => <p key={keys}><kbd>{keys}</kbd><span>{action}</span></p>)}</div><footer><Keyboard />在輸入框內按「?」會正常輸入文字，不會打開這張卡片。</footer></section></div>}
    {setupDialog === 'install' && <div className="modal-backdrop"><section className="permission-modal setup-modal" role="dialog" aria-modal="true" aria-label="安裝 Grok CLI" onKeyDown={containDialogFocus}><div className="permission-icon"><TerminalSquare /></div><span className="eyebrow">FIRST-TIME SETUP</span><h2>安裝 Grok CLI</h2><p>這是程式真正需要的工具，不是 Windows Terminal，也不是 Node.js。按下確認後才會從 x.ai 官方網址下載，安裝在你的 Windows 帳號內，不要求系統管理員權限。</p><code>https://x.ai/cli/install.ps1</code><div><button className="primary" aria-label="確認安裝 Grok CLI" disabled={lifecycleBusy} onClick={() => void installCli()}><TerminalSquare /><span><strong>{lifecycleBusy ? '正在安裝…' : '確認安裝 Grok CLI'}</strong><small>下載後會驗證 grok --version</small></span></button><button autoFocus disabled={lifecycleBusy} onClick={() => setSetupDialog(null)}><X /><span><strong>先不要</strong><small>不會下載或執行任何東西</small></span></button></div></section></div>}
    {setupDialog === 'account' && <div className="modal-backdrop"><section className="permission-modal setup-modal" role="dialog" aria-modal="true" aria-label="登入 Grok 帳號" onKeyDown={containDialogFocus}><div className="permission-icon"><UserRound /></div><span className="eyebrow">OFFICIAL GROK OAUTH</span><h2>{status.connected ? '切換 Grok 帳號' : '登入 Grok 帳號'}</h2><p>接下來會由 Grok CLI 開啟 x.ai 的瀏覽器登入頁。程式不會看見、保存或複製你的密碼與 token；CLI 目前也不提供帳號 email 或多帳號清單。</p><div><button className="primary" aria-label="開啟瀏覽器並重新登入" disabled={lifecycleBusy || running || anyRunning} onClick={() => void reauthenticateAccount()}><UserRound /><span><strong>{lifecycleBusy ? '等待瀏覽器登入…' : running || anyRunning ? '請先停止所有執行中的回合' : '開啟瀏覽器並重新登入'}</strong><small>完成後會重建連線與額度資料</small></span></button><button autoFocus disabled={lifecycleBusy} onClick={() => setSetupDialog(null)}><X /><span><strong>取消</strong><small>維持目前狀態</small></span></button></div></section></div>}
    {permission && <div className="modal-backdrop"><section key={permission.requestId} className="permission-modal" role="dialog" aria-modal="true" aria-label={permission.title} tabIndex={-1} autoFocus={!safePermissionOptionId} onKeyDown={containDialogFocus}><div className="permission-icon"><Wrench /></div><span className="eyebrow">ACTION REQUIRES APPROVAL{permissions.length > 1 ? ` · 還有 ${permissions.length - 1} 項待決` : ''}</span><h2>{permission.title}</h2><p>Grok 要求執行一項可能修改檔案或呼叫外部工具的操作。只可選擇代理提供的合法選項。</p><div>{permission.options.map((option) => <button key={option.optionId} autoFocus={option.optionId === safePermissionOptionId} className={option.kind.includes('reject') ? 'danger-option' : ''} onClick={() => void window.grokApi.respondPermission(permission.requestId, option.optionId).catch((error) => setNotice(error instanceof Error ? error.message : String(error))).then(() => setPermissions((current) => current.filter((item) => item.requestId !== permission.requestId)))}>{option.kind.includes('reject') ? <X /> : <Check />}<span><strong>{option.name}</strong><small>{option.kind}</small></span></button>)}</div></section></div>}
    {yoloConfirm && <div className="modal-backdrop"><section className="permission-modal" role="dialog" aria-modal="true" aria-label="啟用 YOLO 模式"><div className="permission-icon danger"><CircleAlert /></div><span className="eyebrow">PERMISSION MODE</span><h2>啟用 YOLO 模式？</h2><p>開啟「一律核准」後，權限請求將預設通過，可能讓工具或檔案變更在未複核下執行。建議只在你信任工作目錄與腳本時使用。</p><div><button className="danger-option" disabled={yoloBusy || lifecycleBusy || running || sessionLoading} onClick={() => void confirmPermissionMode()}><CircleAlert /><span><strong>{yoloBusy ? '啟用中…' : '我了解風險，啟用 YOLO'}</strong><small>立即一律核准</small></span></button><button autoFocus disabled={yoloBusy} onClick={() => setYoloConfirm(false)}><X /><span><strong>取消</strong><small>維持每次詢問</small></span></button></div></section></div>}
    {deleteTarget && <div className="modal-backdrop"><section className="permission-modal" role="dialog" aria-modal="true" aria-label="刪除對話確認"><div className="permission-icon danger"><Trash2 /></div><span className="eyebrow">DELETE SESSION</span><h2>刪除這則對話？</h2><p>「{sessionDisplayTitle(deleteTarget, settings.sessionTitles)}」（{deleteTarget.cwd}）將從本機 session 歷史永久刪除，無法復原。</p><div><button className="danger-option" onClick={() => void deleteSession()}><Trash2 /><span><strong>永久刪除</strong><small>grok sessions delete</small></span></button><button autoFocus onClick={() => setDeleteTarget(null)}><X /><span><strong>取消</strong><small>保留這則對話</small></span></button></div></section></div>}
    {batchDeleteTargets && <div className="modal-backdrop"><section className="permission-modal" role="dialog" aria-modal="true" aria-label="批次刪除確認"><div className="permission-icon danger"><Trash2 /></div><span className="eyebrow">DELETE SESSION</span><h2>刪除所選對話</h2><p>將刪除 {batchDeleteTargets.length} 則對話，請確認。這些資料將從本機 session 歷史永久移除，無法復原。</p><div><button className="danger-option" onClick={() => void deleteSessions(batchDeleteTargets)}><Trash2 /><span><strong>永久刪除</strong><small>grok sessions delete</small></span></button><button autoFocus onClick={() => setBatchDeleteTargets(null)}><X /><span><strong>取消</strong><small>保留全部對話</small></span></button></div></section></div>}
    {renameTarget && <div className="modal-backdrop"><section className="permission-modal rename-modal" role="dialog" aria-modal="true" aria-label="重新命名對話"><div className="permission-icon"><Pencil /></div><span className="eyebrow">LOCAL TITLE</span><h2>替這則對話取一個好找的名稱</h2><p>只改這台電腦上的顯示名稱，不會修改 Grok CLI 的原始紀錄。</p><label>對話名稱<input aria-label="對話名稱" autoFocus value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') void saveSessionTitle(); if (event.key === 'Escape') { event.stopPropagation(); setRenameTarget(null) } }} /></label><div><button onClick={() => void saveSessionTitle()}><Check /><span><strong>儲存名稱</strong><small>保存在本機設定</small></span></button><button onClick={() => setRenameTarget(null)}><X /><span><strong>取消</strong></span></button></div></section></div>}
    {notice && (
      <div className="notice" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Zap />
        <span>{notice}</span>
        {lastExportedPath && notice.includes(lastExportedPath) && (
          <button
            type="button"
            className="text-button"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '0 4px',
              fontWeight: 'bold'
            }}
            onClick={async (e) => {
              e.stopPropagation()
              try {
                await window.grokApi.revealExport(lastExportedPath)
              } catch (err) {
                setNotice(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            開啟檔案
          </button>
        )}
        <button
          type="button"
          aria-label="關閉通知"
          style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', padding: 0, display: 'flex', alignItems: 'center' }}
          onClick={() => {
            setNotice('')
            setLastExportedPath(null)
          }}
        >
          <X size={14} />
        </button>
      </div>
    )}
  </div>
}
