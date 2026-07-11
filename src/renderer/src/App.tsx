import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import {
  Activity, Archive, Bot, Check, ChevronDown, ChevronRight, CircleAlert, Command, Cpu, FilePlus2,
  FolderOpen, Gauge, Keyboard, ListTodo, LoaderCircle, Moon, Paperclip, PanelLeftClose, Pencil, Play, Search, Send,
  Settings, Square, Sun, TerminalSquare, Trash2, UserRound, Wrench, X, Zap
} from 'lucide-react'
import type { SelectedFile } from '../../shared/bridge'
import { createDefaultSettings } from '../../shared/settings'
import { selectedFilesToPrompt } from '../../shared/attachments'
import { findShortcutConflicts } from '../../shared/shortcuts'
import { sessionReducer } from '../../shared/session-state'
import { selectCrossedQuotaThreshold } from '../../shared/billing'
import { QuotaRings } from './components/QuotaRings'
import { ModelPicker } from './components/ModelPicker'
import { CommandPalette, type PaletteCommand } from './components/CommandPalette'
import { CodeBlock } from './components/CodeBlock'
import { StarfieldCanvas } from './fx/StarfieldCanvas'
import { CursorFX } from './fx/CursorFX'
import { groupSessionsByProject, sessionDisplayTitle } from './components/session-groups'
import type {
  AgentCapabilities, AppSettings, BillingInfo, CliStatus, ModelState, PermissionRequest, PromptBlock, SessionSummary, SessionUsage, UiSessionEvent
} from '../../shared/types'

const EMPTY_CAPS: AgentCapabilities = { loadSession: false, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [] }
const emptyStatus: CliStatus = { executable: '', found: false, connected: false }
type Panel = 'none' | 'settings' | 'features' | 'commands' | 'shortcuts'

