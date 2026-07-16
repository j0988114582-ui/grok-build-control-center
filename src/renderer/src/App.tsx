import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import {
  Activity, Archive, Bot, Check, ChevronDown, ChevronRight, CircleAlert, Command, Cpu, FilePlus2,
  FolderOpen, Gauge, Keyboard, ListTodo, LoaderCircle, MessageSquare, Moon, Paperclip, PanelLeft, PanelLeftClose, Pencil, Pin, Play, Search, Send,
  Settings, Square, Sun, TerminalSquare, Trash2, UserRound, Wrench, X, Zap
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
import { QuotaRings } from './components/QuotaRings'
import { ModelPicker } from './components/ModelPicker'
import { CommandPalette, type PaletteCommand } from './components/CommandPalette'
import { CodeBlock } from './components/CodeBlock'
import { StarfieldCanvas } from './fx/StarfieldCanvas'
import { CursorFX } from './fx/CursorFX'
import {
  groupSessionsByProject,
  partitionPinnedSessions,
  sessionDisplayTitle
} from './components/session-groups'
import { pruneOrphanSessionLocalData, removeSessionLocalData, togglePinnedSession } from '../../shared/session-local-state'
import type {
  AgentCapabilities, AgentPermissionMode, AppSettings, BillingInfo, CliStatus, ModelState, PermissionRequest, PromptBlock,
  SessionSummary, SessionUsage, UiSessionEvent
} from '../../shared/types'

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
    case 'compact': return 'Context compacted'
    case 'retry': return `Retry ${event.attempt}/${event.maxRetries}`
    case 'unknown': return event.summary
  }
}

function Markdown({ children }: { children: string }): React.JSX.Element {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
    a: ({ href, children: label }) => <a href={href} onClick={(event) => { event.preventDefault(); if (href) void window.grokApi.openExternal(href) }}>{label}</a>,
    code: ({ children: code, className }) => <CodeBlock className={className}>{code}</CodeBlock>
  }}>{children}</ReactMarkdown>
}

function EventCard({ event, query }: { event: UiSessionEvent; query: string }): React.JSX.Element {
  const [open, setOpen] = useState(event.kind === 'message' || event.kind === 'error')
  const matches = query && eventText(event).toLocaleLowerCase().includes(query.toLocaleLowerCase())
  if (event.kind === 'message') return <article className={`message ${event.role} ${matches ? 'search-hit' : ''}`}>
    <div className="message-rail">{event.role === 'assistant' ? <Bot size={17} /> : <UserRound size={17} />}</div>
    <div className="message-body"><div className="message-label">{event.role === 'assistant' ? 'GROK' : 'YOU'}</div><Markdown>{event.text}</Markdown></div>
  </article>
  if (event.kind === 'turn') return <div className={`turn-marker ${event.status}`}><span />{event.status === 'running' ? 'Grok 正在工作' : `回合${event.status === 'completed' ? '完成' : event.status}`}</div>
  const icon = event.kind === 'tool' ? <Wrench size={16} /> : event.kind === 'thought' ? <Zap size={16} /> : event.kind === 'plan' ? <ListTodo size={16} /> : event.kind === 'subagent' ? <Bot size={16} /> : event.kind === 'task' ? <Activity size={16} /> : <CircleAlert size={16} />
  const title = eventTitle(event)
  return <article className={`event-card ${event.kind} ${matches ? 'search-hit' : ''}`}>
    <button className="event-head" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{icon}<span>{title}</span>{'status' in event && <em>{event.status}</em>}</button>
    {open && <div className="event-content">
      {event.kind === 'thought' && <Markdown>{event.text}</Markdown>}
      {event.kind === 'tool' && <><pre>{event.rawInput ? JSON.stringify(event.rawInput, null, 2) : 'No input details'}</pre>{event.output && <Markdown>{event.output}</Markdown>}</>}
      {event.kind === 'plan' && <ol>{event.entries.map((entry, index) => <li key={index} data-status={entry.status}>{entry.content}<small>{entry.status}</small></li>)}</ol>}
      {event.kind === 'subagent' && <p>{event.output ?? `Subagent ${event.status}`}</p>}
      {event.kind === 'task' && <p>Background task · {event.status}</p>}
      {event.kind === 'recap' && <Markdown>{event.summary}</Markdown>}
      {event.kind === 'error' && <p>{event.message}</p>}
      {event.kind === 'unknown' && <p>{event.summary}</p>}
      {event.kind === 'commands' && <p>{event.commands.length} commands available</p>}
      {event.kind === 'mode' && <p>Current mode: {event.modeId}</p>}
      {event.kind === 'usage' && <p>{event.used ?? '—'} / {event.size ?? '—'} tokens</p>}
      {event.kind === 'compact' && <p>{event.before ?? '—'} → {event.after ?? '—'} tokens</p>}
      {event.kind === 'retry' && <p>{event.reason}</p>}
    </div>}
  </article>
}

const MemoEventCard = React.memo(EventCard)
const TranscriptFooter = (): React.JSX.Element => <div className="transcript-end">END OF CURRENT CONTEXT</div>

