// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/src/App'
import { createDefaultSettings } from '../src/shared/settings'
import type { GrokBridgeApi } from '../src/shared/bridge'

const createApiMock = (): GrokBridgeApi => ({
  getStatus: vi.fn().mockResolvedValue({ executable: 'C:\\Users\\demo\\.grok\\bin\\grok.exe', found: true, version: '1.0.3', connected: false }),
  installCli: vi.fn().mockResolvedValue({ executable: 'C:\\Users\\demo\\.grok\\bin\\grok.exe', found: true, version: '1.0.3', connected: false }),
  reauthenticate: vi.fn().mockResolvedValue({ loadSession: true, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [] }),
  getPermissionMode: vi.fn().mockResolvedValue('ask' as const),
  setPermissionMode: vi.fn((mode) => Promise.resolve(mode)),
  connect: vi.fn().mockResolvedValue({
    loadSession: true, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [{ name: 'compact', description: '壓縮目前 context' }],
    modelState: {
      currentModelId: 'grok-4.6',
      availableModels: [
        { modelId: 'grok-4.6', name: 'Grok 4.6', description: "SpaceXAI's latest frontier model", totalContextTokens: 500000, currentReasoningEffort: 'high', reasoningEfforts: [{ id: 'xhigh', value: 'xhigh', label: 'Extra High Effort', default: true }, { id: 'high', value: 'high', label: 'High Effort', default: true }] },
        { modelId: 'grok-4.5', name: 'Grok 4.5', totalContextTokens: 500000, currentReasoningEffort: 'high', reasoningEfforts: [{ id: 'high', value: 'high', label: 'High Effort', default: true }] }
      ]
    }
  }),
  listSessions: vi.fn().mockResolvedValue([{ id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: '2026-07-11T00:00:00Z' }]),
  getSettings: vi.fn().mockResolvedValue(createDefaultSettings('C:\\Users\\demo')),
  saveSettings: vi.fn().mockImplementation(async (settings) => settings), createSession: vi.fn(), sendPrompt: vi.fn(), interject: vi.fn().mockResolvedValue({ status: 'queued' }), cancel: vi.fn(), setMode: vi.fn(), setModel: vi.fn(),
  loadSession: vi.fn().mockResolvedValue({ sessionId: 's1' }),
  deleteSession: vi.fn().mockResolvedValue(true),
  getUsage: vi.fn().mockResolvedValue({ sessionId: 's1', contextTokensUsed: 186783, contextWindowTokens: 500000, contextWindowUsage: 37, turnCount: 7 }),
  getBilling: vi.fn().mockResolvedValue({
    creditUsagePercent: 79,
    billingPeriodEnd: '2026-07-17T02:38:18Z',
    productUsage: [{ product: 'GrokBuild', usagePercent: 50 }]
  }),
  respondPermission: vi.fn(), chooseDirectory: vi.fn(), chooseFiles: vi.fn(),
  savePasteImage: vi.fn().mockResolvedValue({ path: 'C:\\Users\\demo\\AppData\\Local\\Temp\\grok-build-gui-paste\\paste-1.png' }),
  getPathForFile: vi.fn().mockReturnValue(null),
  statLocalPath: vi.fn().mockImplementation(async (filePath: string) => ({ path: filePath, kind: 'file' as const, size: 1 })),
  remoteGetState: vi.fn().mockResolvedValue({
    enabled: false, banner: 'off', pin: null, pairingSecret: null, expiresAt: null,
    publicBaseUrl: null, allowPhonePermissions: false, experimentalTunnel: false
  }),
  remoteEnable: vi.fn().mockResolvedValue({
    enabled: true, banner: 'pairable', pin: '123456', pairingSecret: 'secret', expiresAt: Date.now() + 180000,
    publicBaseUrl: 'http://127.0.0.1:9', allowPhonePermissions: false, experimentalTunnel: false
  }),
  remoteDisable: vi.fn().mockResolvedValue({
    enabled: false, banner: 'off', pin: null, pairingSecret: null, expiresAt: null,
    publicBaseUrl: null, allowPhonePermissions: false, experimentalTunnel: false
  }),
  remoteRegeneratePairing: vi.fn().mockResolvedValue({
    enabled: true, banner: 'pairable', pin: '654321', pairingSecret: 'sec2', expiresAt: Date.now() + 60_000,
    publicBaseUrl: 'http://127.0.0.1:9', allowPhonePermissions: false, experimentalTunnel: false
  }),
  remoteSetFocus: vi.fn().mockResolvedValue(true),
  remoteQueue: vi.fn().mockResolvedValue({ ok: true }),
  remoteQueueClear: vi.fn().mockResolvedValue({ ok: true }),
  onRemoteState: vi.fn().mockReturnValue(() => {}),
  onRemoteFocusChanged: vi.fn().mockReturnValue(() => {}),
  onPermissionResolved: vi.fn().mockReturnValue(() => {}),
  exportSession: vi.fn(), revealExport: vi.fn().mockResolvedValue(true), openTui: vi.fn(), openExternal: vi.fn(),
  notify: vi.fn().mockResolvedValue(false),
  previewRegister: vi.fn().mockResolvedValue({ ok: false, reason: '找不到檔案，可能已被移動或刪除' }),
  previewReadText: vi.fn().mockResolvedValue({ ok: false, reason: '找不到檔案，可能已被移動或刪除' }),
  previewChooseFile: vi.fn().mockResolvedValue(null),
  revealPath: vi.fn().mockResolvedValue(true),
  openPath: vi.fn().mockResolvedValue(''),
  onPlanApproval: vi.fn().mockReturnValue(() => {}),
  respondPlanApproval: vi.fn().mockResolvedValue(undefined),
  onEvent: vi.fn().mockReturnValue(() => {}), onPermission: vi.fn().mockReturnValue(() => {}), onStatus: vi.fn().mockReturnValue(() => {})
} as unknown as GrokBridgeApi)

