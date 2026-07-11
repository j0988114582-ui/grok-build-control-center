import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import {
  Activity, Archive, Bot, Check, ChevronDown, ChevronRight, CircleAlert, Command, Cpu, FilePlus2,
  FolderOpen, Gauge, ListTodo, LoaderCircle, Moon, Paperclip, PanelLeftClose, Play, Search, Send,
  Settings, Square, Sun, TerminalSquare, UserRound, Wrench, X, Zap
} from 'lucide-react'
import type { SelectedFile } from '../../shared/bridge'
import { createDefaultSettings } from '../../shared/settings'
import { selectedFilesToPrompt } from '../../shared/attachments'
import { findShortcutConflicts } from '../../shared/shortcuts'
import { sessionReducer } from '../../shared/session-state'
import type {
  AgentCapabilities, AppSettings, CliStatus, ModelState, PermissionRequest, PromptBlock, SessionSummary, UiSessionEvent
} from '../../shared/types'

const EMPTY_CAPS: AgentCapabilities = { loadSession: false, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [] }
const emptyStatus: CliStatus = { executable: '', found: false, connected: false }
type Panel = 'none' | 'settings' | 'features' | 'commands'

const formatDate = (value?: string): string => value ? new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : ''
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
    code: ({ children: code }) => <code>{code}</code>
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
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [active, setActive] = useState<SessionSummary | null>(null)
  const [events, setEvents] = useState<Record<string, UiSessionEvent[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [attachments, setAttachments] = useState<PromptBlock[]>([])
  const [sessionQuery, setSessionQuery] = useState('')
  const [transcriptQuery, setTranscriptQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>('none')
  const [permission, setPermission] = useState<PermissionRequest | null>(null)
  const [running, setRunning] = useState(false)
  const [followTail, setFollowTail] = useState(true)
  const [unread, setUnread] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const virtuoso = useRef<VirtuosoHandle>(null)
  const sessionSearchRef = useRef<HTMLInputElement>(null)
  const transcriptSearchRef = useRef<HTMLInputElement>(null)
  const createSessionRef = useRef<() => void>(() => {})
  const jumpToLatestRef = useRef<() => void>(() => {})

  useEffect(() => {
    void Promise.all([window.grokApi.getStatus(), window.grokApi.listSessions(), window.grokApi.getSettings()]).then(([nextStatus, nextSessions, nextSettings]) => { setStatus(nextStatus); setSessions(nextSessions); setSettings(nextSettings) })
    const offEvent = window.grokApi.onEvent((event) => {
      setEvents((current) => {
        const previous = current[event.sessionId] ?? []
        const next = sessionReducer({ sessionId: event.sessionId, events: previous, running: false, followTail: true, unread: 0 }, { type: 'event', event })
        return { ...current, [event.sessionId]: next.events }
      })
      if (event.kind === 'commands') setCaps((current) => ({ ...current, commands: event.commands }))
      if (event.kind === 'mode') setCaps((current) => ({ ...current, currentModeId: event.modeId }))
      if (event.kind === 'turn') setRunning(event.status === 'running')
      if (!followTail) setUnread((value) => value + 1)
    })
    const offPermission = window.grokApi.onPermission(setPermission)
    const offStatus = window.grokApi.onStatus((next) => { setStatus((current) => ({ ...current, ...next })); if (next.message) setNotice(next.message) })
    return () => { offEvent(); offPermission(); offStatus() }
  }, [followTail])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setSearchOpen(true); setTimeout(() => transcriptSearchRef.current?.focus(), 0) }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); setPanel('commands') }
      if (event.ctrlKey && event.key.toLowerCase() === 'k') { event.preventDefault(); sessionSearchRef.current?.focus() }
      if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); createSessionRef.current() }
      if (event.key === 'Escape') { if (running && active) void window.grokApi.cancel(active.id); else setPanel('none') }
      if (event.ctrlKey && event.key === 'End') jumpToLatestRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [running, active])

  const activeEvents = active ? events[active.id] ?? [] : []
  const filteredSessions = useMemo(() => sessions.filter((session) => `${session.title} ${session.cwd}`.toLocaleLowerCase().includes(sessionQuery.toLocaleLowerCase())), [sessions, sessionQuery])
  const connect = async (): Promise<void> => { setNotice('正在連接 Grok ACP…'); try { const value = await window.grokApi.connect(); setCaps(value); setStatus((current) => ({ ...current, connected: true })); setNotice('ACP 已連線') } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) } }
  const createSession = async (): Promise<void> => { const cwd = await window.grokApi.chooseDirectory(); if (!cwd) return; await connect(); const response = await window.grokApi.createSession(cwd); if (!response.sessionId) return; setModels(response.models); const summary = { id: response.sessionId, cwd, title: 'New session', updatedAt: new Date().toISOString() }; setSessions((current) => [summary, ...current]); setActive(summary) }
  const loadSession = async (session: SessionSummary): Promise<void> => { setActive(session); setEvents((current) => ({ ...current, [session.id]: [] })); await connect(); try { const response = await window.grokApi.loadSession(session.id, session.cwd); setModels(response.models) } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) } }
  const sendPrompt = async (): Promise<void> => { if (!active || running) return; const text = drafts[active.id]?.trim(); if (!text && !attachments.length) return; const blocks: PromptBlock[] = [...(text ? [{ type: 'text' as const, text }] : []), ...attachments]; setDrafts((current) => ({ ...current, [active.id]: '' })); setAttachments([]); void window.grokApi.sendPrompt(active.id, blocks).catch((error) => setNotice(error instanceof Error ? error.message : String(error))) }
  const chooseFiles = async (): Promise<void> => { const files = await window.grokApi.chooseFiles(); addSelectedFiles(files) }
  const addSelectedFiles = (files: SelectedFile[]): void => { if (!active) return; const { blocks, paths } = selectedFilesToPrompt(files, caps.promptCapabilities.image === true); setAttachments((current) => [...current, ...blocks]); if (paths) setDrafts((current) => ({ ...current, [active.id]: `${current[active.id] ?? ''}${current[active.id] ? '\n' : ''}${paths}` })) }
  const jumpToLatest = (): void => { virtuoso.current?.scrollToIndex({ index: Math.max(0, activeEvents.length - 1), align: 'end', behavior: 'smooth' }); setFollowTail(true); setUnread(0) }
  createSessionRef.current = () => { void createSession() }
  jumpToLatestRef.current = jumpToLatest
  const composerKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendPrompt() } }
  const changeModel = async (modelId: string): Promise<void> => { if (!active || !models) return; const model = models.availableModels.find((item) => item.modelId === modelId); await window.grokApi.setModel(active.id, modelId, model?.currentReasoningEffort); setModels({ ...models, currentModelId: modelId }) }
  const changeEffort = async (effort: string): Promise<void> => { if (!active || !models) return; await window.grokApi.setModel(active.id, models.currentModelId, effort); setModels({ ...models, availableModels: models.availableModels.map((model) => model.modelId === models.currentModelId ? { ...model, currentReasoningEffort: effort } : model) }) }
  const paste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => { const files = [...event.clipboardData.files]; if (!files.length) return; event.preventDefault(); if (caps.promptCapabilities.image !== true) { setNotice('目前 GROK ACP 未宣告圖片支援；請先把圖片存檔，再用迴紋針加入絕對路徑。'); return } void Promise.all(files.map((file) => new Promise<PromptBlock>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve({ type: 'image', data: String(reader.result).split(',')[1], mimeType: file.type || 'image/png', name: file.name }); reader.readAsDataURL(file) }))).then((blocks) => setAttachments((current) => [...current, ...blocks])) }

  return <div className="app" data-theme={settings.theme} style={{ '--font-size': `${settings.fontSize}px`, '--line-height': settings.lineHeight, '--content-width': `${settings.contentWidth}px` } as React.CSSProperties}>
    <header className="titlebar"><div className="brand-mark"><span>G</span></div><strong>GROK BUILD</strong><i>DESKTOP WORKBENCH</i><div className="drag-region" /><button className={`status-pill ${status.connected ? 'online' : ''}`} onClick={() => void connect()}><span />{status.found ? `Grok ${status.version ?? ''}` : 'CLI not found'} · {status.connected ? 'Connected' : 'Connect'}</button></header>
    <div className={`workspace ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sidebar-actions"><button className="primary" onClick={() => void createSession()}><FilePlus2 />新 Session</button><button className="icon-button" onClick={() => setSidebarOpen(false)}><PanelLeftClose /></button></div>
        <label className="searchbox"><Search /><input ref={sessionSearchRef} placeholder="搜尋 sessions  Ctrl K" value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} /></label>
        <div className="session-caption"><span>RECENT SESSIONS</span><em>{filteredSessions.length}</em></div>
        <nav className="session-list">{filteredSessions.map((session) => <button key={session.id} className={active?.id === session.id ? 'active' : ''} onClick={() => void loadSession(session)}><span className="session-dot" /><div><strong>{session.title}</strong><small>{session.cwd}</small><time>{formatDate(session.updatedAt)}</time></div></button>)}</nav>
        <div className="sidebar-footer"><button onClick={() => setPanel('features')}><Gauge />功能矩陣</button><button onClick={() => setPanel('settings')}><Settings />設定</button></div>
      </aside>
      <main className="main">
        {!active ? <section className="empty-state"><div className="empty-orbit"><Cpu /><span /></div><span className="eyebrow">STRUCTURED ACP CLIENT</span><h1>讓終端退到<br/><em>它該在的位置。</em></h1><p>保留 Grok Build 的代理能力，換成真正適合閱讀、搜尋與長時間工作的桌面介面。</p><div><button className="primary large" onClick={() => void createSession()}><FolderOpen />選擇專案開始</button><button className="secondary large" onClick={() => void connect()}><Play />連接本機 Grok</button></div><div className="empty-stats"><span><b>{sessions.length}</b>Sessions indexed</span><span><b>{status.version ?? '—'}</b>CLI version</span><span><b>ACP</b>No terminal emulation</span></div></section> : <>
          <header className="session-header">{!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)}><Archive /></button>}<div><span className="eyebrow">ACTIVE SESSION</span><h1>{active.title}</h1><p>{active.cwd}</p></div><div className="session-tools">{models && <select aria-label="Model" value={models.currentModelId} onChange={(event) => void changeModel(event.target.value)}>{models.availableModels.map((model) => <option key={model.modelId} value={model.modelId}>{model.name}</option>)}</select>}{models?.availableModels.find((model) => model.modelId === models.currentModelId)?.reasoningEfforts.length ? <select aria-label="Reasoning effort" value={models.availableModels.find((model) => model.modelId === models.currentModelId)?.currentReasoningEffort} onChange={(event) => void changeEffort(event.target.value)}>{models.availableModels.find((model) => model.modelId === models.currentModelId)?.reasoningEfforts.map((effort) => <option key={effort.id} value={effort.value}>{effort.label}</option>)}</select> : null}{caps.modes.length > 0 && <select onChange={(event) => void window.grokApi.setMode(active.id, event.target.value)}><option>Mode</option>{caps.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select>}<button className="icon-button" title="搜尋" onClick={() => setSearchOpen(!searchOpen)}><Search /></button><button className="icon-button" title="匯出" onClick={() => void window.grokApi.exportSession(active.id)}><Archive /></button><button className="icon-button" title="在 TUI 開啟" onClick={() => void window.grokApi.openTui(active.cwd)}><TerminalSquare /></button><button className="icon-button" title="命令" onClick={() => setPanel('commands')}><Command /></button></div></header>
          {searchOpen && <div className="transcript-search"><Search /><input ref={transcriptSearchRef} value={transcriptQuery} onChange={(event) => setTranscriptQuery(event.target.value)} placeholder="搜尋目前對話…" /><span>{activeEvents.filter((event) => transcriptQuery && eventText(event).toLocaleLowerCase().includes(transcriptQuery.toLocaleLowerCase())).length} 筆</span><button onClick={() => { setSearchOpen(false); setTranscriptQuery('') }}><X /></button></div>}
          <section className="transcript"><Virtuoso ref={virtuoso} data={activeEvents} followOutput={followTail ? 'auto' : false} atBottomStateChange={(bottom) => { setFollowTail(bottom); if (bottom) setUnread(0) }} itemContent={(_index, event) => <div className="event-wrap"><EventCard event={event} query={transcriptQuery} /></div>} components={{ Footer: () => <div className="transcript-end">END OF CURRENT CONTEXT</div> }} />{!followTail && <button className="jump-latest" onClick={jumpToLatest}>跳到最新 {unread > 0 && <b>{unread}</b>}</button>}</section>
          <footer className="composer-wrap"><div className="composer-status">{running ? <><LoaderCircle className="spin" />Grok 正在執行工具或生成回覆</> : <><span className="ready-dot" />準備就緒</>}<span>Enter 傳送 · Shift Enter 換行 · Esc 取消</span></div>{attachments.length > 0 && <div className="attachment-row">{attachments.map((item, index) => <span key={index}><Paperclip />{'name' in item ? item.name : 'Attachment'}<button onClick={() => setAttachments((current) => current.filter((_item, i) => i !== index))}><X /></button></span>)}</div>}<div className="composer"><button className="attach-button" onClick={() => void chooseFiles()}><Paperclip /></button><textarea value={drafts[active.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [active.id]: event.target.value }))} onKeyDown={composerKey} onPaste={paste} placeholder="交給 Grok 一個任務，或貼上圖片與檔案路徑…" rows={3} />{running ? <button className="stop-button" onClick={() => void window.grokApi.cancel(active.id)}><Square />停止</button> : <button className="send-button" onClick={() => void sendPrompt()}><Send />送出</button>}</div></footer>
        </>}
      </main>
      {panel === 'settings' && <SettingsPanel settings={settings} onClose={() => setPanel('none')} onSave={(next) => void window.grokApi.saveSettings(next).then((saved) => { setSettings(saved); setPanel('none') })} />}
      {panel === 'features' && <aside className="drawer"><div className="drawer-head"><div><span className="eyebrow">CAPABILITY ROUTER</span><h2>功能矩陣</h2></div><button className="icon-button" onClick={() => setPanel('none')}><X /></button></div><p className="drawer-intro">有結構化 ACP 介面才在 GUI 原生操作；其餘明確回到 TUI，不模擬終端按鍵。</p><div className="feature-list">{FEATURES.map(([name, route, state]) => <div key={name}><span className={state}>{state === 'native' ? <Check /> : state === 'conditional' ? <Cpu /> : <TerminalSquare />}</span><strong>{name}</strong><small>{route}</small></div>)}</div>{active && <button className="secondary wide" onClick={() => void window.grokApi.openTui(active.cwd)}><TerminalSquare />在 GROK TUI 開啟</button>}</aside>}
      {panel === 'commands' && <aside className="drawer command-drawer"><div className="drawer-head"><div><span className="eyebrow">COMMAND PALETTE</span><h2>命令</h2></div><button className="icon-button" onClick={() => setPanel('none')}><X /></button></div><button onClick={() => void createSession()}><FilePlus2 />New session<kbd>Ctrl N</kbd></button><button onClick={() => { setSearchOpen(true); setPanel('none') }}><Search />Search transcript<kbd>Ctrl F</kbd></button>{caps.commands.map((command) => <button key={command.name} onClick={() => active && setDrafts((current) => ({ ...current, [active.id]: `/${command.name} ` }))}><Command />/{command.name}<small>{command.description}</small></button>)}</aside>}
    </div>
    {permission && <div className="modal-backdrop"><section className="permission-modal"><div className="permission-icon"><Wrench /></div><span className="eyebrow">ACTION REQUIRES APPROVAL</span><h2>{permission.title}</h2><p>Grok 要求執行一項可能修改檔案或呼叫外部工具的操作。只可選擇代理提供的合法選項。</p><div>{permission.options.map((option) => <button key={option.optionId} className={option.kind.includes('reject') ? 'danger-option' : ''} onClick={() => void window.grokApi.respondPermission(permission.requestId, option.optionId).then(() => setPermission(null))}>{option.kind.includes('reject') ? <X /> : <Check />}<span><strong>{option.name}</strong><small>{option.kind}</small></span></button>)}</div></section></div>}
    {notice && <button className="notice" onClick={() => setNotice('')}><Zap />{notice}<X /></button>}
  </div>
}
