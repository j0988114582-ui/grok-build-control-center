// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/src/App'
import { createDefaultSettings } from '../src/shared/settings'
import type { GrokBridgeApi } from '../src/shared/bridge'

const createApiMock = (): GrokBridgeApi => ({
  getStatus: vi.fn().mockResolvedValue({ executable: 'C:\\Users\\demo\\.grok\\bin\\grok.exe', found: true, version: '0.2.93', connected: false }),
  installCli: vi.fn().mockResolvedValue({ executable: 'C:\\Users\\demo\\.grok\\bin\\grok.exe', found: true, version: '0.2.93', connected: false }),
  reauthenticate: vi.fn().mockResolvedValue({ loadSession: true, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [] }),
  connect: vi.fn().mockResolvedValue({
    loadSession: true, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [{ name: 'compact', description: '壓縮目前 context' }],
    modelState: {
      currentModelId: 'grok-4.5',
      availableModels: [
        { modelId: 'grok-4.5', name: 'Grok 4.5', totalContextTokens: 500000, currentReasoningEffort: 'high', reasoningEfforts: [{ id: 'high', value: 'high', label: 'High Effort', default: true }] },
        { modelId: 'grok-composer-2.5-fast', name: 'Composer 2.5', totalContextTokens: 200000, reasoningEfforts: [] }
      ]
    }
  }),
  listSessions: vi.fn().mockResolvedValue([{ id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: '2026-07-11T00:00:00Z' }]),
  getSettings: vi.fn().mockResolvedValue(createDefaultSettings('C:\\Users\\demo')),
  saveSettings: vi.fn().mockImplementation(async (settings) => settings), createSession: vi.fn(), sendPrompt: vi.fn(), cancel: vi.fn(), setMode: vi.fn(), setModel: vi.fn(), setConfigOption: vi.fn(),
  loadSession: vi.fn().mockResolvedValue({ sessionId: 's1' }),
  deleteSession: vi.fn().mockResolvedValue(true),
  getUsage: vi.fn().mockResolvedValue({ sessionId: 's1', contextTokensUsed: 186783, contextWindowTokens: 500000, contextWindowUsage: 37, turnCount: 7 }),
  getBilling: vi.fn().mockResolvedValue({
    creditUsagePercent: 79,
    billingPeriodEnd: '2026-07-17T02:38:18Z',
    productUsage: [{ product: 'GrokBuild', usagePercent: 50 }]
  }),
  respondPermission: vi.fn(), chooseDirectory: vi.fn(), chooseFiles: vi.fn(), exportSession: vi.fn(), openTui: vi.fn(), openExternal: vi.fn(),
  onEvent: vi.fn().mockReturnValue(() => {}), onPermission: vi.fn().mockReturnValue(() => {}), onStatus: vi.fn().mockReturnValue(() => {})
} as unknown as GrokBridgeApi)