const formatDate = (value?: string): string => value ? new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : ''
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
    <div className="settings-section"><div className="section-title"><h3>快捷鍵</h3><button className="text-button" onClick={() => setDraft({ ...draft, shortcuts: createDefaultSettings('C:\\Users\\111').shortcuts })}>恢復預設</button></div>
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
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings('C:\\Users\\111'))
  const [settingsHydrated, setSettingsHydrated] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [active, setActive] = useState<SessionSummary | null>(null)
  const [events, setEvents] = useState<Record<string, UiSessionEvent[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [attachments, setAttachments] = useState<PromptBlock[]>([])
  const [sessionQuery, setSessionQuery] = useState('')
  const [transcriptQuery, setTranscriptQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>('none')
  const [permissions, setPermissions] = useState<PermissionRequest[]>([])
  const [runningMap, setRunningMap] = useState<Record<string, boolean>>({})
  const [usage, setUsage] = useState<SessionUsage | null>(null)
  const [billing, setBilling] = useState<BillingInfo | null>(null)
  const [billingUnavailable, setBillingUnavailable] = useState(false)
  const [errorPulse, setErrorPulse] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null)
  const [collapsingSessionId, setCollapsingSessionId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [followTail, setFollowTail] = useState(true)
  const [unread, setUnread] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const virtuoso = useRef<VirtuosoHandle>(null)
  const sessionSearchRef = useRef<HTMLInputElement>(null)
  const transcriptSearchRef = useRef<HTMLInputElement>(null)
  const createSessionRef = useRef<() => void>(() => {})
  const jumpToLatestRef = useRef<() => void>(() => {})
  const followTailRef = useRef(true)
  const activeIdRef = useRef<string | null>(null)
  const billingRef = useRef<BillingInfo | null>(null)
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
        const storageKey = `grok-quota-alerts:${next.billingPeriodEnd ?? 'current'}`
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as unknown
        const reminded = new Set(Array.isArray(stored) ? stored.filter((item): item is number => item === 80 || item === 95) : [])
        const threshold = selectCrossedQuotaThreshold(previous.creditUsagePercent, next.creditUsagePercent, reminded)
        if (threshold) {
          reminded.add(threshold)
          localStorage.setItem(storageKey, JSON.stringify([...reminded]))
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

  const permission = permissions[0] ?? null
  const running = active ? runningMap[active.id] === true : false

  useEffect(() => {
    void Promise.all([window.grokApi.getStatus(), window.grokApi.listSessions(), window.grokApi.getSettings()]).then(([nextStatus, nextSessions, nextSettings]) => { setStatus(nextStatus); setSessions(nextSessions); setSettings(nextSettings); setDrafts(nextSettings.drafts); setSettingsHydrated(true) })
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
          void refreshUsageRef.current(event.sessionId)
          window.setTimeout(() => { void refreshBillingRef.current() }, 800)
        }
      }
      if (!followTailRef.current && event.sessionId === activeIdRef.current) setUnread((value) => value + 1)
    })
    const offPermission = window.grokApi.onPermission((request) => setPermissions((current) => [...current, request]))
    const offStatus = window.grokApi.onStatus((next) => { setStatus((current) => ({ ...current, ...next })); if (next.message) setNotice(next.message) })
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
      const target = event.target as HTMLElement | null
      const editing = Boolean(target?.matches('input, textarea, select') || target?.isContentEditable)
      if (event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); setTimeout(() => transcriptSearchRef.current?.focus(), 0) }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); setPanel('commands') }
      if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); sessionSearchRef.current?.focus() }
      if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); createSessionRef.current() }
      if (event.key === 'Escape') { if (running && active) void window.grokApi.cancel(active.id); else { setPanel('none'); setDeleteTarget(null) } }
      if (event.ctrlKey && event.key === 'End') jumpToLatestRef.current()
      if (event.key === '?' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setPanel('shortcuts') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [running, active])

  const activeEvents = active ? events[active.id] ?? [] : []
  const filteredSessions = useMemo(() => sessions.filter((session) => `${sessionDisplayTitle(session, settings.sessionTitles)} ${session.cwd}`.toLocaleLowerCase().includes(sessionQuery.toLocaleLowerCase())), [sessions, sessionQuery, settings.sessionTitles])
  const sessionGroups = useMemo(() => groupSessionsByProject(filteredSessions), [filteredSessions])
  const connect = async (): Promise<AgentCapabilities | null> => { setNotice('正在連接 Grok ACP…'); try { const value = await window.grokApi.connect(); setCaps(value); if (value.modelState) setModels((current) => current ?? value.modelState); setStatus((current) => ({ ...current, connected: true })); setNotice('ACP 已連線'); void refreshBillingRef.current(); return value } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); return null } }
  const createSession = async (): Promise<void> => { const cwd = await window.grokApi.chooseDirectory(); if (!cwd) return; const capsValue = await connect(); const response = await window.grokApi.createSession(cwd); if (!response.sessionId) return; setModels(response.models ?? capsValue?.modelState); const summary = { id: response.sessionId, cwd, title: 'New session', updatedAt: new Date().toISOString() }; setSessions((current) => [summary, ...current]); setActive(summary); setUsage(null); void refreshUsage(response.sessionId) }
  const loadSession = async (session: SessionSummary): Promise<void> => { setActive(session); setUsage(null); setEvents((current) => ({ ...current, [session.id]: [] })); const capsValue = await connect(); void refreshUsage(session.id); try { const response = await window.grokApi.loadSession(session.id, session.cwd); setModels((current) => response.models ?? current ?? capsValue?.modelState) } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) } }
  const deleteSession = async (): Promise<void> => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      await window.grokApi.deleteSession(target.id)
      setCollapsingSessionId(target.id)
      await new Promise((resolve) => window.setTimeout(resolve, 260))
      setSessions((current) => current.filter((item) => item.id !== target.id))
      setEvents((current) => { const next = { ...current }; delete next[target.id]; return next })
      setDrafts((current) => { const next = { ...current }; delete next[target.id]; return next })
      if (active?.id === target.id) { setActive(null); setUsage(null) }
      setCollapsingSessionId(null)
      setNotice(`已刪除對話「${target.title}」`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }
  const sendPrompt = async (): Promise<void> => { if (!active || running) return; const text = drafts[active.id]?.trim(); if (!text && !attachments.length) return; const blocks: PromptBlock[] = [...(text ? [{ type: 'text' as const, text }] : []), ...attachments]; setDrafts((current) => ({ ...current, [active.id]: '' })); setAttachments([]); void window.grokApi.sendPrompt(active.id, blocks).catch((error) => setNotice(error instanceof Error ? error.message : String(error))) }
  const chooseFiles = async (): Promise<void> => { const files = await window.grokApi.chooseFiles(); addSelectedFiles(files) }
  const addSelectedFiles = (files: SelectedFile[]): void => { if (!active) return; const { blocks, paths } = selectedFilesToPrompt(files, caps.promptCapabilities.image === true); setAttachments((current) => [...current, ...blocks]); if (paths) setDrafts((current) => ({ ...current, [active.id]: `${current[active.id] ?? ''}${current[active.id] ? '\n' : ''}${paths}` })) }
  const jumpToLatest = (): void => { virtuoso.current?.scrollToIndex({ index: Math.max(0, activeEvents.length - 1), align: 'end', behavior: 'smooth' }); setFollowTail(true); setUnread(0) }
  createSessionRef.current = () => { void createSession() }
  jumpToLatestRef.current = jumpToLatest
  const composerKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendPrompt() } }
  const changeModel = async (modelId: string): Promise<void> => { if (!active || !models) return; const model = models.availableModels.find((item) => item.modelId === modelId); await window.grokApi.setModel(active.id, modelId, model?.currentReasoningEffort); setModels({ ...models, currentModelId: modelId }) }
  const changeEffort = async (effort: string): Promise<void> => { if (!active || !models) return; await window.grokApi.setModel(active.id, models.currentModelId, effort); setModels({ ...models, availableModels: models.availableModels.map((model) => model.modelId === models.currentModelId ? { ...model, currentReasoningEffort: effort } : model) }) }
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
  const paste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => { const files = [...event.clipboardData.files]; if (!files.length) return; event.preventDefault(); if (caps.promptCapabilities.image !== true) { setNotice('目前 GROK ACP 未宣告圖片支援；請先把圖片存檔，再用迴紋針加入絕對路徑。'); return } void Promise.all(files.map((file) => new Promise<PromptBlock>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve({ type: 'image', data: String(reader.result).split(',')[1], mimeType: file.type || 'image/png', name: file.name }); reader.readAsDataURL(file) }))).then((blocks) => setAttachments((current) => [...current, ...blocks])) }

  const activeModel = models?.availableModels.find((model) => model.modelId === models.currentModelId)
  const usageTotal = usage?.contextWindowTokens ?? activeModel?.totalContextTokens
  const usagePercent = usage?.contextWindowUsage ?? (usage?.contextTokensUsed !== undefined && usageTotal ? Math.round((usage.contextTokensUsed / usageTotal) * 100) : undefined)
  const usageLevel = usagePercent === undefined ? '' : usagePercent >= 85 ? 'danger' : usagePercent >= 60 ? 'warn' : ''

  const effectiveImmersion = settings.theme === 'light' ? 'focus' : settings.immersion
  const paletteCommands: PaletteCommand[] = [
    { id: 'new-session', label: '建立新對話', description: '選擇專案資料夾並啟動 Grok', keywords: 'new session 專案 資料夾', shortcut: 'Ctrl N', onRun: () => { void createSession() } },
    { id: 'search-transcript', label: '搜尋目前對話', description: '在已載入的訊息中找文字', keywords: 'find search transcript 尋找', shortcut: 'Ctrl F', onRun: () => { setSearchOpen(true); window.setTimeout(() => transcriptSearchRef.current?.focus(), 0) } },
    ...caps.commands.map((command): PaletteCommand => ({ id: `slash:${command.name}`, label: `/${command.name}`, description: command.description, keywords: `${command.name} slash command`, onRun: () => { if (active) setDrafts((current) => ({ ...current, [active.id]: `/${command.name} ` })) } }))
  ]

  return <div className="app" data-theme={settings.theme} data-immersion={effectiveImmersion} data-cursor={settings.effects.cursor && !settings.effects.reducedMotion ? 'true' : undefined} data-fx-off={settings.effects.reducedMotion ? 'true' : undefined} style={{ '--font-size': `${settings.fontSize}px`, '--line-height': settings.lineHeight, '--content-width': `${settings.contentWidth}px` } as React.CSSProperties}>
    <StarfieldCanvas enabled={settings.effects.galaxy} theme={settings.theme} density={settings.effects.density} reducedMotion={settings.effects.reducedMotion} running={running} connected={status.connected} errorPulse={errorPulse} />
    <CursorFX enabled={settings.effects.cursor} reducedMotion={settings.effects.reducedMotion} />
    <header className="titlebar"><div className="brand-mark"><span>G</span></div><strong>GROK BUILD</strong><i>DESKTOP WORKBENCH</i><div className="drag-region" />
      <QuotaRings billing={billing} unavailable={billingUnavailable} />
      {active && <div className="usage-pill" title={`Context 額度${usage?.turnCount !== undefined ? ` · ${usage.turnCount} 回合` : ''}${usage?.toolCallCount !== undefined ? ` · ${usage.toolCallCount} 次工具` : ''} · 訂閱用量請至 grok.com 查看`}><Gauge /><span>{usagePercent !== undefined ? `${usagePercent}%` : '—'}</span><div className="usage-bar"><i className={usageLevel} style={{ width: `${Math.min(100, usagePercent ?? 0)}%` }} /></div><em>{formatTokens(usage?.contextTokensUsed)} / {formatTokens(usageTotal)}</em></div>}
      <button className={`status-pill ${status.connected ? 'online' : ''}`} onClick={() => void connect()}><span />{status.found ? `Grok ${status.version ?? ''}` : 'CLI not found'} · {status.connected ? 'Connected' : 'Connect'}</button></header>
    <div className={`workspace ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sidebar-actions"><button className="primary" data-magnetic data-nova-tone="primary" onClick={() => void createSession()}><FilePlus2 />新 Session</button><button className="icon-button" aria-label="收合側欄" onClick={() => setSidebarOpen(false)}><PanelLeftClose /></button></div>
        <label className="searchbox"><Search /><input ref={sessionSearchRef} placeholder="搜尋 sessions  Ctrl K" value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} /></label>
        <div className="session-caption"><span>RECENT SESSIONS</span><em>{filteredSessions.length}</em></div>
        <nav className="session-list">{sessionGroups.map((group) => <section className="session-group" key={group.cwd}><header><span>{group.name}</span><em>{group.sessions.length}</em></header>{group.sessions.map((session) => { const title = sessionDisplayTitle(session, settings.sessionTitles); return <div key={session.id} className={`session-row ${active?.id === session.id ? 'active' : ''} ${collapsingSessionId === session.id ? 'collapsing' : ''}`}>
          <button className="session-open" onClick={() => void loadSession(session)}><span className="session-dot" /><div><strong>{title}</strong><small>{session.cwd}</small><time>{formatDate(session.updatedAt)}</time></div></button>
          <button className="session-rename" title="重新命名" aria-label={`重新命名 ${title}`} onClick={() => { setRenameTarget(session); setRenameDraft(title) }}><Pencil /></button>
          <button className="session-delete" data-nova-tone="danger" title="刪除對話" aria-label={`刪除對話 ${title}`} onClick={() => setDeleteTarget(session)}><Trash2 /></button>
        </div>})}</section>)}</nav>
        <div className="sidebar-footer"><button onClick={() => setPanel('features')}><Gauge />功能矩陣</button><button onClick={() => setPanel('settings')}><Settings />設定</button></div>
      </aside>
      <main className="main">
        {!active ? <section className="empty-state"><div className="empty-orbit"><Cpu /><span /></div><span className="eyebrow">WINDOWS GROK BUILD CONTROL CENTER</span><h1>選一個專案資料夾，<br/><em>就可以開始。</em></h1><p>不用輸入終端指令。這裡會替你連接本機 Grok、保留未送出的文字，並在執行前顯示權限確認。</p><div className="onboarding-steps"><span><b>1</b>按「選擇專案開始」</span><span><b>2</b>選擇你的工作資料夾</span><span><b>3</b>用白話交代任務</span></div><div><button className="primary large" data-magnetic data-nova-tone="primary" onClick={() => void createSession()}><FolderOpen />選擇專案開始</button><button className="secondary large" onClick={() => void connect()}><Play />{status.found ? '連接本機 Grok' : '重新檢查 Grok 安裝'}</button></div><div className="empty-stats"><span><b>{sessions.length}</b>個本機對話</span><span><b>{status.version ?? '—'}</b>Grok CLI 版本</span><span><b>ACP</b>不模擬終端</span></div></section> : <>
          <header className="session-header">{!sidebarOpen && <button className="icon-button" aria-label="展開側欄" onClick={() => setSidebarOpen(true)}><Archive /></button>}<div><span className="eyebrow">ACTIVE SESSION</span><h1>{sessionDisplayTitle(active, settings.sessionTitles)}</h1><p>{active.cwd}</p></div><div className="session-tools">{models && <ModelPicker models={models} onModelChange={(modelId) => void changeModel(modelId)} onEffortChange={(effort) => void changeEffort(effort)} />}{caps.modes.length > 0 && <select aria-label="Mode" value={caps.currentModeId ?? ''} onChange={(event) => { if (event.target.value) void window.grokApi.setMode(active.id, event.target.value) }}><option value="" disabled>Mode</option>{caps.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select>}<button className="icon-button" title="搜尋" onClick={() => setSearchOpen(!searchOpen)}><Search /></button><button className="icon-button" title="匯出" onClick={() => void window.grokApi.exportSession(active.id)}><Archive /></button><button className="icon-button" title="在 TUI 開啟" onClick={() => void window.grokApi.openTui(active.cwd)}><TerminalSquare /></button><button className="icon-button" title="命令" onClick={() => setPanel('commands')}><Command /></button></div></header>
          {searchOpen && <div className="transcript-search"><Search /><input ref={transcriptSearchRef} value={transcriptQuery} onChange={(event) => setTranscriptQuery(event.target.value)} placeholder="搜尋目前對話…" /><span>{activeEvents.filter((event) => transcriptQuery && eventText(event).toLocaleLowerCase().includes(transcriptQuery.toLocaleLowerCase())).length} 筆</span><button onClick={() => { setSearchOpen(false); setTranscriptQuery('') }}><X /></button></div>}
          <section className="transcript"><Virtuoso ref={virtuoso} data={activeEvents} followOutput={followTail ? 'auto' : false} atBottomStateChange={(bottom) => { setFollowTail(bottom); if (bottom) setUnread(0) }} itemContent={(_index, event) => <div className="event-wrap"><EventCard event={event} query={transcriptQuery} /></div>} components={{ Footer: () => <div className="transcript-end">END OF CURRENT CONTEXT</div> }} />{!followTail && <button className="jump-latest" onClick={jumpToLatest}>跳到最新 {unread > 0 && <b>{unread}</b>}</button>}</section>
          <footer className="composer-wrap"><div className="composer-status">{running ? <><LoaderCircle className="spin" />Grok 正在執行工具或生成回覆</> : <><span className="ready-dot" />準備就緒</>}<span>Enter 傳送 · Shift Enter 換行 · Esc 取消</span></div>{attachments.length > 0 && <div className="attachment-row">{attachments.map((item, index) => <span key={index}><Paperclip />{'name' in item ? item.name : 'Attachment'}<button aria-label={`移除附件 ${'name' in item ? item.name : index + 1}`} onClick={() => setAttachments((current) => current.filter((_item, i) => i !== index))}><X /></button></span>)}</div>}<div className="composer"><button className="attach-button" aria-label="加入檔案" onClick={() => void chooseFiles()}><Paperclip /></button><textarea value={drafts[active.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [active.id]: event.target.value }))} onKeyDown={composerKey} onPaste={paste} placeholder="交給 Grok 一個任務，或貼上圖片與檔案路徑…" rows={3} />{running ? <button className="stop-button" data-nova-tone="danger" onClick={() => void window.grokApi.cancel(active.id)}><Square />停止</button> : <button className="send-button" data-magnetic data-nova-tone="primary" onClick={() => void sendPrompt()}><Send />送出</button>}</div></footer>
        </>}
      </main>
      {panel === 'settings' && <SettingsPanel settings={settings} onClose={() => setPanel('none')} onSave={(next) => void window.grokApi.saveSettings(next).then((saved) => { setSettings(saved); setPanel('none') })} />}
      {panel === 'features' && <aside className="drawer"><div className="drawer-head"><div><span className="eyebrow">CAPABILITY ROUTER</span><h2>功能矩陣</h2></div><button className="icon-button" onClick={() => setPanel('none')}><X /></button></div><p className="drawer-intro">有結構化 ACP 介面才在 GUI 原生操作；其餘明確回到 TUI，不模擬終端按鍵。</p><div className="feature-list">{FEATURES.map(([name, route, state]) => <div key={name}><span className={state}>{state === 'native' ? <Check /> : state === 'conditional' ? <Cpu /> : <TerminalSquare />}</span><strong>{name}</strong><small>{route}</small></div>)}</div>{active && <button className="secondary wide" onClick={() => void window.grokApi.openTui(active.cwd)}><TerminalSquare />在 GROK TUI 開啟</button>}</aside>}
    </div>
    {panel === 'commands' && <CommandPalette commands={paletteCommands} recentIds={settings.recentCommands} onUse={rememberCommand} onClose={() => setPanel('none')} />}
    {panel === 'shortcuts' && <div className="modal-backdrop"><section className="shortcut-overlay" role="dialog" aria-modal="true" aria-label="快捷鍵一覽"><header><div><span className="eyebrow">KEYBOARD HELP</span><h2>快捷鍵一覽</h2></div><button className="icon-button" aria-label="關閉快捷鍵" onClick={() => setPanel('none')}><X /></button></header><div>{[
      ['Ctrl + N', '建立新對話'], ['Ctrl + K', '搜尋本機對話'], ['Ctrl + F', '搜尋目前內容'], ['Ctrl + Shift + P', '開啟命令面板'], ['Ctrl + End', '跳到最新訊息'], ['Esc', '取消執行或關閉視窗'], ['?', '顯示這張說明']
    ].map(([keys, action]) => <p key={keys}><kbd>{keys}</kbd><span>{action}</span></p>)}</div><footer><Keyboard />在輸入框內按「?」會正常輸入文字，不會打開這張卡片。</footer></section></div>}
    {permission && <div className="modal-backdrop"><section className="permission-modal"><div className="permission-icon"><Wrench /></div><span className="eyebrow">ACTION REQUIRES APPROVAL{permissions.length > 1 ? ` · 還有 ${permissions.length - 1} 項待決` : ''}</span><h2>{permission.title}</h2><p>Grok 要求執行一項可能修改檔案或呼叫外部工具的操作。只可選擇代理提供的合法選項。</p><div>{permission.options.map((option) => <button key={option.optionId} className={option.kind.includes('reject') ? 'danger-option' : ''} onClick={() => void window.grokApi.respondPermission(permission.requestId, option.optionId).catch((error) => setNotice(error instanceof Error ? error.message : String(error))).then(() => setPermissions((current) => current.filter((item) => item.requestId !== permission.requestId)))}>{option.kind.includes('reject') ? <X /> : <Check />}<span><strong>{option.name}</strong><small>{option.kind}</small></span></button>)}</div></section></div>}
    {deleteTarget && <div className="modal-backdrop"><section className="permission-modal"><div className="permission-icon danger"><Trash2 /></div><span className="eyebrow">DELETE SESSION</span><h2>刪除這則對話？</h2><p>「{deleteTarget.title}」（{deleteTarget.cwd}）將從本機 session 歷史永久刪除，無法復原。</p><div><button className="danger-option" onClick={() => void deleteSession()}><Trash2 /><span><strong>永久刪除</strong><small>grok sessions delete</small></span></button><button onClick={() => setDeleteTarget(null)}><X /><span><strong>取消</strong><small>保留這則對話</small></span></button></div></section></div>}
    {renameTarget && <div className="modal-backdrop"><section className="permission-modal rename-modal" role="dialog" aria-modal="true" aria-label="重新命名對話"><div className="permission-icon"><Pencil /></div><span className="eyebrow">LOCAL TITLE</span><h2>替這則對話取一個好找的名稱</h2><p>只改這台電腦上的顯示名稱，不會修改 Grok CLI 的原始紀錄。</p><label>對話名稱<input aria-label="對話名稱" autoFocus value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveSessionTitle(); if (event.key === 'Escape') setRenameTarget(null) }} /></label><div><button onClick={() => void saveSessionTitle()}><Check /><span><strong>儲存名稱</strong><small>保存在本機設定</small></span></button><button onClick={() => setRenameTarget(null)}><X /><span><strong>取消</strong></span></button></div></section></div>}
    {notice && <button className="notice" onClick={() => setNotice('')}><Zap />{notice}<X /></button>}
  </div>
}