function SettingsPanel({ settings, onSave, onClose }: { settings: AppSettings; onSave: (settings: AppSettings) => void; onClose: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState(settings)
  const conflicts = findShortcutConflicts(draft.shortcuts)
  return <aside className="drawer"><div className="drawer-head"><div><span className="eyebrow">LOCAL PREFERENCES</span><h2>工作台設定</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="settings-section"><label>Grok 執行檔<input value={draft.grokExecutable} onChange={(event) => setDraft({ ...draft, grokExecutable: event.target.value })} /></label></div>
    <div className="settings-grid">
      <label>字級 <output>{draft.fontSize}px</output><input type="range" min="12" max="22" value={draft.fontSize} onChange={(event) => setDraft({ ...draft, fontSize: Number(event.target.value) })} /></label>
      <label>行高 <output>{draft.lineHeight.toFixed(2)}</output><input type="range" min="1.2" max="2.1" step="0.05" value={draft.lineHeight} onChange={(event) => setDraft({ ...draft, lineHeight: Number(event.target.value) })} /></label>
      <label>內容寬度 <output>{draft.contentWidth}px</output><input type="range" min="640" max="1400" step="20" value={draft.contentWidth} onChange={(event) => setDraft({ ...draft, contentWidth: Number(event.target.value) })} /></label>
    </div>
    <div className="theme-choice"><button className={draft.theme === 'dark' ? 'active' : ''} onClick={() => setDraft({ ...draft, theme: 'dark' })}><Moon />深色</button><button className={draft.theme === 'light' ? 'active' : ''} onClick={() => setDraft({ ...draft, theme: 'light' })}><Sun />亮色</button></div>
    <div className="settings-section cockpit-settings"><div className="section-title"><h3>銀河座艙</h3><small>亮色主題自動停用星空</small></div>
      <div className="immersion-choice"><button className={draft.immersion === 'focus' ? 'active' : ''} onClick={() => setDraft({ ...draft, immersion: 'focus' })}><strong>閱讀優先</strong><small>紙感對話區</small></button><button className={draft.immersion === 'deep' ? 'active' : ''} onClick={() => setDraft({ ...draft, immersion: 'deep' })}><strong>全沉浸</strong><small>深色玻璃對話區</small></button></div>
      <label className="toggle-row"><span><strong>曲速星空</strong><small>執行狀態聯動與 Canvas 降級</small></span><input type="checkbox" checked={draft.effects.galaxy} onChange={(event) => setDraft({ ...draft, effects: { ...draft.effects, galaxy: event.target.checked } })} /></label>
      <label className="toggle-row"><span><strong>星航游標</strong><small>拖尾、nova 與磁吸</small></span><input type="checkbox" checked={draft.effects.cursor} onChange={(event) => setDraft({ ...draft, effects: { ...draft.effects, cursor: event.target.checked } })} /></label>
      <label className="toggle-row"><span><strong>停用全部動效</strong><small>保留靜態星圖與完整功能</small></span><input type="checkbox" checked={draft.effects.reducedMotion} onChange={(event) => setDraft({ ...draft, effects: { ...draft.effects, reducedMotion: event.target.checked } })} /></label>
      <label className="density-row"><span>粒子密度</span><select value={draft.effects.density} onChange={(event) => setDraft({ ...draft, effects: { ...draft.effects, density: event.target.value as AppSettings['effects']['density'] } })}><option value="low">低 · 600</option><option value="medium">中 · 1000</option><option value="high">高 · 1500</option></select></label>
    </div>
    <div className="settings-section"><div className="section-title"><h3>快捷鍵</h3><button className="text-button" onClick={() => setDraft({ ...draft, shortcuts: DEFAULT_SHORTCUTS.map((binding) => ({ ...binding })) })}>恢復預設</button></div>
      {draft.shortcuts.map((binding, index) => <label className="shortcut-row" key={binding.command}><span>{binding.command}</span><input value={binding.accelerator} onChange={(event) => setDraft({ ...draft, shortcuts: draft.shortcuts.map((item, i) => i === index ? { ...item, accelerator: event.target.value } : item) })} /><small>{binding.scope}</small></label>)}
      {conflicts.length > 0 && <div className="warning"><CircleAlert />{conflicts.map((item) => item.accelerator).join('、')} 發生衝突</div>}
    </div>
    <button className="primary wide" disabled={conflicts.length > 0} onClick={() => onSave(draft)}>儲存設定</button>
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
  const [transcriptQuery, setTranscriptQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>('none')
  const [permissions, setPermissions] = useState<PermissionRequest[]>([])
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>('ask')
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({})
  const [yoloConfirm, setYoloConfirm] = useState(false)
  const [yoloBusy, setYoloBusy] = useState(false)
  const [loadingSessionIds, setLoadingSessionIds] = useState<string[]>([])
  const [pastePathChip, setPastePathChip] = useState<string | null>(null)
  /** Mid-turn interjection lifecycle (queued → cleared on turn end / cancel discard). */
  const [interjectState, setInterjectState] = useState<InterjectUiState>(null)
  const [interjectBusy, setInterjectBusy] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [usage, setUsage] = useState<SessionUsage | null>(null)
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
  const [notice, setNotice] = useState('')
  const [setupDialog, setSetupDialog] = useState<SetupDialog>(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const virtuoso = useRef<VirtuosoHandle>(null)
  const sessionSearchRef = useRef<HTMLInputElement>(null)
  const transcriptSearchRef = useRef<HTMLInputElement>(null)
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
  followTailRef.current = followTail
  activeIdRef.current = active?.id ?? null

  const refreshUsage = async (sessionId: string): Promise<void> => {
    try {
      const next = await window.grokApi.getUsage(sessionId)
      if (activeIdRef.current === sessionId) setUsage(next)
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
  const sessionLoading = loadingSessionIds.length > 0
  const permissionControlsLocked = lifecycleBusy || running || sessionLoading || yoloBusy
  const attachments = active ? attachmentsBySession[active.id] ?? [] : []
  const permissionModeTitle = running
    ? '請先停止目前執行中的回合'
    : lifecycleBusy || sessionLoading
      ? '系統忙碌中，請稍候再切換權限模式'
      : '工具權限模式（每次啟動重置為每次詢問）'

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
      if (event.kind === 'error') setErrorPulse((value) => value + 1)
      if (event.kind === 'turn') {
        setRunningMap((current) => ({ ...current, [event.sessionId]: event.status === 'running' }))
        if (event.status !== 'running') {
          setPermissions((current) => current.filter((item) => item.sessionId !== event.sessionId))
          // P1-1: no drain evidence via SDK closed union — clear queued without claiming delivered.
          setInterjectState((current) =>
            current?.status === 'queued' && current.sessionId === event.sessionId ? null : current)
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
    const offStatus = window.grokApi.onStatus((next) => {
      if (next.connected !== undefined) setStatus((current) => ({ ...current, connected: next.connected === true }))
      if (next.connected === false) {
        setPermissions([])
        setCaps(EMPTY_CAPS)
        setModels(undefined)
        billingRef.current = null
        setBilling(null)
        setBillingUnavailable(false)
      }
      if (next.stderr) console.warn('[grok stderr]', next.stderr)
      if (next.message) setNotice(next.message)
    })
    return () => { offEvent(); offPermission(); offStatus() }
  }, [])

  useEffect(() => {
    if (!status.connected) return
    void refreshBillingRef.current()
    const timer = window.setInterval(() => { void refreshBillingRef.current() }, 600_000)
    return () => window.clearInterval(timer)
  }, [status.connected])

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

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.isComposing) return
      if (setupDialog && event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      const editing = Boolean(target?.matches('input, textarea, select') || target?.isContentEditable)
      const command = commandForEvent(settings.shortcuts, event, editing ? ['global'] : ['global', 'transcript'])
      if (command === 'toggleSidebar') { event.preventDefault(); setSidebarOpen((current) => !current); return }
      if (command === 'searchTranscript') { event.preventDefault(); setSearchOpen(true); setTimeout(() => transcriptSearchRef.current?.focus(), 0); return }
      if (command === 'commandPalette') { event.preventDefault(); setPanel('commands'); return }
      if (command === 'searchSessions') { event.preventDefault(); if (!sidebarOpen) setSidebarOpen(true); setTimeout(() => sessionSearchRef.current?.focus(), 0); return }
      if (command === 'newSession') { event.preventDefault(); if (!lifecycleBusy) createSessionRef.current(); return }
      if (command === 'jumpToLatest') { event.preventDefault(); jumpToLatestRef.current(); return }
      if (command === 'cancelTurn' || event.key === 'Escape') {
        if (panel !== 'none') { event.preventDefault(); setPanel('none'); return }
        if (setupDialog) { event.preventDefault(); if (!lifecycleBusy) setSetupDialog(null); return }
        if (batchDeleteTargets) { event.preventDefault(); setBatchDeleteTargets(null); return }
        if (yoloConfirm) { event.preventDefault(); setYoloConfirm(false); return }
        if (deleteTarget) { event.preventDefault(); setDeleteTarget(null); return }
        if (selectMode) { event.preventDefault(); setSelectMode(false); setSelectedIds(new Set()); return }
        if (renameTarget) { event.preventDefault(); setRenameTarget(null); return }
        if (searchOpen) { event.preventDefault(); setSearchOpen(false); setTranscriptQuery(''); return }
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
  }, [running, active, panel, setupDialog, lifecycleBusy, batchDeleteTargets, yoloConfirm, deleteTarget, renameTarget, searchOpen, selectMode, sidebarOpen, settings.shortcuts])

  const activeEvents = useMemo(() => active ? events[active.id] ?? [] : [], [active, events])
  const searchHits = useMemo(() => transcriptQuery ? activeEvents.filter((event) => eventText(event).toLocaleLowerCase().includes(transcriptQuery.toLocaleLowerCase())).length : 0, [activeEvents, transcriptQuery])
  const shortcutFor = (command: string): string => settings.shortcuts.find((binding) => binding.command === command)?.accelerator ?? ''
  const shortcutLabel = (command: string): string => shortcutFor(command).replaceAll('+', ' + ')
  const filteredSessions = useMemo(() => sessions.filter((session) => `${sessionDisplayTitle(session, settings.sessionTitles)} ${session.cwd}`.toLocaleLowerCase().includes(sessionQuery.toLocaleLowerCase())), [sessions, sessionQuery, settings.sessionTitles])
  const { pinned, unpinned } = useMemo(
    () => partitionPinnedSessions(filteredSessions, settings.pinnedSessions),
    [filteredSessions, settings.pinnedSessions]
  )
  const sessionGroups = useMemo(() => groupSessionsByProject(unpinned), [unpinned])
  const selectedCount = selectedIds.size
  const selectedSessions = useMemo(() => sessions.filter((session) => selectedIds.has(session.id)), [sessions, selectedIds])
  const renderSessionRow = (session: SessionSummary): React.JSX.Element => {
    const title = sessionDisplayTitle(session, settings.sessionTitles)
    const isPinned = settings.pinnedSessions.includes(session.id)
    const isSelected = selectedIds.has(session.id)
    return <div key={session.id} className={`session-row ${active?.id === session.id ? 'active' : ''} ${collapsingSessionId === session.id ? 'collapsing' : ''} ${selectMode ? 'select-mode' : ''} ${isSelected ? 'selected' : ''}`}>
      {selectMode && <input className="session-check" type="checkbox" aria-label={`選擇對話 ${title}`} checked={isSelected} onChange={(event) => toggleSessionSelection(session.id, event.currentTarget.checked)} />}
      <button className="session-open" disabled={lifecycleBusy || loadingSessionIds.includes(session.id)} onClick={() => void loadSession(session)}>
        <span className="session-dot" />
        <div><strong>{title}</strong><small>{session.cwd}</small><time>{formatDate(session.updatedAt)}</time></div>
      </button>
      {!selectMode && <>
        <button className={`session-pin ${isPinned ? 'pinned' : ''}`} title={isPinned ? '取消釘選' : '釘選'} aria-label={isPinned ? `取消釘選 ${title}` : `釘選 ${title}`} onClick={() => togglePinned(session)}><Pin /></button>
        <button className="session-rename" title="重新命名" aria-label={`重新命名 ${title}`} onClick={() => { setRenameTarget(session); setRenameDraft(title) }}><Pencil /></button>
        <button className="session-delete" data-nova-tone="danger" title="刪除對話" aria-label={`刪除對話 ${title}`} onClick={() => setDeleteTarget(session)}><Trash2 /></button>
      </>}
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
    if (lifecycleBusy || running || sessionLoading) {
      setYoloConfirm(false)
      setNotice(running ? '請先停止目前執行中的回合，再切換權限模式' : '系統忙碌中，請稍候再切換權限模式')
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
    if (mode === permissionMode || permissionControlsLocked) return
    if (mode === 'always-approve') setYoloConfirm(true)
    else void setPermissionModeWithBackend('ask')
  }
  const setPermissionModeWithBackend = async (mode: AgentPermissionMode): Promise<void> => {
    const activeSession = active
    const wasConnected = status.connected
    try {
      const nextMode = await window.grokApi.setPermissionMode(mode)
      setPermissionMode(nextMode)
      setNotice(nextMode === 'always-approve' ? '⚠️ 已切換到 YOLO 模式（本次啟動有效）' : '權限模式已切換為每次詢問')
      // Main process already reconnects ACP with new flags. Reload active session so prompts still work.
      if (wasConnected && activeSession) {
        try {
          const value = await window.grokApi.connect()
          setCaps(value)
          setModels(value.modelState)
          setStatus((current) => ({ ...current, connected: true }))
          await loadSession(activeSession)
        } catch (error) {
          setNotice(error instanceof Error ? error.message : String(error))
        }
      } else if (wasConnected) {
        try {
          const value = await window.grokApi.connect()
          setCaps(value)
          setModels(value.modelState)
          setStatus((current) => ({ ...current, connected: true }))
        } catch (error) {
          setNotice(error instanceof Error ? error.message : String(error))
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }
  const connect = async (): Promise<AgentCapabilities | null> => {
    if (lifecycleBusy) return null
    setNotice('正在連接 Grok ACP…')
    try {
      const value = await window.grokApi.connect()
      setCaps(value)
      setModels(value.modelState)
      setStatus((current) => ({ ...current, connected: true }))
      setNotice('ACP 已連線')
      void refreshBillingRef.current()
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
    if (lifecycleBusy || running) return
    setLifecycleBusy(true)
    setNotice('等待瀏覽器完成 Grok 登入…')
    try {
      const value = await window.grokApi.reauthenticate()
      setCaps(value)
      setModels(value.modelState)
      setActive(null)
      setUsage(null)
      setRunningMap({})
      setFollowTail(true)
      setUnread(0)
      setStatus((current) => ({ ...current, found: true, connected: true }))
      setSetupDialog(null)
      setNotice('Grok 帳號已重新登入')
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
      if (!response.sessionId) return
      setModels(response.models ?? capsValue.modelState)
      applySessionModes(response.modes)
      const summary = { id: response.sessionId, cwd, title: 'New session', updatedAt: new Date().toISOString() }
      setSessions((current) => [summary, ...current])
      setActive(summary)
      setPastePathChip(null)
      setUsage(null)
      setFollowTail(true)
      setUnread(0)
      void refreshUsage(response.sessionId)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }
  const loadSession = async (session: SessionSummary): Promise<void> => {
    if (lifecycleBusy || loadingSessionsRef.current.has(session.id)) return
    loadingSessionsRef.current.add(session.id)
    setLoadingSessionIds((current) => current.includes(session.id) ? current : [...current, session.id])
    try {
      const capsValue = await connect()
      if (!capsValue) return
      const previousActive = active
      const previousUsage = usage
      const previousEvents = events[session.id]
      setActive(session)
      setPastePathChip(null)
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
        window.setTimeout(() => { void refreshUsageRef.current(session.id) }, 0)
      } catch (error) {
        setActive((current) => current?.id === session.id ? previousActive : current)
        if (activeIdRef.current === session.id || activeIdRef.current === previousActive?.id) setUsage(previousUsage)
        setEvents((current) => {
          const next = { ...current }
          if (previousEvents) next[session.id] = previousEvents
          else delete next[session.id]
          return next
        })
        setNotice(error instanceof Error ? error.message : String(error))
      }
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
        if (active && succeededSet.has(active.id)) { setActive(null); setUsage(null) }
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

  const sendPrompt = async (): Promise<void> => {
    if (!active || running) return
    const sessionId = active.id
    const text = drafts[sessionId]?.trim()
    if (!text && !attachments.length) return
    dispatchPrompt(sessionId, text, attachments)
  }

  /** F-INT-2: queue mid-turn guidance without cancelling. */
  const sendInterject = async (): Promise<void> => {
    if (!active || !running || interjectBusy) return
    const sessionId = active.id
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

  /** F-INT-3: cancel active turn then send a fresh prompt (separate control from interject). */
  const doThisNow = async (): Promise<void> => {
    if (!active || !running || interjectBusy) return
    const sessionId = active.id
    const text = drafts[sessionId]?.trim()
    if (!text && !attachments.length) return
    const pendingAttachments = attachments
    setInterjectBusy(true)
    discardQueuedInterject(sessionId)
    setDrafts((current) => ({ ...current, [sessionId]: '' }))
    setAttachmentsBySession((current) => ({ ...current, [sessionId]: [] }))
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

  /** Shared paste / drag-drop image pipeline (path-only when ACP image capability is false). */
  const ingestImageFiles = (files: File[], source: 'paste' | 'drop'): void => {
    if (!files.length || !active) return
    const sessionId = active.id
    const imageFiles = files.filter((file) => file.type.startsWith('image/') || (!file.type && source === 'paste'))
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
      const paths: string[] = []
      let failed = 0
      for (const file of imageFiles) {
        const image = await readFileAsImage(file)
        if (!image) { failed += 1; continue }
        try {
          const saved = await window.grokApi.savePasteImage(image)
          paths.push(saved.path)
        } catch {
          failed += 1
        }
      }
      if (!paths.length) {
        setNotice(failed
          ? (source === 'drop' ? '拖放圖片儲存失敗，草稿未變更' : '貼圖儲存失敗，草稿未變更')
          : (source === 'drop' ? '無法讀取拖放圖片' : '無法讀取剪貼簿圖片'))
        return
      }
      setDrafts((current) => {
        const previous = current[sessionId] ?? ''
        const joined = paths.join('\n')
        return { ...current, [sessionId]: previous ? `${previous}\n${joined}` : joined }
      })
      setPastePathChip(paths[paths.length - 1] ?? null)
      setNotice(failed
        ? `已改以本機路徑附上（ACP 目前不支援內嵌圖片）；${failed} 張失敗`
        : '已改以本機路徑附上（ACP 目前不支援內嵌圖片）')
    })()
  }

  const paste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...event.clipboardData.files]
    if (!files.length || !active) return
    event.preventDefault()
    ingestImageFiles(files, 'paste')
  }

  const onComposerDragOver = (event: React.DragEvent<HTMLElement>): void => {
    if (![...event.dataTransfer.types].includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const onComposerDrop = (event: React.DragEvent<HTMLElement>): void => {
    const files = [...event.dataTransfer.files]
    if (!files.length || !active) return
    event.preventDefault()
    ingestImageFiles(files, 'drop')
  }
  const dismissPastePathChip = (): void => {
    if (!active || !pastePathChip) { setPastePathChip(null); return }
    const sessionId = active.id
    const path = pastePathChip
    setPastePathChip(null)
    setDrafts((current) => {
      const previous = current[sessionId] ?? ''
      if (!previous.includes(path)) return current
      const next = previous
        .split('\n')
        .filter((line) => line !== path)
        .join('\n')
      return { ...current, [sessionId]: next }
    })
  }

  const activeModel = models?.availableModels.find((model) => model.modelId === models.currentModelId)
  const usageTotal = usage?.contextWindowTokens ?? activeModel?.totalContextTokens
  const usagePercent = usage?.contextWindowUsage ?? (usage?.contextTokensUsed !== undefined && usageTotal ? Math.round((usage.contextTokensUsed / usageTotal) * 100) : undefined)
  const usageLevel = usagePercent === undefined ? '' : usagePercent >= 85 ? 'danger' : usagePercent >= 60 ? 'warn' : ''

  const effectiveImmersion = settings.theme === 'light' ? 'focus' : settings.immersion
  const paletteCommands: PaletteCommand[] = [
    { id: 'new-session', label: '建立新對話', description: '選擇專案資料夾並啟動 Grok', keywords: 'new session 專案 資料夾', shortcut: shortcutFor('newSession').replaceAll('+', ' '), onRun: () => { void createSession() } },
    { id: 'search-transcript', label: '搜尋目前對話', description: '在已載入的訊息中找文字', keywords: 'find search transcript 尋找', shortcut: shortcutFor('searchTranscript').replaceAll('+', ' '), onRun: () => { setSearchOpen(true); window.setTimeout(() => transcriptSearchRef.current?.focus(), 0) } },
    ...caps.commands.map((command): PaletteCommand => ({ id: `slash:${command.name}`, label: `/${command.name}`, description: command.description, keywords: `${command.name} slash command`, onRun: () => { if (active) setDrafts((current) => ({ ...current, [active.id]: `/${command.name} ` })) } }))
  ]

  return <div className="app" data-theme={settings.theme} data-immersion={effectiveImmersion} data-cursor={settings.effects.cursor && !settings.effects.reducedMotion ? 'true' : undefined} data-fx-off={settings.effects.reducedMotion ? 'true' : undefined} style={{ '--font-size': `${settings.fontSize}px`, '--line-height': settings.lineHeight, '--content-width': `${settings.contentWidth}px` } as React.CSSProperties}>
    <StarfieldCanvas enabled={settings.effects.galaxy} theme={settings.theme} density={settings.effects.density} reducedMotion={settings.effects.reducedMotion} running={running} connected={status.connected} errorPulse={errorPulse} />
    <CursorFX enabled={settings.effects.cursor} reducedMotion={settings.effects.reducedMotion} />
    <header className="titlebar"><div className="brand-mark"><span>G</span></div><strong>GROK BUILD</strong><i>DESKTOP WORKBENCH</i><div className="drag-region" />
      <QuotaRings billing={billing} unavailable={billingUnavailable} />
      {active && <div className="usage-pill" data-context-zone="session" aria-label="Context 視窗用量" title={`Context 視窗（本 session，非訂閱週額度）${usage?.turnCount !== undefined ? ` · ${usage.turnCount} 回合` : ''}${usage?.toolCallCount !== undefined ? ` · ${usage.toolCallCount} 次工具` : ''}`}><Gauge /><b className="usage-pill-label">Context</b><span>{usagePercent !== undefined ? `${usagePercent}%` : '—'}</span><div className="usage-bar"><i className={usageLevel} style={{ width: `${Math.min(100, usagePercent ?? 0)}%` }} /></div><em>{formatTokens(usage?.contextTokensUsed)} / {formatTokens(usageTotal)}</em></div>}
      <label title={permissionModeTitle}><select aria-label="權限模式" value={permissionMode} disabled={permissionControlsLocked} onChange={(event) => requestPermissionMode(event.target.value as AgentPermissionMode)}><option value="ask">每次詢問</option><option value="always-approve">一律核准（YOLO）</option></select></label>
      {status.found && <button className="account-pill" aria-label="切換 Grok 帳號" title={running ? '請先停止目前執行中的回合' : '切換 Grok 帳號'} disabled={lifecycleBusy || running} onClick={() => openSetupDialog('account')}><UserRound />切換帳號</button>}
      <button className={`status-pill ${status.connected ? 'online' : ''}`} disabled={lifecycleBusy} onClick={() => { if (status.found) void connect(); else openSetupDialog('install') }}><span />{status.found ? `Grok ${status.version ?? ''}` : 'CLI not found'} · {status.connected ? 'Connected' : status.found ? 'Connect' : 'Setup'}</button></header>
    <div className={`workspace ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sidebar-actions"><button className="primary" data-magnetic data-nova-tone="primary" disabled={lifecycleBusy} onClick={() => void createSession()}><FilePlus2 />新 Session</button><button className="icon-button sidebar-rail-expand" aria-label="展開側欄" onClick={() => setSidebarOpen(true)}><PanelLeft /></button><button className="icon-button" aria-label="收合側欄" onClick={() => setSidebarOpen(false)}><PanelLeftClose /></button></div>
        <label className="searchbox"><Search /><input ref={sessionSearchRef} placeholder={`搜尋 sessions  ${shortcutFor('searchSessions').replaceAll('+', ' ')}`} value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} /></label>
        <div className="session-caption"><span>RECENT SESSIONS</span><em>{filteredSessions.length}</em></div>
        <div className="sidebar-select-bar">
          {!selectMode && <button onClick={() => setSelectMode(true)}>多選</button>}
          {selectMode && <>
            <button onClick={() => { setSelectMode(false); clearSelection() }}>取消</button>
            <button onClick={() => selectAllVisibleSessions()}>全選可見</button>
            <button className={selectedCount > 0 ? '' : undefined} onClick={beginBatchDelete} disabled={selectedCount === 0}><span className="danger-text">刪除所選({selectedCount})</span></button>
          </>}
        </div>
        <nav className="session-list">
          {pinned.length > 0 && <section className="session-group pinned" key="pinned-group">
            <header><span>已釘選</span><em>{pinned.length}</em></header>
            {pinned.map(renderSessionRow)}
          </section>}
          {sessionGroups.map((group) => <section className="session-group" key={group.cwd}><header><span>{group.name}</span><em>{group.sessions.length}</em></header>{group.sessions.map(renderSessionRow)}</section>)}
        </nav>
        <div className="sidebar-footer"><button onClick={() => setPanel('features')}><Gauge />功能矩陣</button><button onClick={() => setPanel('settings')}><Settings />設定</button></div>
      </aside>
      <main className="main">
        {!sidebarOpen && <button className="icon-button sidebar-expand-float" aria-label="展開側欄" onClick={() => setSidebarOpen(true)}><PanelLeft /></button>}
        {permissionMode === 'always-approve' && <div className="yolo-banner">⚠️ <strong>YOLO</strong> 模式：已啟用一律核准，可能會自動通過風險操作。</div>}
        {!active ? <section className="empty-state"><div className="empty-orbit"><Cpu /><span /></div><span className="eyebrow">WINDOWS GROK BUILD CONTROL CENTER</span><h1>{status.found ? <>選一個專案資料夾，<br/><em>就可以開始。</em></> : <>第一次使用？<br/><em>一鍵準備 Grok。</em></>}</h1><p>{status.found ? '不用輸入終端指令。這裡會替你連接本機 Grok、保留未送出的文字，並在執行前顯示權限確認。' : '不用先學終端，也不用安裝 Node.js。程式會在你確認後，從 x.ai 官方來源安裝 Grok CLI。'}</p><div className="onboarding-steps">{status.found ? <><span><b>1</b>按「選擇專案開始」</span><span><b>2</b>選擇你的工作資料夾</span><span><b>3</b>用白話交代任務</span></> : <><span><b>1</b>確認安裝 Grok CLI</span><span><b>2</b>在瀏覽器登入 Grok</span><span><b>3</b>選資料夾開始</span></>}</div><div>{status.found ? <><button className="primary large" data-magnetic data-nova-tone="primary" disabled={lifecycleBusy} onClick={() => void createSession()}><FolderOpen />選擇專案開始</button><button className="secondary large" disabled={lifecycleBusy} onClick={() => void connect()}><Play />連接本機 Grok</button></> : <button className="primary large" data-magnetic data-nova-tone="primary" disabled={lifecycleBusy} onClick={() => openSetupDialog('install')}><TerminalSquare />安裝 Grok CLI</button>}</div><div className="empty-stats"><span><b>{sessions.length}</b>個本機對話</span><span><b>{status.version ?? '—'}</b>Grok CLI 版本</span><span><b>ACP</b>不模擬終端</span></div></section> : <>
          <header className="session-header"><div><span className="eyebrow">ACTIVE SESSION</span><h1>{sessionDisplayTitle(active, settings.sessionTitles)}</h1><p>{active.cwd}</p></div><div className="session-tools">{models && <ModelPicker models={models} onModelChange={(modelId) => void changeModel(modelId)} onEffortChange={(effort) => void changeEffort(effort)} />}{caps.modes.length > 0 && <select aria-label="Mode" value={caps.currentModeId ?? ''} onChange={(event) => { if (event.target.value) void window.grokApi.setMode(active.id, event.target.value).catch((error) => setNotice(error instanceof Error ? error.message : String(error))) }}><option value="" disabled>Mode</option>{caps.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select>}<button className="icon-button" title="搜尋" onClick={() => setSearchOpen(!searchOpen)}><Search /></button><button className="icon-button" title="匯出" onClick={() => void window.grokApi.exportSession(active.id).then((path) => { if (path) setNotice(`已匯出到 ${path}`) }).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))}><Archive /></button><button className="icon-button" title="在 TUI 開啟" onClick={() => openTui(active.cwd)}><TerminalSquare /></button><button className="icon-button" title="命令" onClick={() => setPanel('commands')}><Command /></button></div></header>
          {searchOpen && <div className="transcript-search"><Search /><input ref={transcriptSearchRef} value={transcriptQuery} onChange={(event) => setTranscriptQuery(event.target.value)} placeholder="搜尋目前對話…" /><span>{searchHits} 筆</span><button onClick={() => { setSearchOpen(false); setTranscriptQuery('') }}><X /></button></div>}
          <section className="transcript"><Virtuoso ref={virtuoso} data={activeEvents} computeItemKey={(_index, event) => event.id} followOutput={followTail ? 'auto' : false} atBottomStateChange={(bottom) => { setFollowTail(bottom); if (bottom) setUnread(0) }} itemContent={(_index, event) => <div className="event-wrap"><MemoEventCard event={event} query={transcriptQuery} /></div>} components={{ Footer: TranscriptFooter }} />{!followTail && <button className="jump-latest" onClick={jumpToLatest}>跳到最新 {unread > 0 && <b>{unread}</b>}</button>}</section>
          <footer className="composer-wrap" onDragOver={onComposerDragOver} onDrop={onComposerDrop}>
            <div className="composer-status">
              {running
                ? <><LoaderCircle className="spin" />Grok 正在執行工具或生成回覆{interjectState?.status === 'queued' && interjectState.sessionId === active.id ? <em className="interject-queued" data-testid="interject-status"> · {INTERJECT_QUEUED_NOTICE}</em> : null}</>
                : lifecycleBusy || sessionLoading
                  ? <><LoaderCircle className="spin" />系統忙碌中（連線或載入）</>
                  : <><span className="ready-dot" />準備就緒</>}
              <span>{running ? `${shortcutLabel('sendPrompt')} 插話 · ${shortcutLabel('cancelTurn')} 停止` : `${shortcutLabel('sendPrompt')} 傳送 · ${shortcutLabel('newline')} 換行 · ${shortcutLabel('cancelTurn')} 取消`}</span>
            </div>
            {attachments.length > 0 && <div className="attachment-row">{attachments.map((item, index) => <span key={index}><Paperclip />{'name' in item ? item.name : 'Attachment'}<button aria-label={`移除附件 ${'name' in item ? item.name : index + 1}`} onClick={() => setAttachmentsBySession((current) => ({ ...current, [active.id]: (current[active.id] ?? []).filter((_item, i) => i !== index) }))}><X /></button></span>)}</div>}
            {pastePathChip && <div className="path-chip-row"><span className="path-chip" title={pastePathChip}><Paperclip /><em>{pastePathChip}</em><button type="button" aria-label="移除貼圖路徑" onClick={dismissPastePathChip}><X /></button></span></div>}
            <div className="composer">
              <button className="attach-button" aria-label="加入檔案" onClick={() => void chooseFiles()}><Paperclip /></button>
              <textarea
                value={drafts[active.id] ?? ''}
                onChange={(event) => setDrafts((current) => ({ ...current, [active.id]: event.target.value }))}
                onKeyDown={composerKey}
                onPaste={paste}
                placeholder={running ? '回合進行中可輸入插話，或改用「立刻改做」…' : '交給 Grok 一個任務，或貼上／拖放圖片與檔案路徑…'}
                rows={3}
              />
              {running ? <div className="composer-actions running">
                <button type="button" className="interject-button" data-testid="interject-button" title="在下一個安全點插入指示（不取消目前回合）" disabled={interjectBusy || !(drafts[active.id] ?? '').trim()} onClick={() => void sendInterject()}><MessageSquare />插話</button>
                <button type="button" className="do-now-button" data-testid="do-this-now-button" title="取消目前回合並立刻送出新指示" disabled={interjectBusy || (!(drafts[active.id] ?? '').trim() && attachments.length === 0)} onClick={() => void doThisNow()}><Zap />立刻改做</button>
                <button type="button" className="stop-button" data-nova-tone="danger" data-testid="stop-button" onClick={() => void cancelActiveTurn(active.id).catch((error) => setNotice(error instanceof Error ? error.message : String(error)))}><Square />停止</button>
              </div> : <button className="send-button" data-magnetic data-nova-tone="primary" onClick={() => void sendPrompt()}><Send />送出</button>}
            </div>
          </footer>
        </>}
      </main>
      {panel === 'settings' && <SettingsPanel settings={settings} onClose={() => setPanel('none')} onSave={(next) => void window.grokApi.saveSettings({ ...next, drafts, sessionTitles: settings.sessionTitles }).then((saved) => { setSettings(saved); setPanel('none') })} />}
      {panel === 'features' && <aside className="drawer"><div className="drawer-head"><div><span className="eyebrow">CAPABILITY ROUTER</span><h2>功能矩陣</h2></div><button className="icon-button" onClick={() => setPanel('none')}><X /></button></div><p className="drawer-intro">有結構化 ACP 介面才在 GUI 原生操作；其餘明確回到 TUI，不模擬終端按鍵。</p><div className="feature-list">{FEATURES.map(([name, route, state]) => <div key={name}><span className={state}>{state === 'native' ? <Check /> : state === 'conditional' ? <Cpu /> : <TerminalSquare />}</span><strong>{name}</strong><small>{route}</small></div>)}</div>{active && <button className="secondary wide" onClick={() => openTui(active.cwd)}><TerminalSquare />在 GROK TUI 開啟</button>}</aside>}
    </div>
    {panel === 'commands' && <CommandPalette commands={paletteCommands} recentIds={settings.recentCommands} onUse={rememberCommand} onClose={() => setPanel('none')} />}
    {panel === 'shortcuts' && <div className="modal-backdrop"><section className="shortcut-overlay" role="dialog" aria-modal="true" aria-label="快捷鍵一覽"><header><div><span className="eyebrow">KEYBOARD HELP</span><h2>快捷鍵一覽</h2></div><button className="icon-button" aria-label="關閉快捷鍵" onClick={() => setPanel('none')}><X /></button></header><div>{[
      [shortcutLabel('newSession'), '建立新對話'], [shortcutLabel('searchSessions'), '搜尋本機對話'], [shortcutLabel('searchTranscript'), '搜尋目前內容'], [shortcutLabel('toggleSidebar'), '切換側欄'], [shortcutLabel('commandPalette'), '開啟命令面板'], [shortcutLabel('jumpToLatest'), '跳到最新訊息'], [shortcutLabel('cancelTurn'), '取消執行（Esc 永遠先關閉視窗）'], ['?', '顯示這張說明']
    ].map(([keys, action]) => <p key={keys}><kbd>{keys}</kbd><span>{action}</span></p>)}</div><footer><Keyboard />在輸入框內按「?」會正常輸入文字，不會打開這張卡片。</footer></section></div>}
    {setupDialog === 'install' && <div className="modal-backdrop"><section className="permission-modal setup-modal" role="dialog" aria-modal="true" aria-label="安裝 Grok CLI" onKeyDown={containDialogFocus}><div className="permission-icon"><TerminalSquare /></div><span className="eyebrow">FIRST-TIME SETUP</span><h2>安裝 Grok CLI</h2><p>這是程式真正需要的工具，不是 Windows Terminal，也不是 Node.js。按下確認後才會從 x.ai 官方網址下載，安裝在你的 Windows 帳號內，不要求系統管理員權限。</p><code>https://x.ai/cli/install.ps1</code><div><button className="primary" aria-label="確認安裝 Grok CLI" disabled={lifecycleBusy} onClick={() => void installCli()}><TerminalSquare /><span><strong>{lifecycleBusy ? '正在安裝…' : '確認安裝 Grok CLI'}</strong><small>下載後會驗證 grok --version</small></span></button><button autoFocus disabled={lifecycleBusy} onClick={() => setSetupDialog(null)}><X /><span><strong>先不要</strong><small>不會下載或執行任何東西</small></span></button></div></section></div>}
    {setupDialog === 'account' && <div className="modal-backdrop"><section className="permission-modal setup-modal" role="dialog" aria-modal="true" aria-label="登入 Grok 帳號" onKeyDown={containDialogFocus}><div className="permission-icon"><UserRound /></div><span className="eyebrow">OFFICIAL GROK OAUTH</span><h2>{status.connected ? '切換 Grok 帳號' : '登入 Grok 帳號'}</h2><p>接下來會由 Grok CLI 開啟 x.ai 的瀏覽器登入頁。程式不會看見、保存或複製你的密碼與 token；CLI 目前也不提供帳號 email 或多帳號清單。</p><div><button className="primary" aria-label="開啟瀏覽器並重新登入" disabled={lifecycleBusy || running} onClick={() => void reauthenticateAccount()}><UserRound /><span><strong>{lifecycleBusy ? '等待瀏覽器登入…' : running ? '請先停止目前回合' : '開啟瀏覽器並重新登入'}</strong><small>完成後會重建連線與額度資料</small></span></button><button autoFocus disabled={lifecycleBusy} onClick={() => setSetupDialog(null)}><X /><span><strong>取消</strong><small>維持目前狀態</small></span></button></div></section></div>}
    {permission && <div className="modal-backdrop"><section key={permission.requestId} className="permission-modal" role="dialog" aria-modal="true" aria-label={permission.title} tabIndex={-1} autoFocus={!safePermissionOptionId} onKeyDown={containDialogFocus}><div className="permission-icon"><Wrench /></div><span className="eyebrow">ACTION REQUIRES APPROVAL{permissions.length > 1 ? ` · 還有 ${permissions.length - 1} 項待決` : ''}</span><h2>{permission.title}</h2><p>Grok 要求執行一項可能修改檔案或呼叫外部工具的操作。只可選擇代理提供的合法選項。</p><div>{permission.options.map((option) => <button key={option.optionId} autoFocus={option.optionId === safePermissionOptionId} className={option.kind.includes('reject') ? 'danger-option' : ''} onClick={() => void window.grokApi.respondPermission(permission.requestId, option.optionId).catch((error) => setNotice(error instanceof Error ? error.message : String(error))).then(() => setPermissions((current) => current.filter((item) => item.requestId !== permission.requestId)))}>{option.kind.includes('reject') ? <X /> : <Check />}<span><strong>{option.name}</strong><small>{option.kind}</small></span></button>)}</div></section></div>}
    {yoloConfirm && <div className="modal-backdrop"><section className="permission-modal" role="dialog" aria-modal="true" aria-label="啟用 YOLO 模式"><div className="permission-icon danger"><CircleAlert /></div><span className="eyebrow">PERMISSION MODE</span><h2>啟用 YOLO 模式？</h2><p>開啟「一律核准」後，權限請求將預設通過，可能讓工具或檔案變更在未複核下執行。建議只在你信任工作目錄與腳本時使用。</p><div><button className="danger-option" disabled={yoloBusy || lifecycleBusy || running || sessionLoading} onClick={() => void confirmPermissionMode()}><CircleAlert /><span><strong>{yoloBusy ? '啟用中…' : '我了解風險，啟用 YOLO'}</strong><small>立即一律核准</small></span></button><button autoFocus disabled={yoloBusy} onClick={() => setYoloConfirm(false)}><X /><span><strong>取消</strong><small>維持每次詢問</small></span></button></div></section></div>}
    {deleteTarget && <div className="modal-backdrop"><section className="permission-modal" role="dialog" aria-modal="true" aria-label="刪除對話確認"><div className="permission-icon danger"><Trash2 /></div><span className="eyebrow">DELETE SESSION</span><h2>刪除這則對話？</h2><p>「{sessionDisplayTitle(deleteTarget, settings.sessionTitles)}」（{deleteTarget.cwd}）將從本機 session 歷史永久刪除，無法復原。</p><div><button className="danger-option" onClick={() => void deleteSession()}><Trash2 /><span><strong>永久刪除</strong><small>grok sessions delete</small></span></button><button autoFocus onClick={() => setDeleteTarget(null)}><X /><span><strong>取消</strong><small>保留這則對話</small></span></button></div></section></div>}
    {batchDeleteTargets && <div className="modal-backdrop"><section className="permission-modal" role="dialog" aria-modal="true" aria-label="批次刪除確認"><div className="permission-icon danger"><Trash2 /></div><span className="eyebrow">DELETE SESSION</span><h2>刪除所選對話</h2><p>將刪除 {batchDeleteTargets.length} 則對話，請確認。這些資料將從本機 session 歷史永久移除，無法復原。</p><div><button className="danger-option" onClick={() => void deleteSessions(batchDeleteTargets)}><Trash2 /><span><strong>永久刪除</strong><small>grok sessions delete</small></span></button><button autoFocus onClick={() => setBatchDeleteTargets(null)}><X /><span><strong>取消</strong><small>保留全部對話</small></span></button></div></section></div>}
    {renameTarget && <div className="modal-backdrop"><section className="permission-modal rename-modal" role="dialog" aria-modal="true" aria-label="重新命名對話"><div className="permission-icon"><Pencil /></div><span className="eyebrow">LOCAL TITLE</span><h2>替這則對話取一個好找的名稱</h2><p>只改這台電腦上的顯示名稱，不會修改 Grok CLI 的原始紀錄。</p><label>對話名稱<input aria-label="對話名稱" autoFocus value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter') void saveSessionTitle(); if (event.key === 'Escape') { event.stopPropagation(); setRenameTarget(null) } }} /></label><div><button onClick={() => void saveSessionTitle()}><Check /><span><strong>儲存名稱</strong><small>保存在本機設定</small></span></button><button onClick={() => setRenameTarget(null)}><X /><span><strong>取消</strong></span></button></div></section></div>}
    {notice && <button className="notice" aria-live="polite" onClick={() => setNotice('')}><Zap />{notice}<X /></button>}
  </div>
}