describe('App', () => {
  afterEach(cleanup)

  it('shows CLI status and existing sessions without a terminal surface', async () => {
    window.grokApi = createApiMock()
    render(<App />)
    expect(await screen.findByText('Fix tests')).toBeInTheDocument()
    expect(screen.getByText(/Grok 0.2.93/)).toBeInTheDocument()
    expect(screen.queryByText('Terminal')).not.toBeInTheDocument()
  })

  it('requires confirmation before installing the official Grok CLI and then offers browser sign-in', async () => {
    const api = createApiMock()
    api.getStatus = vi.fn().mockResolvedValue({ executable: 'C:\\Users\\newbie\\.grok\\bin\\grok.exe', found: false, connected: false })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '安裝 Grok CLI' }))
    expect(screen.getByRole('dialog', { name: '安裝 Grok CLI' })).toBeInTheDocument()
    expect(screen.getByText('https://x.ai/cli/install.ps1')).toBeInTheDocument()
    expect(api.installCli).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '確認安裝 Grok CLI' }))
    await waitFor(() => expect(api.installCli).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('dialog', { name: '登入 Grok 帳號' })).toBeInTheDocument()
  })

  it('keeps the install confirmation available when setup fails', async () => {
    const api = createApiMock()
    api.getStatus = vi.fn().mockResolvedValue({ executable: 'C:\\Users\\newbie\\.grok\\bin\\grok.exe', found: false, connected: false })
    api.installCli = vi.fn().mockRejectedValue(new Error('網路中斷，請稍後再試'))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '安裝 Grok CLI' }))
    await user.click(screen.getByRole('button', { name: '確認安裝 Grok CLI' }))

    expect(await screen.findByText('網路中斷，請稍後再試')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '安裝 Grok CLI' })).toBeInTheDocument()
  })

  it('switches the active account only after confirmation', async () => {
    const api = createApiMock()
    api.reauthenticate = vi.fn().mockResolvedValue({
      loadSession: true, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [],
      modelState: { currentModelId: 'grok-4.5', availableModels: [] }
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '切換 Grok 帳號' }))
    expect(screen.getByRole('dialog', { name: '登入 Grok 帳號' })).toBeInTheDocument()
    expect(api.reauthenticate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '開啟瀏覽器並重新登入' }))
    await waitFor(() => expect(api.reauthenticate).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Grok 帳號已重新登入')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '登入 Grok 帳號' })).not.toBeInTheDocument()
  })

  it('blocks account switching while the active Grok turn is running', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    act(() => { onEvent?.({ id: 'turn-running', sessionId: 's1', kind: 'turn', status: 'running' }) })

    expect(screen.getByRole('button', { name: '切換 Grok 帳號' })).toBeDisabled()
  })

  it('restores focus to the account button after cancelling its setup dialog', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)

    const accountButton = await screen.findByRole('button', { name: '切換 Grok 帳號' })
    await user.click(accountButton)
    await user.click(screen.getByRole('button', { name: /取消/ }))

    expect(accountButton).toHaveFocus()
  })

  it('disables session entry points while browser account authentication is pending', async () => {
    const api = createApiMock()
    api.reauthenticate = vi.fn(() => new Promise<never>(() => {}))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '切換 Grok 帳號' }))
    await user.click(screen.getByRole('button', { name: '開啟瀏覽器並重新登入' }))

    expect(screen.getByRole('button', { name: /新 Session/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Grok 0\.2\.93/ })).toBeDisabled()
  })

  it('deletes a session after the in-app confirmation', async () => {
    const api = createApiMock()
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Fix tests')
    await user.click(screen.getByRole('button', { name: '刪除對話 Fix tests' }))
    expect(screen.getByText('刪除這則對話？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /永久刪除/ }))
    expect(api.deleteSession).toHaveBeenCalledWith('s1')
    expect(screen.getByText('Fix tests').closest('.session-row')).toHaveClass('collapsing')
    await waitFor(() => expect(screen.queryByText('Fix tests')).not.toBeInTheDocument())
  })

  it('shows the context quota bar and the full model picker for a loaded session', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Fix tests'))
    expect(await screen.findByText('37%')).toBeInTheDocument()
    expect(screen.getByText(/186.8k \/ 500k|187k \/ 500k/)).toBeInTheDocument()
    const modelPicker = await screen.findByRole('button', { name: '模型：Grok 4.5' })
    await user.click(modelPicker)
    expect(screen.getByRole('option', { name: /Composer 2.5/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'High Effort' })).toHaveAttribute('aria-checked', 'true')
  })

  it('loads real weekly subscription billing after ACP connects', async () => {
    const api = createApiMock()
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))

    expect(await screen.findByLabelText('總額度已使用 79%')).toBeInTheDocument()
    expect(screen.getByLabelText('Build 已使用 50%')).toBeInTheDocument()
    expect(screen.getByText(/7\/17 重置/)).toBeInTheDocument()
    expect(api.getBilling).toHaveBeenCalled()
  })

  it('mounts cursor decoration only when the saved accessibility settings allow it', async () => {
    const api = createApiMock()
    window.grokApi = api
    const first = render(<App />)

    expect(await screen.findByTestId('cursor-fx')).toBeInTheDocument()
    first.unmount()

    const reduced = createDefaultSettings('C:\\Users\\demo')
    reduced.effects.reducedMotion = true
    api.getSettings = vi.fn().mockResolvedValue(reduced)
    render(<App />)
    await screen.findByText('Fix tests')
    expect(screen.queryByTestId('cursor-fx')).not.toBeInTheDocument()
  })

  it('restores and persists a session draft without losing unfinished text', async () => {
    const api = createApiMock()
    const saved = createDefaultSettings('C:\\Users\\demo')
    saved.drafts = { s1: '還沒送出的工作' }
    api.getSettings = vi.fn().mockResolvedValue(saved)
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/)
    expect(composer).toHaveValue('還沒送出的工作')
    await user.type(composer, '，繼續保留')

    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ drafts: { s1: '還沒送出的工作，繼續保留' } })), { timeout: 1500 })
  })

  it('renames a session locally and persists the title override', async () => {
    const api = createApiMock()
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    await user.click(screen.getByRole('button', { name: '重新命名 Fix tests' }))
    const name = screen.getByRole('textbox', { name: '對話名稱' })
    await user.clear(name)
    await user.type(name, '公開版準備')
    await user.click(screen.getByRole('button', { name: /^儲存名稱/ }))

    expect((await screen.findAllByText('公開版準備')).length).toBeGreaterThanOrEqual(2)
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ sessionTitles: { s1: '公開版準備' } }))
  })

  it('opens the searchable command palette and remembers the executed command', async () => {
    const api = createApiMock()
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}')
    const search = screen.getByRole('combobox', { name: '搜尋命令' })
    await user.type(search, 'compact')
    await user.keyboard('{Enter}')

    expect(screen.getByPlaceholderText(/交給 Grok 一個任務/)).toHaveValue('/compact ')
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ recentCommands: ['slash:compact'] }))
  })

  it('replaces stale commands and modes when a new connection explicitly reports empty lists', async () => {
    const api = createApiMock()
    api.connect = vi.fn()
      .mockResolvedValueOnce({
        loadSession: true,
        promptCapabilities: {},
        sessionCapabilities: {},
        commands: [{ name: 'legacy-command', description: 'old account command' }],
        modes: [{ id: 'legacy-mode', name: 'Old account mode' }],
        currentModeId: 'legacy-mode'
      })
      .mockResolvedValueOnce({
        loadSession: true,
        promptCapabilities: {},
        sessionCapabilities: {},
        commands: [],
        modes: []
      })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    expect(screen.getByRole('combobox', { name: 'Mode' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Grok 0\.2\.93.*Connected/ }))
    await user.click(screen.getByTitle('命令'))

    expect(screen.queryByText('/legacy-command')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Mode' })).not.toBeInTheDocument()
  })

  it('clears a stale mode when a session response explicitly reports an empty mode list', async () => {
    const api = createApiMock()
    api.connect = vi.fn().mockResolvedValue({
      loadSession: true,
      promptCapabilities: {},
      sessionCapabilities: {},
      commands: [],
      modes: [{ id: 'legacy-mode', name: 'Old account mode' }],
      currentModeId: 'legacy-mode'
    })
    api.chooseDirectory = vi.fn().mockResolvedValue('C:\\new-project')
    api.createSession = vi.fn().mockResolvedValue({ sessionId: 's2', modes: { availableModes: [] } })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: /新 Session/ }))
    expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Mode' })).not.toBeInTheDocument()
  })

  it('keeps rendering when a session summary has a corrupted timestamp', async () => {
    const api = createApiMock()
    api.listSessions = vi.fn().mockResolvedValue([{ id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: 'not-a-date' }])
    window.grokApi = api
    render(<App />)
    expect(await screen.findByText('Fix tests')).toBeInTheDocument()
  })

  it('clears the pending permission modal when its turn ends', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    let onPermission: ((request: Parameters<Parameters<GrokBridgeApi['onPermission']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.onPermission = vi.fn((callback) => { onPermission = callback; return () => {} })
    window.grokApi = api
    render(<App />)
    await screen.findByText('Fix tests')

    act(() => { onPermission?.({ requestId: 'p1', sessionId: 's1', title: '需要權限', options: [{ optionId: 'a', name: 'Allow', kind: 'allow_once' }] }) })
    expect(await screen.findByRole('dialog', { name: '需要權限' })).toBeInTheDocument()
    act(() => { onEvent?.({ id: 'e1', sessionId: 's1', kind: 'turn', status: 'completed' }) })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '需要權限' })).not.toBeInTheDocument())
  })

  it('focuses the safe reject option when a permission dialog opens', async () => {
    const api = createApiMock()
    let onPermission: ((request: Parameters<Parameters<GrokBridgeApi['onPermission']>[0]>[0]) => void) | undefined
    api.onPermission = vi.fn((callback) => { onPermission = callback; return () => {} })
    window.grokApi = api
    render(<App />)
    await screen.findByText('Fix tests')

    act(() => { onPermission?.({
      requestId: 'p-safe',
      sessionId: 's1',
      title: '允許修改檔案？',
      options: [
        { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject', name: 'Cancel', kind: 'reject_once' }
      ]
    }) })

    expect(await screen.findByRole('button', { name: /Cancel/ })).toHaveFocus()
    expect(screen.getByRole('button', { name: /Allow once/ })).not.toHaveFocus()
  })

  it('focuses the safe reject option when a queued permission replaces the current request', async () => {
    const api = createApiMock()
    let onPermission: ((request: Parameters<Parameters<GrokBridgeApi['onPermission']>[0]>[0]) => void) | undefined
    api.onPermission = vi.fn((callback) => { onPermission = callback; return () => {} })
    api.respondPermission = vi.fn().mockResolvedValue(undefined)
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Fix tests')

    act(() => {
      onPermission?.({ requestId: 'p-first', sessionId: 's1', title: '第一項權限', options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }] })
      onPermission?.({ requestId: 'p-second', sessionId: 's1', title: '第二項權限', options: [
        { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject', name: 'Cancel', kind: 'reject_once' }
      ] })
    })

    await user.click(await screen.findByRole('button', { name: /Allow once/ }))
    expect(await screen.findByRole('button', { name: /Cancel/ })).toHaveFocus()
  })

  it('restores focus after a permission dialog closes', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    let onPermission: ((request: Parameters<Parameters<GrokBridgeApi['onPermission']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.onPermission = vi.fn((callback) => { onPermission = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    const sessionSearch = await screen.findByPlaceholderText(/搜尋 sessions/)
    await user.click(sessionSearch)

    act(() => { onPermission?.({
      requestId: 'p-restore',
      sessionId: 's1',
      title: '需要權限',
      options: [{ optionId: 'reject', name: 'Cancel', kind: 'reject_once' }]
    }) })
    expect(await screen.findByRole('button', { name: /Cancel/ })).toHaveFocus()

    act(() => { onEvent?.({ id: 'turn-finished', sessionId: 's1', kind: 'turn', status: 'completed' }) })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '需要權限' })).not.toBeInTheDocument())
    expect(sessionSearch).toHaveFocus()
  })

  it('contains keyboard focus inside an open permission dialog', async () => {
    const api = createApiMock()
    let onPermission: ((request: Parameters<Parameters<GrokBridgeApi['onPermission']>[0]>[0]) => void) | undefined
    api.onPermission = vi.fn((callback) => { onPermission = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Fix tests')

    act(() => { onPermission?.({
      requestId: 'p-trap',
      sessionId: 's1',
      title: '需要權限',
      options: [
        { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject', name: 'Cancel', kind: 'reject_once' }
      ]
    }) })
    const dialog = await screen.findByRole('dialog', { name: '需要權限' })
    expect(screen.getByRole('button', { name: /Cancel/ })).toHaveFocus()

    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('does not send the draft when Enter only confirms an IME composition', async () => {
    const api = createApiMock()
    api.sendPrompt = vi.fn().mockResolvedValue(undefined)
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/)
    await user.type(composer, '注音輸入中')
    fireEvent.keyDown(composer, { key: 'Enter', isComposing: true })
    expect(api.sendPrompt).not.toHaveBeenCalled()
    expect(composer).toHaveValue('注音輸入中')

    fireEvent.keyDown(composer, { key: 'Enter' })
    expect(api.sendPrompt).toHaveBeenCalledTimes(1)
  })

  it('opens shortcut help with ? only outside text fields', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Fix tests')

    await user.keyboard('?')
    expect(screen.getByRole('dialog', { name: '快捷鍵一覽' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    const sessionSearch = screen.getByPlaceholderText(/搜尋 sessions/)
    await user.click(sessionSearch)
    await user.type(sessionSearch, '?')
    expect(screen.queryByRole('dialog', { name: '快捷鍵一覽' })).not.toBeInTheDocument()
  })

  it('names icon-only controls for screen-reader users', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('button', { name: '收合側欄' })).toBeInTheDocument()
    await user.click(screen.getByText('Fix tests'))
    expect(screen.getByRole('button', { name: '加入檔案' })).toBeInTheDocument()
  })

  it('reports directory picker failures instead of leaking an unhandled rejection', async () => {
    const api = createApiMock()
    api.chooseDirectory = vi.fn().mockRejectedValue(new Error('資料夾視窗無法開啟'))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '選擇專案開始' }))
    expect(await screen.findByText('資料夾視窗無法開啟')).toBeInTheDocument()
  })

  it('rolls back to the current session when loading another session fails', async () => {
    const api = createApiMock()
    api.listSessions = vi.fn().mockResolvedValue([
      { id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: '2026-07-11T00:00:00Z' },
      { id: 's2', cwd: 'C:\\other', title: 'Broken load', updatedAt: '2026-07-10T00:00:00Z' }
    ])
    api.loadSession = vi.fn().mockImplementation(async (sessionId) => {
      if (sessionId === 's2') throw new Error('讀取對話失敗')
      return { sessionId }
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    await user.click(screen.getByText('Broken load'))
    expect(await screen.findByText('讀取對話失敗')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fix tests' })).toBeInTheDocument()
  })

  it('resets follow-tail and unread state after creating a new active session', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.chooseDirectory = vi.fn().mockResolvedValue('C:\\new-project')
    api.createSession = vi.fn().mockResolvedValue({ sessionId: 's2' })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const scroller = document.querySelector('[data-testid="virtuoso-scroller"]') as HTMLElement | null
    expect(scroller).not.toBeNull()
    Object.defineProperties(scroller!, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, writable: true, value: 0 }
    })
    fireEvent.scroll(scroller!)
    act(() => { onEvent?.({ id: 'away-event', sessionId: 's1', kind: 'message', role: 'assistant', text: 'new output' }) })
    expect(await screen.findByRole('button', { name: /跳到最新/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /新 Session/ }))
    expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /跳到最新/ })).not.toBeInTheDocument()
  })

  it('restores a failed prompt and leaves the session ready to retry', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    let rejectPrompt: ((error: Error) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.sendPrompt = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectPrompt = reject }))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/)
    await user.type(composer, '請修好它')
    await user.click(screen.getByRole('button', { name: '送出' }))
    act(() => onEvent?.({ id: 'turn', sessionId: 's1', kind: 'turn', status: 'running' }))
    expect(await screen.findByRole('button', { name: '停止' })).toBeInTheDocument()
    act(() => rejectPrompt?.(new Error('Grok 暫時失敗')))

    await waitFor(() => expect(composer).toHaveValue('請修好它'))
    expect(screen.getByRole('button', { name: '送出' })).toBeInTheDocument()
  })

  it('restores failed attachments only to their original session', async () => {
    const api = createApiMock()
    api.listSessions = vi.fn().mockResolvedValue([
      { id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: '2026-07-11T00:00:00Z' },
      { id: 's2', cwd: 'C:\\other', title: 'Second task', updatedAt: '2026-07-10T00:00:00Z' }
    ])
    api.connect = vi.fn().mockResolvedValue({
      loadSession: true, promptCapabilities: { image: true }, sessionCapabilities: {}, modes: [], commands: []
    })
    api.chooseFiles = vi.fn()
      .mockResolvedValueOnce([{ path: 'C:\\a.png', name: 'a.png', mimeType: 'image/png', data: 'AAA' }])
      .mockResolvedValueOnce([{ path: 'C:\\b.png', name: 'b.png', mimeType: 'image/png', data: 'BBB' }])
    let rejectPrompt: ((error: Error) => void) | undefined
    api.sendPrompt = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectPrompt = reject }))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    await user.click(screen.getByRole('button', { name: '加入檔案' }))
    expect(await screen.findByRole('button', { name: '移除附件 a.png' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '送出' }))
    await user.click(screen.getByText('Second task'))
    await user.click(screen.getByRole('button', { name: '加入檔案' }))
    expect(await screen.findByRole('button', { name: '移除附件 b.png' })).toBeInTheDocument()
    act(() => rejectPrompt?.(new Error('附件傳送失敗')))
    await screen.findByText('附件傳送失敗')

    await user.click(screen.getByText('Fix tests'))
    expect(await screen.findByRole('button', { name: '移除附件 a.png' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除附件 b.png' })).not.toBeInTheDocument()
  })

  it('uses Escape only for dismissal when cancelTurn is remapped', async () => {
    const api = createApiMock()
    const saved = createDefaultSettings('C:\\Users\\demo')
    saved.shortcuts = saved.shortcuts.map((binding) => binding.command === 'cancelTurn' ? { ...binding, accelerator: 'Ctrl+X' } : binding)
    api.getSettings = vi.fn().mockResolvedValue(saved)
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    act(() => onEvent?.({ id: 'turn', sessionId: 's1', kind: 'turn', status: 'running' }))
    await user.keyboard('{Escape}')
    expect(api.cancel).not.toHaveBeenCalled()
    await user.keyboard('{Control>}x{/Control}')
    expect(api.cancel).toHaveBeenCalledWith('s1')
  })
})