describe('App', () => {
  afterEach(cleanup)

  it('shows CLI status and existing sessions without a terminal surface', async () => {
    window.grokApi = createApiMock()
    render(<App />)
    expect(await screen.findByText('Fix tests')).toBeInTheDocument()
    expect(screen.getByText(/Grok 1.0.3/)).toBeInTheDocument()
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
      modelState: { currentModelId: 'grok-4.6', availableModels: [] }
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
    expect(screen.getByRole('button', { name: /Grok 1\.0\.3/ })).toBeDisabled()
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
    const modelPicker = await screen.findByRole('button', { name: '模型：Grok 4.6' })
    await user.click(modelPicker)
    expect(screen.getByRole('option', { name: /Grok 4.5/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Extra High Effort' })).toBeInTheDocument()
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
    expect(screen.getByRole('combobox', { name: '工作模式' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Grok 1\.0\.3.*Connected/ }))
    await user.click(screen.getByTitle('命令'))

    expect(screen.queryByText('/legacy-command')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '工作模式' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('combobox', { name: '工作模式' })).not.toBeInTheDocument()
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

  it('pauses follow-tail immediately when the user scrolls up during streaming thoughts', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const scroller = document.querySelector('[data-testid="virtuoso-scroller"]') as HTMLElement | null
    expect(scroller).not.toBeNull()
    Object.defineProperties(scroller!, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, writable: true, value: 900 }
    })

    act(() => {
      onEvent?.({ id: 'turn-running', sessionId: 's1', kind: 'turn', status: 'running' })
      onEvent?.({ id: 'thought-1', sessionId: 's1', kind: 'thought', text: '正在分析第一段' })
    })

    fireEvent.wheel(scroller!, { deltaY: -160 })
    expect(screen.getByRole('button', { name: /跳到最新/ })).toBeInTheDocument()

    // A streaming resize may briefly report "at bottom" again. The user's explicit
    // scroll-up intent must win so later thought chunks cannot yank the viewport back.
    scroller!.scrollTop = 900
    fireEvent.scroll(scroller!)
    act(() => {
      onEvent?.({ id: 'thought-2', sessionId: 's1', kind: 'thought', text: '，繼續分析第二段' })
    })
    expect(screen.getByRole('button', { name: /跳到最新/ })).toBeInTheDocument()
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
    await screen.findByPlaceholderText(/交給 Grok 一個任務/)
    await user.click(screen.getByRole('button', { name: '加入檔案' }))
    expect(await screen.findByRole('button', { name: '移除附件 a.png' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '送出' }))
    await user.click(screen.getByText('Second task'))
    await screen.findByPlaceholderText(/交給 Grok 一個任務/)
    await user.click(screen.getByRole('button', { name: '加入檔案' }))
    expect(await screen.findByRole('button', { name: '移除附件 b.png' })).toBeInTheDocument()
    act(() => rejectPrompt?.(new Error('附件傳送失敗')))
    await screen.findByText('附件傳送失敗')

    await user.click(screen.getByText('Fix tests'))
    await screen.findByPlaceholderText(/交給 Grok 一個任務/)
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

  // --- v0.4.1 regression locks (T1–T8) ---

  it('T1 keeps the permission-mode select usable while busy and explains the refusal', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    let resolveLoad: ((value: { sessionId: string }) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.loadSession = vi.fn(() => new Promise<{ sessionId: string }>((resolve) => { resolveLoad = resolve }))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    const select = await screen.findByRole('combobox', { name: '權限模式' })
    // Never disabled: Chromium hides tooltips on disabled controls, so a locked
    // select used to be a dead end. It stays clickable and says why instead.
    expect(select).not.toBeDisabled()
    expect(select).not.toHaveAttribute('data-locked')
    expect(screen.getByText('工具權限')).toBeInTheDocument()

    await user.click(await screen.findByText('Fix tests'))
    expect(select).toHaveAttribute('data-locked', 'true')
    act(() => { resolveLoad?.({ sessionId: 's1' }) })
    await waitFor(() => expect(select).not.toHaveAttribute('data-locked'))

    act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })
    expect(select).toHaveAttribute('data-locked', 'true')
    await user.selectOptions(select, 'always-approve')
    expect(await screen.findByText(/回合執行中無法切換工具權限/)).toBeInTheDocument()
    expect(api.setPermissionMode).not.toHaveBeenCalled()
    expect(select).toHaveValue('ask')

    act(() => { onEvent?.({ id: 'turn-done', sessionId: 's1', kind: 'turn', status: 'completed' }) })
    await waitFor(() => expect(select).not.toHaveAttribute('data-locked'))
  })

  it('T2 guards YOLO confirm against double-click and shows the YOLO banner after success', async () => {
    const api = createApiMock()
    let resolveMode: ((mode: 'always-approve') => void) | undefined
    let calls = 0
    api.setPermissionMode = vi.fn(() => {
      calls += 1
      return new Promise<'always-approve'>((resolve) => { resolveMode = resolve })
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    const select = await screen.findByRole('combobox', { name: '權限模式' })
    await user.selectOptions(select, 'always-approve')
    const confirm = await screen.findByRole('button', { name: /我了解風險，啟用 YOLO/ })
    await user.click(confirm)
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(calls).toBe(1)

    await act(async () => { resolveMode?.('always-approve') })
    expect(await screen.findByText(/已切換到 YOLO 模式/)).toBeInTheDocument()
    expect(document.querySelector('.yolo-banner')).toBeInTheDocument()
    expect(api.setPermissionMode).toHaveBeenCalledWith('always-approve')
  })

  it('T3 starts permission mode as ask on every launch', async () => {
    const api = createApiMock()
    api.getPermissionMode = vi.fn().mockResolvedValue('ask' as const)
    window.grokApi = api
    render(<App />)

    const select = await screen.findByRole('combobox', { name: '權限模式' })
    expect(select).toHaveValue('ask')
    expect(api.getPermissionMode).toHaveBeenCalled()
    expect(screen.queryByText(/YOLO 模式：已啟用一律核准/)).not.toBeInTheDocument()
  })

  it('T4 closes the batch-delete modal on confirm and blocks re-entry while deleting', async () => {
    const api = createApiMock()
    api.listSessions = vi.fn().mockResolvedValue([
      { id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: '2026-07-11T00:00:00Z' },
      { id: 's2', cwd: 'C:\\repo', title: 'Other task', updatedAt: '2026-07-10T00:00:00Z' }
    ])
    let resolveDelete: ((value: boolean) => void) | undefined
    let deleteCalls = 0
    api.deleteSession = vi.fn(() => {
      deleteCalls += 1
      return new Promise<boolean>((resolve) => { resolveDelete = resolve })
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('Fix tests')
    await user.click(screen.getByRole('button', { name: '多選' }))
    await user.click(screen.getByRole('checkbox', { name: '選擇對話 Fix tests' }))
    await user.click(screen.getByRole('checkbox', { name: '選擇對話 Other task' }))
    await user.click(screen.getByRole('button', { name: /刪除所選/ }))
    expect(screen.getByRole('dialog', { name: '批次刪除確認' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /永久刪除/ }))
    expect(screen.queryByRole('dialog', { name: '批次刪除確認' })).not.toBeInTheDocument()
    expect(deleteCalls).toBe(1)

    // While the first batch is still in flight, re-open confirm and submit again.
    // Modal may open (selection still present), but the re-entry lock must not call deleteSession again.
    await user.click(screen.getByRole('button', { name: /刪除所選/ }))
    expect(screen.getByRole('dialog', { name: '批次刪除確認' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /永久刪除/ }))
    expect(screen.queryByRole('dialog', { name: '批次刪除確認' })).not.toBeInTheDocument()
    expect(deleteCalls).toBe(1)

    await act(async () => { resolveDelete?.(true) })
    await waitFor(() => expect(api.deleteSession).toHaveBeenCalled())
  })

  it('T5 moves a pinned session into the 已釘選 group', async () => {
    const api = createApiMock()
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('Fix tests')
    expect(screen.queryByText('已釘選')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '釘選 Fix tests' }))
    expect(await screen.findByText('已釘選')).toBeInTheDocument()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ pinnedSessions: ['s1'] }))
  })

  it('T6 can reopen the sidebar after collapsing it on the empty home state', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('Fix tests')
    expect(screen.getByRole('button', { name: '選擇專案開始' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '收合側欄' }))
    expect(document.querySelector('.workspace')).toHaveClass('sidebar-collapsed')
    // Prefer the float control that sits on the empty home state.
    const expand = document.querySelector('.sidebar-expand-float') as HTMLButtonElement | null
    expect(expand).not.toBeNull()
    await user.click(expand!)
    expect(document.querySelector('.workspace')).not.toHaveClass('sidebar-collapsed')
  })

  it('T7 saves a pasted image as a local path when ACP image capability is false', async () => {
    const api = createApiMock()
    const savedPath = 'C:\\Users\\demo\\AppData\\Local\\Temp\\grok-build-gui-paste\\paste-9.png'
    api.savePasteImage = vi.fn().mockResolvedValue({ path: savedPath })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/) as HTMLTextAreaElement
    expect(composer).toHaveValue('')

    const file = new File([Uint8Array.from([137, 80, 78, 71])], 'clip.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.paste(composer, {
        clipboardData: {
          files: [file],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
          types: ['Files']
        }
      })
    })

    await waitFor(() => expect(api.savePasteImage).toHaveBeenCalledTimes(1))
    expect(api.savePasteImage).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/png', data: expect.any(String) }))
    await waitFor(() => expect(composer).toHaveValue(savedPath))
    expect(screen.getByText(/已改以本機路徑附上/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /移除附件/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /移除路徑/ })).toBeInTheDocument()
  })

  it('T8 leaves the draft unchanged and shows a notice when paste save fails', async () => {
    const api = createApiMock()
    api.savePasteImage = vi.fn().mockRejectedValue(new Error('磁碟已滿'))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/) as HTMLTextAreaElement
    await user.type(composer, '保留這段')

    const file = new File([Uint8Array.from([1, 2, 3])], 'clip.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.paste(composer, {
        clipboardData: {
          files: [file],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
          types: ['Files']
        }
      })
    })

    await waitFor(() => expect(api.savePasteImage).toHaveBeenCalled())
    expect(await screen.findByText(/貼圖儲存失敗/)).toBeInTheDocument()
    expect(composer).toHaveValue('保留這段')
    expect(screen.queryByRole('button', { name: /移除路徑/ })).not.toBeInTheDocument()
  })

  // --- v0.5.0 interject / do-this-now ---

  it('F-INT: keeps composer usable while running and interject does not cancel', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.interject = vi.fn().mockResolvedValue({ status: 'queued' })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })

    const composer = await screen.findByPlaceholderText(/回合進行中可插話/)
    expect(composer).not.toBeDisabled()
    await user.type(composer, '改做這件事')
    await user.click(screen.getByTestId('interject-button'))

    await waitFor(() => expect(api.interject).toHaveBeenCalledWith(
      's1',
      '改做這件事',
      expect.objectContaining({ interjectionId: expect.any(String) })
    ))
    expect(api.cancel).not.toHaveBeenCalled()
    expect(await screen.findByTestId('interject-status')).toHaveTextContent('已排入，下一個安全點生效')
    expect(composer).toHaveValue('')
    await waitFor(() => expect(screen.getByTestId('prompt-bookmarks-trigger')).toHaveTextContent('1'))
  })

  it('F-INT-3: 立刻改做 cancels then sends a new prompt', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.cancel = vi.fn().mockResolvedValue(undefined)
    api.sendPrompt = vi.fn().mockResolvedValue(undefined)
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })
    const composer = await screen.findByPlaceholderText(/回合進行中可插話/)
    await user.type(composer, '立刻換任務')
    await user.click(screen.getByTestId('do-this-now-button'))

    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(api.sendPrompt).toHaveBeenCalledWith('s1', [{ type: 'text', text: '立刻換任務' }]))
    expect(api.interject).not.toHaveBeenCalled()
  })

  it('T-INT-3: method not found shows degrade notice and never cancels', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.interject = vi.fn().mockRejectedValue(new Error('Method not found'))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })
    const composer = await screen.findByPlaceholderText(/回合進行中可插話/)
    await user.type(composer, 'hello')
    await user.click(screen.getByTestId('interject-button'))

    expect(await screen.findByText(/不支援插話/)).toBeInTheDocument()
    expect(api.cancel).not.toHaveBeenCalled()
  })

  it('strips Electron IPC prefixes from interject errors', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.interject = vi.fn().mockRejectedValue(new Error("Error invoking remote method 'grok:interject': Error: 網路逾時"))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })
    const composer = await screen.findByPlaceholderText(/回合進行中可插話/)
    await user.type(composer, 'hello')
    await user.click(screen.getByTestId('interject-button'))

    expect(await screen.findByText('網路逾時')).toBeInTheDocument()
    expect(screen.queryByText(/Error invoking remote method/)).not.toBeInTheDocument()
    expect(api.cancel).not.toHaveBeenCalled()
  })

  it('T-INT-5: cancel after queued interject clears the queued status', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.interject = vi.fn().mockResolvedValue({ status: 'queued' })
    api.cancel = vi.fn().mockResolvedValue(undefined)
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })
    const composer = await screen.findByPlaceholderText(/回合進行中可插話/)
    await user.type(composer, 'queued text')
    await user.click(screen.getByTestId('interject-button'))
    expect(await screen.findByTestId('interject-status')).toBeInTheDocument()

    await user.click(screen.getByTestId('stop-button'))
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(screen.queryByTestId('interject-status')).not.toBeInTheDocument())
  })

  it('T-MED-1: drag-drop image uses the same paste save path pipeline', async () => {
    const api = createApiMock()
    const savedPath = 'C:\\Users\\demo\\AppData\\Local\\Temp\\grok-build-gui-paste\\paste-drop.png'
    api.savePasteImage = vi.fn().mockResolvedValue({ path: savedPath })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/) as HTMLTextAreaElement
    const wrap = composer.closest('.composer-wrap') as HTMLElement
    const file = new File([Uint8Array.from([137, 80, 78, 71])], 'drop.png', { type: 'image/png' })

    await act(async () => {
      fireEvent.drop(wrap, {
        dataTransfer: {
          files: [file],
          types: ['Files'],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }]
        }
      })
    })

    await waitFor(() => expect(api.savePasteImage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(composer).toHaveValue(savedPath))
    expect(screen.getByRole('button', { name: /移除路徑/ })).toBeInTheDocument()
  })

  it('T-RT-6: context pill is labeled separately from subscription quota rings', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Fix tests'))
    expect(screen.getByLabelText('Context 視窗用量')).toBeInTheDocument()
    expect(screen.getByTestId('quota-reactor')).toHaveAttribute('data-billing-zone', 'subscription')
    expect(screen.getByLabelText('訂閱週額度摘要')).toBeInTheDocument()
  })

  it('F-MED-2: paste path chip shows optional thumbnail preview', async () => {
    const api = createApiMock()
    const savedPath = 'C:\\Users\\demo\\AppData\\Local\\Temp\\grok-build-gui-paste\\paste-thumb.png'
    api.savePasteImage = vi.fn().mockResolvedValue({ path: savedPath })
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-preview')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/) as HTMLTextAreaElement
    const file = new File([Uint8Array.from([137, 80, 78, 71])], 'clip.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.paste(composer, {
        clipboardData: {
          files: [file],
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
          types: ['Files']
        }
      })
    })

    await waitFor(() => expect(composer).toHaveValue(savedPath))
    expect(screen.getByTestId('path-chip')).toBeInTheDocument()
    expect(screen.getByTestId('path-chip-thumb')).toHaveAttribute('src', 'blob:mock-preview')
  })

  it('F-RT-4: shows Chinese session mode labels when modes are available', async () => {
    const api = createApiMock()
    api.connect = vi.fn().mockResolvedValue({
      loadSession: true,
      promptCapabilities: {},
      sessionCapabilities: {},
      modes: [],
      commands: []
    })
    api.loadSession = vi.fn().mockResolvedValue({
      sessionId: 's1',
      modes: {
        currentModeId: 'plan',
        availableModes: [
          { id: 'plan', name: 'Plan' },
          { id: 'code', name: 'Code' }
        ]
      }
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Fix tests'))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalled())
    const select = await screen.findByTestId('session-mode-select')
    expect(select).toHaveAttribute('aria-label', '工作模式')
    expect(screen.getByRole('option', { name: '計畫模式' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '執行模式' })).toBeInTheDocument()
  })

  it('F-INT-4: queues next turn and auto-sends when the current turn completes', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.sendPrompt = vi.fn().mockResolvedValue(undefined)
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })
    const composer = await screen.findByPlaceholderText(/回合進行中可插話/)
    await user.type(composer, '下一輪做這個')
    await user.click(screen.getByTestId('queue-next-button'))

    expect(await screen.findByTestId('local-queue-status')).toHaveTextContent('下一輪已排隊')
    expect(api.interject).not.toHaveBeenCalled()
    expect(api.cancel).not.toHaveBeenCalled()
    expect(composer).toHaveValue('')

    act(() => { onEvent?.({ id: 'turn-done', sessionId: 's1', kind: 'turn', status: 'completed' }) })
    await waitFor(() => expect(api.sendPrompt).toHaveBeenCalledWith('s1', [{ type: 'text', text: '下一輪做這個' }]))
    await waitFor(() => expect(screen.queryByTestId('local-queue-status')).not.toBeInTheDocument())
    expect(api.notify).toHaveBeenCalled()
  })

  it('F-TOOL-3: settings show CLI update hint', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /設定/ }))
    expect(await screen.findByTestId('cli-update-hint')).toHaveTextContent(/官方更新/)
    expect(screen.getByTestId('cli-update-hint')).toHaveTextContent('1.0.3')
    expect(screen.getByTestId('cli-update-hint')).toHaveTextContent('grok update')
  })

  it('Agents Team: enables side-by-side board for two sessions', async () => {
    const api = createApiMock()
    api.listSessions = vi.fn().mockResolvedValue([
      { id: 's1', cwd: 'C:\\repo-a', title: 'Agent Alpha', updatedAt: '2026-07-11T00:00:00Z' },
      { id: 's2', cwd: 'C:\\repo-b', title: 'Agent Beta', updatedAt: '2026-07-11T01:00:00Z' }
    ])
    api.loadSession = vi.fn().mockImplementation(async (sessionId: string) => ({ sessionId }))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Agent Alpha')).toBeInTheDocument()
    await user.click(screen.getByTestId('agents-team-toggle'))
    await user.click(screen.getByText('Agent Alpha'))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalled())
    await user.click(screen.getByText('Agent Beta'))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalledWith('s2', 'C:\\repo-b'))
    expect(await screen.findByTestId('agents-team-board')).toBeInTheDocument()
    expect(screen.getAllByTestId('team-pane')).toHaveLength(2)
  })

  /** T4 proxy: dual panes keep independent drafts and only cancel the focused running session. */
  it('T4: team panes isolate drafts; cancel only hits focused running session', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.listSessions = vi.fn().mockResolvedValue([
      { id: 's1', cwd: 'C:\\repo-a', title: 'Agent Alpha', updatedAt: '2026-07-11T00:00:00Z' },
      { id: 's2', cwd: 'C:\\repo-b', title: 'Agent Beta', updatedAt: '2026-07-11T01:00:00Z' }
    ])
    api.loadSession = vi.fn().mockImplementation(async (sessionId: string) => ({ sessionId }))
    api.cancel = vi.fn().mockResolvedValue(undefined)
    api.sendPrompt = vi.fn().mockResolvedValue(undefined)
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByTestId('agents-team-toggle'))
    await user.click(screen.getByText('Agent Alpha'))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalledWith('s1', 'C:\\repo-a'))
    await user.click(screen.getByText('Agent Beta'))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalledWith('s2', 'C:\\repo-b'))
    expect(screen.getAllByTestId('team-pane')).toHaveLength(2)

    const panes = screen.getAllByTestId('team-pane')
    const areaA = panes[0].querySelector('textarea')
    const areaB = panes[1].querySelector('textarea')
    expect(areaA).toBeTruthy()
    expect(areaB).toBeTruthy()
    await user.type(areaA!, '任務A草稿')
    await user.type(areaB!, '任務B草稿')
    expect(areaA).toHaveValue('任務A草稿')
    expect(areaB).toHaveValue('任務B草稿')

    // Both turns running (overlap).
    act(() => {
      onEvent?.({ id: 't1', sessionId: 's1', kind: 'turn', status: 'running' })
      onEvent?.({ id: 't2', sessionId: 's2', kind: 'turn', status: 'running' })
    })

    // Focus A, stop only A.
    await user.click(panes[0])
    const stopButtons = screen.getAllByRole('button', { name: /停止/ })
    expect(stopButtons.length).toBeGreaterThanOrEqual(1)
    // Team pane stop is labeled 停止
    const paneAStop = panes[0].querySelector('button.stop-button') as HTMLButtonElement | null
    expect(paneAStop).toBeTruthy()
    await user.click(paneAStop!)
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('s1'))
    expect(api.cancel).not.toHaveBeenCalledWith('s2')

    // B can still complete independently.
    act(() => {
      onEvent?.({ id: 't2-done', sessionId: 's2', kind: 'turn', status: 'completed' })
    })
    expect(api.cancel).toHaveBeenCalledTimes(1)
  })

  it('T4: sendPrompt routes to the pane session id after both are ready', async () => {
    const api = createApiMock()
    api.listSessions = vi.fn().mockResolvedValue([
      { id: 's1', cwd: 'C:\\repo-a', title: 'Agent Alpha', updatedAt: '2026-07-11T00:00:00Z' },
      { id: 's2', cwd: 'C:\\repo-b', title: 'Agent Beta', updatedAt: '2026-07-11T01:00:00Z' }
    ])
    api.loadSession = vi.fn().mockImplementation(async (sessionId: string) => ({ sessionId }))
    api.sendPrompt = vi.fn().mockResolvedValue(undefined)
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByTestId('agents-team-toggle'))
    await user.click(screen.getByText('Agent Alpha'))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalledWith('s1', 'C:\\repo-a'))
    await user.click(screen.getByText('Agent Beta'))
    await waitFor(() => expect(api.loadSession).toHaveBeenCalledWith('s2', 'C:\\repo-b'))

    const panes = screen.getAllByTestId('team-pane')
    const areaB = panes[1].querySelector('textarea')!
    await user.clear(areaB)
    await user.type(areaB, '只給B')
    const sendB = panes[1].querySelector('button.send-button') as HTMLButtonElement
    await user.click(sendB)
    await waitFor(() => expect(api.sendPrompt).toHaveBeenCalledWith('s2', [{ type: 'text', text: '只給B' }]))
    expect(api.sendPrompt).not.toHaveBeenCalledWith('s1', expect.anything())
  })

  it('F-RT-5: command palette lists all availableCommands entries', async () => {
    const api = createApiMock()
    api.connect = vi.fn().mockResolvedValue({
      loadSession: true,
      promptCapabilities: {},
      sessionCapabilities: {},
      modes: [],
      commands: [
        { name: 'compact', description: '壓縮 context' },
        { name: 'context', description: '顯示用量', inputHint: 'detail' },
        { name: 'session-info', description: 'Session 資訊' }
      ]
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText(/Grok 1.0.3/))
    await waitFor(() => expect(api.connect).toHaveBeenCalled())
    await user.click(await screen.findByText('Fix tests'))
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}')
    expect(await screen.findByText('/compact')).toBeInTheDocument()
    expect(screen.getByText('/context')).toBeInTheDocument()
    expect(screen.getByText('/session-info')).toBeInTheDocument()
  })

  it('R2: opens the Background Tasks / Loop panel from the launcher, closes it with Escape, and capability-gates /loop when the CLI never advertised it', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Fix tests'))

    await user.click(await screen.findByTitle('背景任務／Loop'))
    const panel = await screen.findByTestId('background-tasks-panel')
    expect(within(panel).getByRole('heading', { name: '背景任務／Loop' })).toBeInTheDocument()
    // Context usage (already fetched via getUsage) is surfaced inside the panel too.
    expect(within(panel).getByText('37%')).toBeInTheDocument()
    expect(within(panel).getByText('服務未提供')).toBeInTheDocument()
    // R2 rework fix #7: createApiMock's default connect() response never lists `loop` in
    // commands, so the CLI never advertised /loop — the form must say so and stay disabled.
    expect(within(panel).getByTestId('bgtasks-loop-unavailable')).toHaveTextContent('未廣播 /loop 命令')
    const loopHeading = within(panel).getByRole('heading', { name: '建立定時任務' })
    const loopDetails = loopHeading.closest('details')
    if (loopDetails) loopDetails.open = true
    expect(within(panel).getByLabelText('提示內容')).toBeDisabled()

    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('background-tasks-panel')).not.toBeInTheDocument()
  })

  it('R2 rework: creating a loop sends /loop through the existing prompt-send path and never touches the main composer draft', async () => {
    const api = createApiMock()
    api.sendPrompt = vi.fn().mockResolvedValue(undefined)
    api.connect = vi.fn().mockResolvedValue({
      loadSession: true, promptCapabilities: {}, sessionCapabilities: {}, modes: [],
      commands: [{ name: 'loop', description: '建立定時任務', inputHint: '[interval] <prompt>' }]
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Fix tests'))

    // Sentinel draft in the main composer, independent of anything the panel does.
    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/)
    await user.type(composer, '別動我這段還沒送出的草稿')

    await user.click(await screen.findByTitle('背景任務／Loop'))
    await screen.findByTestId('background-tasks-panel')
    expect(within(await screen.findByTestId('background-tasks-panel')).queryByTestId('bgtasks-loop-unavailable')).not.toBeInTheDocument()
    const loopHeading = screen.getByRole('heading', { name: '建立定時任務' })
    const loopDetails = loopHeading.closest('details')
    if (loopDetails) loopDetails.open = true

    await user.type(screen.getByLabelText('間隔（選填）'), '5m')
    await user.type(screen.getByLabelText('提示內容'), '檢查建置狀態')
    await user.click(screen.getByRole('button', { name: '建立定時任務' }))

    await waitFor(() => expect(api.sendPrompt).toHaveBeenCalledWith('s1', [{ type: 'text', text: '/loop 5m 檢查建置狀態' }]))
    // Codex R2 review fix #1: dispatchPrompt-style composer clearing must never fire for a
    // panel-originated send — the sentinel draft has to survive untouched.
    expect(composer).toHaveValue('別動我這段還沒送出的草稿')
  })

  it('R3: launching a goal with budget sends exact /goal text through sendPrompt and never touches the main composer draft', async () => {
    const api = createApiMock()
    api.sendPrompt = vi.fn().mockResolvedValue(undefined)
    api.connect = vi.fn().mockResolvedValue({
      loadSession: true, promptCapabilities: {}, sessionCapabilities: {}, modes: [],
      commands: [
        { name: 'workflow', description: 'Workflow', inputHint: '<name> [args] | pause|resume|stop|save [name]' },
        { name: 'goal', description: 'Goal', inputHint: '<objective> [--budget <tokens>] | status | pause | resume | clear' },
        { name: 'deep-research', description: 'Deep research', inputHint: '<query>' }
      ]
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Fix tests'))

    const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/)
    await user.type(composer, '別動我這段還沒送出的草稿')

    await user.click(await screen.findByTitle('背景任務／Loop'))
    const panel = await screen.findByTestId('background-tasks-panel')
    expect(within(panel).queryByTestId('bgtasks-goal-unavailable')).not.toBeInTheDocument()
    const autoHeading = within(panel).getByRole('heading', { name: '自主任務' })
    const autoDetails = autoHeading.closest('details')
    if (autoDetails) autoDetails.open = true

    await user.type(within(panel).getByLabelText('目標內容'), 'ship the release')
    await user.type(within(panel).getByLabelText('預算 tokens（選填）'), '100000')
    await user.click(within(panel).getByRole('button', { name: '啟動 Goal' }))

    await waitFor(() => expect(api.sendPrompt).toHaveBeenCalledWith('s1', [
      { type: 'text', text: '/goal ship the release --budget 100000' }
    ]))
    expect(composer).toHaveValue('別動我這段還沒送出的草稿')
  })

  it('R2 rework: stopping a recurring loop sends a scheduler_delete instruction, never session/cancel', async () => {
    const api = createApiMock()
    api.sendPrompt = vi.fn().mockResolvedValue(undefined)
    api.cancel = vi.fn().mockResolvedValue(undefined)
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Fix tests'))

    // Pre-normalized UiSessionEvent for the fully-merged real /loop capture (event-adapter and
    // session-state have their own dedicated tests for the raw ACP -> merged-event pipeline).
    act(() => {
      onEvent?.({
        id: 'sched-1', sessionId: 's1', kind: 'tool', toolCallId: 'call-00000000-0000-4000-8000-000000000003-0',
        title: 'Create scheduled task (every 60s)', status: 'completed', toolName: 'scheduler_create',
        rawOutput: { type: 'SchedulerCreate', id: '019f00000001', humanSchedule: 'every 1 minute', updated: false }
      })
    })

    await user.click(await screen.findByTitle('背景任務／Loop'))
    const panel = await screen.findByTestId('background-tasks-panel')
    expect(within(panel).getByText(/排程 ID：019f00000001/)).toBeInTheDocument()
    expect(within(panel).getByText('執行中（every 1 minute）')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: /停止/ }))
    await waitFor(() => expect(api.sendPrompt).toHaveBeenCalledWith('s1', [
      { type: 'text', text: '請使用 scheduler_delete 工具刪除排程 ID「019f00000001」，停止這個定時任務。' }
    ]))
    expect(api.cancel).not.toHaveBeenCalled()
    expect(await within(panel).findByTestId('bgtasks-stop-requested')).toBeInTheDocument()
  })

  describe('official subagent roster', () => {
    const LIVE = {
      subagentId: 'child-1',
      parentSessionId: 's1',
      childSessionId: 'child-1',
      subagentType: 'general-purpose',
      description: '撰寫版本控制短文',
      startedAtEpochMs: 1786676836587,
      durationMs: 1352,
      turnCount: 1,
      toolCallCount: 0,
      tokensUsed: 2007,
      contextUsagePct: 0,
      toolsUsed: [],
      errorCount: 0
    }

    it('shows a card for a running child the event stream never mentioned', async () => {
      const api = createApiMock()
      api.listRunningSubagents = vi.fn().mockResolvedValue([LIVE])
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await user.click(await screen.findByText('Fix tests'))
      await user.click(await screen.findByTitle('背景任務／Loop'))

      const panel = await screen.findByTestId('background-tasks-panel')
      await waitFor(() => expect(api.listRunningSubagents).toHaveBeenCalledWith('s1'))
      expect(await within(panel).findByText('撰寫版本控制短文')).toBeInTheDocument()
      expect(within(panel).getByText(/執行中（官方回報）/)).toBeInTheDocument()
      expect(within(panel).getByText(/general-purpose/)).toBeInTheDocument()
    })

    it('falls back to inference when the CLI cannot answer', async () => {
      const api = createApiMock()
      api.listRunningSubagents = vi.fn().mockResolvedValue(null)
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await user.click(await screen.findByText('Fix tests'))
      await user.click(await screen.findByTitle('背景任務／Loop'))

      const panel = await screen.findByTestId('background-tasks-panel')
      await waitFor(() => expect(api.listRunningSubagents).toHaveBeenCalled())
      expect(within(panel).queryByText(/官方回報/)).not.toBeInTheDocument()
    })

    it('offers no cancel control for roster cards', async () => {
      const api = createApiMock()
      api.listRunningSubagents = vi.fn().mockResolvedValue([LIVE])
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await user.click(await screen.findByText('Fix tests'))
      await user.click(await screen.findByTitle('背景任務／Loop'))

      const panel = await screen.findByTestId('background-tasks-panel')
      expect(await within(panel).findByText('撰寫版本控制短文')).toBeInTheDocument()
      expect(within(panel).queryByRole('button', { name: /停止|取消子代理/ })).not.toBeInTheDocument()
    })
  })

  describe('plan approval (_x.ai/exit_plan_mode)', () => {
    const renderWithPlanHook = async (): Promise<{
      api: GrokBridgeApi
      fire: (request: { requestId: string; sessionId: string; toolCallId: string; planContent: string }) => void
    }> => {
      const api = createApiMock()
      let onPlan: ((request: never) => void) | undefined
      api.onPlanApproval = vi.fn((callback) => { onPlan = callback as never; return () => {} })
      window.grokApi = api
      render(<App />)
      expect(await screen.findByText('Fix tests')).toBeInTheDocument()
      return { api, fire: (request) => act(() => { onPlan?.(request as never) }) }
    }

    it('shows the plan and answers approve with { approved: true }', async () => {
      const { api, fire } = await renderWithPlanHook()
      expect(screen.queryByTestId('plan-approval-modal')).not.toBeInTheDocument()

      fire({ requestId: 'plan:1', sessionId: 's1', toolCallId: 'call-1', planContent: '# 計畫\n先加測試再改程式' })

      expect(await screen.findByTestId('plan-approval-modal')).toBeInTheDocument()
      expect(screen.getByTestId('plan-approval-content')).toHaveTextContent('先加測試再改程式')

      await userEvent.setup().click(screen.getByTestId('plan-approve'))
      await waitFor(() => expect(api.respondPlanApproval).toHaveBeenCalledWith('plan:1', 'approve'))
      expect(screen.queryByTestId('plan-approval-modal')).not.toBeInTheDocument()
    })

    it('offers request-changes and abandon without approving', async () => {
      const { api, fire } = await renderWithPlanHook()
      fire({ requestId: 'plan:2', sessionId: 's1', toolCallId: 'call-2', planContent: '計畫內容' })
      await screen.findByTestId('plan-approval-modal')

      await userEvent.setup().click(screen.getByTestId('plan-request-changes'))
      await waitFor(() => expect(api.respondPlanApproval).toHaveBeenCalledWith('plan:2', 'request-changes'))

      fire({ requestId: 'plan:3', sessionId: 's1', toolCallId: 'call-3', planContent: '計畫內容' })
      await screen.findByTestId('plan-approval-modal')
      await userEvent.setup().click(screen.getByTestId('plan-abandon'))
      await waitFor(() => expect(api.respondPlanApproval).toHaveBeenCalledWith('plan:3', 'abandon'))

      expect(api.respondPlanApproval).not.toHaveBeenCalledWith(expect.anything(), 'approve')
    })

    it('still offers a decision when the agent exited plan mode without writing a plan', async () => {
      const { fire } = await renderWithPlanHook()
      fire({ requestId: 'plan:4', sessionId: 's1', toolCallId: 'call-4', planContent: '   ' })
      expect(await screen.findByTestId('plan-approval-empty')).toBeInTheDocument()
      expect(screen.getByTestId('plan-approve')).toBeInTheDocument()
    })
  })

  describe('sidebar active-only filter', () => {
    const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString()
    const withSessions = (): GrokBridgeApi => {
      const api = createApiMock()
      api.listSessions = vi.fn().mockResolvedValue([
        { id: 'fresh', cwd: 'C:\\repo', title: '今天在跑的', updatedAt: daysAgo(0.5) },
        { id: 'stale', cwd: 'C:\\repo', title: '兩週沒動的', updatedAt: daysAgo(14) },
        { id: 'pinned-stale', cwd: 'C:\\repo', title: '釘選但很舊', updatedAt: daysAgo(40) }
      ])
      api.getSettings = vi.fn().mockResolvedValue({
        ...createDefaultSettings('C:\\Users\\demo'),
        pinnedSessions: ['pinned-stale']
      })
      api.loadSession = vi.fn().mockImplementation(async (sessionId: string) => ({ sessionId }))
      return api
    }

    it('is off by default so an upgrade never looks like conversations were deleted', async () => {
      window.grokApi = withSessions()
      render(<App />)
      expect(await screen.findByText('兩週沒動的')).toBeInTheDocument()
      expect(screen.getByText('今天在跑的')).toBeInTheDocument()
      expect(screen.getByTestId('active-only-toggle')).not.toBeChecked()
      expect(screen.getByTestId('session-caption-count')).toHaveTextContent('3')
    })

    it('hides stale sessions, keeps pinned ones, and persists the choice', async () => {
      const api = withSessions()
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      expect(await screen.findByText('兩週沒動的')).toBeInTheDocument()

      await user.click(screen.getByTestId('active-only-toggle'))

      await waitFor(() => expect(screen.queryByText('兩週沒動的')).not.toBeInTheDocument())
      expect(screen.getByText('今天在跑的')).toBeInTheDocument()
      expect(screen.getByText('釘選但很舊')).toBeInTheDocument()
      expect(screen.getByTestId('session-caption-count')).toHaveTextContent('2 · 活躍 4 天')
      expect(api.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ sidebarActiveOnly: true, sidebarActiveDays: 4 })
      )

      await user.click(screen.getByTestId('active-only-toggle'))
      expect(await screen.findByText('兩週沒動的')).toBeInTheDocument()
      expect(screen.getByTestId('session-caption-count')).toHaveTextContent('3')
    })

    it('never hides the conversation the user currently has open', async () => {
      const api = withSessions()
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)

      await user.click(await screen.findByText('兩週沒動的'))
      await waitFor(() => expect(api.loadSession).toHaveBeenCalledWith('stale', 'C:\\repo'))

      await user.click(screen.getByTestId('active-only-toggle'))

      await waitFor(() => expect(screen.getByTestId('active-only-toggle')).toBeChecked())
      // Scoped to the sidebar: the open session's title also renders in the main pane.
      expect(within(screen.getByTestId('session-list')).getByText('兩週沒動的')).toBeInTheDocument()
    })

    it('restores a saved on-state with its saved window on next launch', async () => {
      const api = withSessions()
      api.getSettings = vi.fn().mockResolvedValue({
        ...createDefaultSettings('C:\\Users\\demo'),
        sidebarActiveOnly: true,
        sidebarActiveDays: 20
      })
      window.grokApi = api
      render(<App />)

      expect(await screen.findByText('今天在跑的')).toBeInTheDocument()
      expect(screen.getByTestId('active-only-toggle')).toBeChecked()
      // 14 days old is inside a 20-day window; 40 days old is not.
      expect(screen.getByText('兩週沒動的')).toBeInTheDocument()
      expect(screen.queryByText('釘選但很舊')).not.toBeInTheDocument()
      expect(screen.getByTestId('session-caption-count')).toHaveTextContent('2 · 活躍 20 天')
    })

    it('folder dropdown counts the filtered pool, not the whole machine', async () => {
      const api = withSessions()
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      expect(await screen.findByText('兩週沒動的')).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /全部資料夾（3）/ })).toBeInTheDocument()

      await user.click(screen.getByTestId('active-only-toggle'))

      // Must agree with the caption — 3 vs 2 side by side is what the shop owner flagged.
      await waitFor(() => expect(screen.getByRole('option', { name: /全部資料夾（2）/ })).toBeInTheDocument())
      expect(screen.getByTestId('session-caption-count')).toHaveTextContent('2 · 活躍 4 天')
    })

    it('leaves the 10-day cleanup suggestions alone when the filter is on', async () => {
      const api = withSessions()
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      expect(await screen.findByText('兩週沒動的')).toBeInTheDocument()
      const before = screen.getByTestId('cleanup-suggest-button').textContent

      await user.click(screen.getByTestId('active-only-toggle'))

      await waitFor(() => expect(screen.queryByText('兩週沒動的')).not.toBeInTheDocument())
      expect(screen.getByTestId('cleanup-suggest-button')).toHaveTextContent(before ?? '')
    })

    it('settings panel exposes the same toggle plus a day slider and says what it does not do', async () => {
      const api = withSessions()
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      expect(await screen.findByText('今天在跑的')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /設定/ }))
      const section = await screen.findByTestId('sidebar-sessions-settings')
      expect(within(section).getByTestId('settings-active-days-output')).toHaveTextContent('4 天')
      expect(screen.getByTestId('sidebar-sessions-fine-print')).toHaveTextContent(/不會刪除任何對話/)
      expect(screen.getByTestId('sidebar-sessions-fine-print')).toHaveTextContent(/10 天規則/)

      // Live preview: the sidebar reacts before 儲存設定 is pressed.
      await user.click(screen.getByTestId('settings-active-only'))
      await waitFor(() => expect(screen.queryByText('兩週沒動的')).not.toBeInTheDocument())

      fireEvent.change(screen.getByTestId('settings-active-days'), { target: { value: '20' } })
      await waitFor(() => expect(screen.getByText('兩週沒動的')).toBeInTheDocument())
      expect(within(section).getByTestId('settings-active-days-output')).toHaveTextContent('20 天')
      expect(screen.getByTestId('session-caption-count')).toHaveTextContent('活躍 20 天')
    })
  })
})
