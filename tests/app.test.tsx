// @vitest-environment jsdom
import React from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/src/App'
import { createDefaultSettings } from '../src/shared/settings'
import { PERMISSION_ASK_ALREADY_NOTICE } from '../src/shared/remote-yolo-mutex'
import type { GrokBridgeApi, RemoteDesktopState, RemoteFocusChangedPayload } from '../src/shared/bridge'
import type { SessionSummary } from '../src/shared/types'

const stylesCss = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer/src/styles.css'),
  'utf8'
)

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
  previewAllowFolder: vi.fn().mockResolvedValue({ ok: false, reason: '找不到檔案，可能已被移動或刪除' }),
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

    expect(screen.getAllByRole('button', { name: /選資料夾開始/ }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    expect(screen.getByRole('button', { name: /Grok 1\.0\.3/ })).toBeDisabled()
  })

  it('deletes a session after the in-app confirmation', async () => {
    const api = createApiMock()
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Fix tests')
    await user.click(screen.getByRole('button', { name: '更多動作 Fix tests' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除對話 Fix tests' }))
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
    expect(screen.getByRole('radio', { name: '深想' })).toHaveAttribute('aria-checked', 'true')
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
    await user.click(screen.getByRole('button', { name: '更多動作 Fix tests' }))
    await user.click(screen.getByRole('menuitem', { name: '重新命名 Fix tests' }))
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

    await user.click(screen.getByRole('button', { name: /Grok 1\.0\.3.*已連線/ }))
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

    await user.click(await screen.findByTestId('new-session-pick-folder'))
    expect(await screen.findByRole('heading', { name: '新對話' })).toBeInTheDocument()
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
    expect(screen.queryByText(/allow_once|reject_once|allow_always|reject_always/)).not.toBeInTheDocument()
    expect(screen.getByText('本次有效')).toBeInTheDocument()
    expect(screen.getByText('本次拒絕')).toBeInTheDocument()
  })

  it('keeps the permission dialog open when the reply fails', async () => {
    const api = createApiMock()
    let onPermission: ((request: Parameters<Parameters<GrokBridgeApi['onPermission']>[0]>[0]) => void) | undefined
    api.onPermission = vi.fn((callback) => { onPermission = callback; return () => {} })
    api.respondPermission = vi.fn().mockRejectedValue(new Error('Permission request is no longer active'))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('Fix tests')
    act(() => { onPermission?.({
      requestId: 'p-fail',
      sessionId: 's1',
      title: '允許修改檔案？',
      options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }]
    }) })
    await user.click(await screen.findByRole('button', { name: /Allow once/ }))
    expect(await screen.findByRole('dialog', { name: '允許修改檔案？' })).toBeInTheDocument()
    expect(api.respondPermission).toHaveBeenCalled()
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
    const sessionSearch = await screen.findByPlaceholderText('搜尋對話')
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

    const sessionSearch = screen.getByPlaceholderText('搜尋對話')
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

    await user.click(await screen.findByTestId('new-session-pick-folder'))
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
    fireEvent.wheel(scroller!, { deltaY: -160 })
    act(() => { onEvent?.({ id: 'away-event', sessionId: 's1', kind: 'message', role: 'assistant', text: 'new output' }) })
    expect(await screen.findByRole('button', { name: /跳到最新/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /選資料夾開始/ }))
    expect(await screen.findByRole('heading', { name: '新對話' })).toBeInTheDocument()
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

  it('T1 keeps the permission-mode buttons usable while busy and explains the refusal', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    let resolveLoad: ((value: { sessionId: string }) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    api.loadSession = vi.fn(() => new Promise<{ sessionId: string }>((resolve) => { resolveLoad = resolve }))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    const group = await screen.findByRole('group', { name: '權限模式' })
    const ask = screen.getByRole('button', { name: '先問我' })
    const yolo = screen.getByRole('button', { name: '全部自動過' })
    // Never disabled: Chromium hides tooltips on disabled controls, so a locked
    // switch used to be a dead end. It stays clickable and says why instead.
    expect(ask).not.toBeDisabled()
    expect(yolo).not.toBeDisabled()
    expect(screen.getByTestId('permission-mode')).not.toHaveAttribute('data-locked')
    expect(screen.getByText('工具權限')).toBeInTheDocument()
    expect(screen.getByText(/改檔或跑指令前會先問你/)).toBeInTheDocument()

    await user.click(await screen.findByText('Fix tests'))
    expect(screen.getByTestId('permission-mode')).toHaveAttribute('data-locked', 'true')
    act(() => { resolveLoad?.({ sessionId: 's1' }) })
    await waitFor(() => expect(screen.getByTestId('permission-mode')).not.toHaveAttribute('data-locked'))

    act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })
    expect(screen.getByTestId('permission-mode')).toHaveAttribute('data-locked', 'true')
    await user.click(yolo)
    expect(await screen.findByText(/回合執行中無法切換工具權限/)).toBeInTheDocument()
    expect(api.setPermissionMode).not.toHaveBeenCalled()
    expect(ask).toHaveAttribute('aria-pressed', 'true')
    expect(yolo).toHaveAttribute('aria-pressed', 'false')
    expect(group).toBeInTheDocument()

    act(() => { onEvent?.({ id: 'turn-done', sessionId: 's1', kind: 'turn', status: 'completed' }) })
    await waitFor(() => expect(screen.getByTestId('permission-mode')).not.toHaveAttribute('data-locked'))
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

    await user.click(await screen.findByRole('button', { name: '全部自動過' }))
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
    const user = userEvent.setup()
    render(<App />)

    const ask = await screen.findByRole('button', { name: '先問我' })
    expect(ask).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '全部自動過' })).toHaveAttribute('aria-pressed', 'false')
    expect(api.getPermissionMode).toHaveBeenCalled()
    expect(screen.queryByText(/YOLO 模式：已啟用一律核准/)).not.toBeInTheDocument()
    await user.click(ask)
    expect(await screen.findByText(PERMISSION_ASK_ALREADY_NOTICE)).toBeInTheDocument()
  })

  it('marks titlebar permission controls as no-drag so they stay clickable', () => {
    expect(stylesCss).toMatch(/\.titlebar select[^{]*\{[^}]*-webkit-app-region:\s*no-drag/)
    expect(stylesCss).toMatch(/\.permission-mode-label[^{]*\{[^}]*-webkit-app-region:\s*no-drag/)
  })

  it('composer status follows activeReady instead of showing green 就緒 while loading', async () => {
    const api = createApiMock()
    let resolveLoad: ((value: { sessionId: string }) => void) | undefined
    api.loadSession = vi.fn(() => new Promise<{ sessionId: string }>((resolve) => { resolveLoad = resolve }))
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    const pill = await screen.findByTestId('composer-status')
    expect(pill.querySelector('.composer-status-pill')?.className ?? '').not.toContain('is-ready')
    expect(screen.queryByText('就緒')).not.toBeInTheDocument()
    expect(screen.getByText('載入中')).toBeInTheDocument()

    act(() => { resolveLoad?.({ sessionId: 's1' }) })
    await waitFor(() => {
      expect(document.querySelector('.composer-status-pill')?.className ?? '').toContain('is-ready')
    })
    expect(screen.getByText('就緒')).toBeInTheDocument()
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
    await user.click(screen.getByTestId('sidebar-organize-toggle'))
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
    await user.click(screen.getByRole('button', { name: '更多動作 Fix tests' }))
    await user.click(screen.getByRole('menuitem', { name: '釘選 Fix tests' }))
    expect(await screen.findByText('已釘選')).toBeInTheDocument()
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ pinnedSessions: ['s1'] }))
  })

  it('T6 can reopen the sidebar after collapsing it on the empty home state', async () => {
    window.grokApi = createApiMock()
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('Fix tests')
    expect(screen.getAllByRole('button', { name: '選資料夾開始' }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/按「選資料夾開始」/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '收合側欄' }))
    expect(document.querySelector('.workspace')).toHaveClass('sidebar-collapsed')
    expect(document.querySelector('.sidebar-expand-float')).toBeNull()
    await user.click(screen.getByRole('button', { name: '展開側欄' }))
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

    it('closes the leftover plan dialog when the turn ends, and Escape answers request-changes', async () => {
      const api = createApiMock()
      let onPlan: ((request: never) => void) | undefined
      let onEvent: ((event: { id: string; sessionId: string; kind: 'turn'; status: 'cancelled' }) => void) | undefined
      api.onPlanApproval = vi.fn((callback) => { onPlan = callback as never; return () => {} })
      api.onEvent = vi.fn((callback) => { onEvent = callback as never; return () => {} })
      window.grokApi = api
      render(<App />)
      expect(await screen.findByText('Fix tests')).toBeInTheDocument()

      act(() => { onPlan?.({ requestId: 'plan:esc', sessionId: 's1', toolCallId: 'c', planContent: '計畫' } as never) })
      expect(await screen.findByTestId('plan-approval-modal')).toBeInTheDocument()
      await userEvent.setup().keyboard('{Escape}')
      await waitFor(() => expect(api.respondPlanApproval).toHaveBeenCalledWith('plan:esc', 'request-changes'))
      expect(screen.queryByTestId('plan-approval-modal')).not.toBeInTheDocument()

      act(() => { onPlan?.({ requestId: 'plan:turn', sessionId: 's1', toolCallId: 'c2', planContent: '計畫' } as never) })
      expect(await screen.findByTestId('plan-approval-modal')).toBeInTheDocument()
      act(() => { onEvent?.({ id: 't1', sessionId: 's1', kind: 'turn', status: 'cancelled' }) })
      await waitFor(() => expect(screen.queryByTestId('plan-approval-modal')).not.toBeInTheDocument())
      expect(api.respondPlanApproval).not.toHaveBeenCalledWith('plan:turn', expect.anything())
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
      await user.click(screen.getByTestId('sidebar-organize-toggle'))
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

    it('lets 建議清理 delete a session that the active filter has hidden', async () => {
      const api = withSessions()
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      expect(await screen.findByText('兩週沒動的')).toBeInTheDocument()

      await user.click(screen.getByTestId('active-only-toggle'))
      await waitFor(() => expect(screen.queryByText('兩週沒動的')).not.toBeInTheDocument())

      await user.click(screen.getByTestId('sidebar-organize-toggle'))
      await user.click(screen.getByTestId('cleanup-suggest-button'))
      const panel = await screen.findByTestId('cleanup-suggest-panel')
      const stale = within(panel).getByText('兩週沒動的')
      await user.click(stale.closest('label')!.querySelector('input')!)
      await user.click(screen.getByTestId('cleanup-batch-delete'))

      const confirm = await screen.findByRole('dialog', { name: '批次刪除確認' })
      expect(confirm).toHaveTextContent('將刪除 1 則對話')
    })
  })

  describe('sidebar findability', () => {
    it('sorts by name and persists the choice', async () => {
      const api = createApiMock()
      api.listSessions = vi.fn().mockResolvedValue([
        { id: 's1', cwd: 'C:\\repo', title: 'Zed last', updatedAt: '2026-08-21T12:00:00Z' },
        { id: 's2', cwd: 'C:\\repo', title: 'Alpha first', updatedAt: '2026-08-21T11:00:00Z' }
      ])
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await screen.findByText('Zed last')
      const sort = screen.getByLabelText('對話排序')
      await user.selectOptions(sort, 'name')
      const titles = [...screen.getByTestId('session-list').querySelectorAll('.session-open')].map((node) => node.textContent)
      expect(titles[0]).toContain('Alpha first')
      expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ sidebarSort: 'name' }))
    })

    it('can turn off folder grouping and persists that', async () => {
      const api = createApiMock()
      api.listSessions = vi.fn().mockResolvedValue([
        { id: 's1', cwd: 'C:\\work\\alpha', title: 'Alpha task', updatedAt: '2026-08-21T12:00:00Z' },
        { id: 's2', cwd: 'C:\\work\\beta', title: 'Beta task', updatedAt: '2026-08-21T11:00:00Z' }
      ])
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await screen.findByText('Alpha task')
      expect(screen.getAllByTestId('session-group-title').length).toBe(2)
      await user.click(screen.getByTestId('group-by-folder-toggle'))
      await waitFor(() => expect(screen.queryByTestId('session-group-title')).not.toBeInTheDocument())
      expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ sidebarGroupByFolder: false }))
      expect(within(screen.getByTestId('session-list')).getByText('C:\\work\\alpha')).toBeInTheDocument()
    })

    it('shows folder basename plus count, with the full path only as title', async () => {
      const api = createApiMock()
      api.listSessions = vi.fn().mockResolvedValue([
        { id: 's1', cwd: 'C:\\work\\alpha', title: 'One', updatedAt: '2026-08-21T12:00:00Z' },
        { id: 's2', cwd: 'C:\\work\\alpha', title: 'Two', updatedAt: '2026-08-21T11:00:00Z' }
      ])
      window.grokApi = api
      render(<App />)
      await screen.findByText('One')
      const option = screen.getByRole('option', { name: 'alpha（2）' })
      expect(option).toHaveAttribute('title', 'C:\\work\\alpha')
      expect(option.textContent).toBe('alpha（2）')
      expect(option.textContent).not.toContain('C:\\work\\alpha')
    })

    it('filters to a project when the group header is clicked, and clears on the second click', async () => {
      const api = createApiMock()
      api.listSessions = vi.fn().mockResolvedValue([
        { id: 's1', cwd: 'C:\\work\\alpha', title: 'Alpha task', updatedAt: '2026-08-21T12:00:00Z' },
        { id: 's2', cwd: 'C:\\work\\beta', title: 'Beta task', updatedAt: '2026-08-21T11:00:00Z' }
      ])
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await screen.findByText('Alpha task')
      await user.click(screen.getByRole('button', { name: '篩選「alpha」' }))
      expect(screen.getByTestId('session-caption-count')).toHaveTextContent('已篩選')
      expect(screen.queryByText('Beta task')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '篩選「alpha」' }))
      expect(await screen.findByText('Beta task')).toBeInTheDocument()
    })

    it('lets the sidebar change the active-days window', async () => {
      const api = createApiMock()
      const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString()
      api.listSessions = vi.fn().mockResolvedValue([
        { id: 'fresh', cwd: 'C:\\repo', title: '今天在跑的', updatedAt: daysAgo(0.5) },
        { id: 'week', cwd: 'C:\\repo', title: '一週沒動的', updatedAt: daysAgo(7) }
      ])
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await screen.findByText('一週沒動的')
      await user.click(screen.getByTestId('active-only-toggle'))
      await waitFor(() => expect(screen.queryByText('一週沒動的')).not.toBeInTheDocument())
      fireEvent.change(screen.getByTestId('sidebar-active-days'), { target: { value: '10' } })
      expect(await screen.findByText('一週沒動的')).toBeInTheDocument()
      expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ sidebarActiveDays: 10 }))
    })

    it('keeps 多選 and 建議清理 inside 整理', async () => {
      window.grokApi = createApiMock()
      const user = userEvent.setup()
      render(<App />)
      await screen.findByText('Fix tests')
      expect(screen.queryByRole('button', { name: '多選' })).not.toBeInTheDocument()
      expect(screen.queryByTestId('cleanup-suggest-button')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('sidebar-organize-toggle'))
      expect(screen.getByRole('button', { name: '多選' })).toBeInTheDocument()
    })

    it('opens row actions from a keyboard-accessible ⋯ menu', async () => {
      window.grokApi = createApiMock()
      const user = userEvent.setup()
      render(<App />)
      await screen.findByText('Fix tests')
      expect(screen.queryByRole('menuitem', { name: '釘選 Fix tests' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '更多動作 Fix tests' }))
      expect(screen.getByRole('menuitem', { name: '釘選 Fix tests' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: '重新命名 Fix tests' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: '刪除對話 Fix tests' })).toBeInTheDocument()
    })

    it('shows relative time on rows', async () => {
      const api = createApiMock()
      api.listSessions = vi.fn().mockResolvedValue([
        { id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: new Date(Date.now() - 3 * 60_000).toISOString() }
      ])
      window.grokApi = api
      render(<App />)
      expect(await screen.findByText('3 分鐘前')).toBeInTheDocument()
    })

    it('reopens one of the last three project folders from the welcome page', async () => {
      const api = createApiMock()
      api.listSessions = vi.fn().mockResolvedValue([])
      api.getSettings = vi.fn().mockResolvedValue({
        ...createDefaultSettings('C:\\Users\\demo'),
        recentProjectCwds: ['C:\\work\\alpha', 'C:\\work\\beta', 'C:\\work\\gamma']
      })
      api.createSession = vi.fn().mockResolvedValue({ sessionId: 's-reopen' })
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      const welcome = await screen.findByTestId('welcome-recent-projects')
      expect(welcome).toHaveTextContent('alpha')
      expect(welcome).toHaveTextContent('beta')
      expect(welcome).toHaveTextContent('gamma')
      expect(screen.queryByRole('button', { name: /先不選專案/ })).not.toBeInTheDocument()
      await user.click(within(welcome).getByRole('button', { name: 'alpha' }))
      await waitFor(() => expect(api.createSession).toHaveBeenCalledWith('C:\\work\\alpha'))
      expect(api.chooseDirectory).not.toHaveBeenCalled()
    })

    it('filter chips can express 全部 / 本專案 / 釘選 / 活躍', async () => {
      const api = createApiMock()
      api.listSessions = vi.fn().mockResolvedValue([
        { id: 's1', cwd: 'C:\\work\\alpha', title: 'Alpha task', updatedAt: new Date().toISOString() },
        { id: 's2', cwd: 'C:\\work\\beta', title: 'Beta task', updatedAt: new Date().toISOString() }
      ])
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await screen.findByText('Alpha task')
      const chips = screen.getByTestId('sidebar-filter-chips')
      expect(within(chips).getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
      await user.click(within(chips).getByRole('button', { name: '本專案' }))
      expect(screen.getByTestId('session-caption-count')).toHaveTextContent('已篩選')
      await user.click(within(chips).getByRole('button', { name: '全部' }))
      expect(await screen.findByText('Beta task')).toBeInTheDocument()
      await user.click(within(chips).getByRole('button', { name: '活躍' }))
      expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ sidebarActiveOnly: true }))
    })
  })

  it('reuses a hydrated session instead of wiping the transcript and blanking Context', async () => {
    const api = createApiMock()
    api.listSessions = vi.fn().mockResolvedValue([
      { id: 's1', cwd: 'C:\\repo-a', title: '長對話', updatedAt: '2026-08-17T00:00:00Z' },
      { id: 's2', cwd: 'C:\\repo-b', title: '另一則', updatedAt: '2026-08-17T01:00:00Z' }
    ])
    const loadSession = vi.fn().mockImplementation(async (sessionId: string) => ({ sessionId }))
    api.loadSession = loadSession
    api.getUsage = vi.fn().mockImplementation(async (sessionId: string) => (
      sessionId === 's1'
        ? { sessionId, contextTokensUsed: 311_000, contextWindowTokens: 500_000, contextWindowUsage: 62 }
        : { sessionId, contextTokensUsed: 10_000, contextWindowTokens: 500_000, contextWindowUsage: 2 }
    ))
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    const eventTexts = (sessionId: string): string[] =>
      (window.__grokSmoke?.getSessionEvents(sessionId) ?? [])
        .flatMap((event) => event.kind === 'message' || event.kind === 'thought' ? [event.text] : [])

    await user.click(await screen.findByText('長對話'))
    await waitFor(() => expect(loadSession).toHaveBeenCalledWith('s1', 'C:\\repo-a'))
    expect(await screen.findByRole('heading', { name: '長對話' })).toBeInTheDocument()
    act(() => {
      onEvent?.({ id: 's1-msg', sessionId: 's1', kind: 'message', role: 'assistant', text: '長回覆還在' })
    })
    await waitFor(() => expect(eventTexts('s1')).toContain('長回覆還在'))
    await waitFor(() => expect(screen.getByLabelText('Context 視窗用量')).toHaveTextContent('62%'))

    await user.click(screen.getByText('另一則'))
    await waitFor(() => expect(loadSession).toHaveBeenCalledWith('s2', 'C:\\repo-b'))
    await waitFor(() => expect(screen.getByLabelText('Context 視窗用量')).toHaveTextContent('2%'))

    const loadsAfterFirstPass = loadSession.mock.calls.length
    await user.click(screen.getByText('長對話'))
    expect(await screen.findByRole('heading', { name: '長對話' })).toBeInTheDocument()
    expect(eventTexts('s1')).toContain('長回覆還在')
    expect(screen.getByLabelText('Context 視窗用量')).toHaveTextContent('62%')
    expect(loadSession.mock.calls.length).toBe(loadsAfterFirstPass)
  })

  it('creates a session in the project folder from the group + button without asking for a folder', async () => {
    const api = createApiMock()
    api.createSession = vi.fn().mockResolvedValue({ sessionId: 's-from-plus' })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Fix tests')).toBeInTheDocument()
    await user.click(screen.getByTestId('session-group-add'))
    await waitFor(() => expect(api.createSession).toHaveBeenCalledWith('C:\\repo'))
    expect(api.chooseDirectory).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: '新對話' })).toBeInTheDocument()

    const loadSession = vi.fn().mockImplementation(async (sessionId: string) => ({ sessionId }))
    api.loadSession = loadSession
    await user.click(screen.getByText('Fix tests'))
    await waitFor(() => expect(loadSession).toHaveBeenCalledWith('s1', 'C:\\repo'))
    const loadsAfterCreate = loadSession.mock.calls.length
    await user.click(within(screen.getByTestId('session-list')).getByText('新對話'))
    expect(await screen.findByRole('heading', { name: '新對話' })).toBeInTheDocument()
    expect(loadSession.mock.calls.some((call) => call[0] === 's-from-plus')).toBe(false)
    expect(loadSession.mock.calls.length).toBe(loadsAfterCreate)
  })

  it('surfaces a notice when project + create returns no session id', async () => {
    const api = createApiMock()
    api.createSession = vi.fn().mockResolvedValue({})
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Fix tests')).toBeInTheDocument()
    await user.click(screen.getByTestId('session-group-add'))
    expect(await screen.findByText('建立對話失敗：未回傳 sessionId')).toBeInTheDocument()
  })

  it('surfaces a notice when project + create returns a blank session id', async () => {
    const api = createApiMock()
    api.createSession = vi.fn().mockResolvedValue({ sessionId: '   ' })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Fix tests')).toBeInTheDocument()
    await user.click(screen.getByTestId('session-group-add'))
    expect(await screen.findByText('建立對話失敗：未回傳 sessionId')).toBeInTheDocument()
  })

  it('lists a created session when the connection generation went stale', async () => {
    const api = createApiMock()
    api.createSession = vi.fn().mockResolvedValue({ sessionId: 's-stale', connectionStale: true })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByText('Fix tests')).toBeInTheDocument()
    await user.click(screen.getByTestId('session-group-add'))
    expect(await screen.findByText('連線已更新，請再點一次剛建立的對話')).toBeInTheDocument()
    expect(within(screen.getByTestId('session-list')).getByText('新對話')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '新對話' })).not.toBeInTheDocument()
  })

  it('does not let a stale load failure wipe a newer successful transcript', async () => {
    const api = createApiMock()
    let onStatus: ((next: { connected?: boolean }) => void) | undefined
    api.onStatus = vi.fn((callback) => { onStatus = callback; return () => {} })
    let rejectFirst: ((error: Error) => void) | undefined
    let first = true
    const loadSession = vi.fn().mockImplementation(async () => {
      if (first) {
        first = false
        return new Promise((_resolve, reject) => { rejectFirst = reject })
      }
      return { sessionId: 's1' }
    })
    api.loadSession = loadSession
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(1))
    act(() => { onStatus?.({ connected: false }) })
    await user.click(within(screen.getByTestId('session-list')).getByText('Fix tests'))
    await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Fix tests' })).toBeInTheDocument()
    act(() => {
      onEvent?.({ id: 'kept', sessionId: 's1', kind: 'message', role: 'assistant', text: '新載入還在' })
    })
    await waitFor(() => {
      const texts = (window.__grokSmoke?.getSessionEvents('s1') ?? [])
        .flatMap((event) => event.kind === 'message' || event.kind === 'thought' ? [event.text] : [])
      expect(texts).toContain('新載入還在')
    })
    act(() => { rejectFirst?.(new Error('舊載入失敗')) })
    await waitFor(() => {
      const texts = (window.__grokSmoke?.getSessionEvents('s1') ?? [])
        .flatMap((event) => event.kind === 'message' || event.kind === 'thought' ? [event.text] : [])
      expect(texts).toContain('新載入還在')
    })
    expect(screen.queryByText('舊載入失敗')).not.toBeInTheDocument()
  })

  it('does not let a stale desktop load failure wipe a newer remote-load transcript', async () => {
    const api = createApiMock()
    let onStatus: ((next: { connected?: boolean }) => void) | undefined
    api.onStatus = vi.fn((callback) => { onStatus = callback; return () => {} })
    let onRemoteState: ((state: RemoteDesktopState) => void) | undefined
    api.onRemoteState = vi.fn((callback) => { onRemoteState = callback; return () => {} })
    let rejectFirst: ((error: Error) => void) | undefined
    const loadSession = vi.fn().mockImplementation(async () => new Promise((_resolve, reject) => { rejectFirst = reject }))
    api.loadSession = loadSession
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(1))
    act(() => { onStatus?.({ connected: false }) })
    act(() => {
      onRemoteState?.({
        enabled: false, banner: 'off', pin: null, pairingSecret: null, expiresAt: null,
        publicBaseUrl: null, allowPhonePermissions: false, experimentalTunnel: false,
        focusSessionId: 's1', focusStatus: 'loading'
      })
    })
    act(() => {
      onRemoteState?.({
        enabled: false, banner: 'off', pin: null, pairingSecret: null, expiresAt: null,
        publicBaseUrl: null, allowPhonePermissions: false, experimentalTunnel: false,
        focusSessionId: 's1', focusStatus: 'ready'
      })
    })
    act(() => {
      onEvent?.({ id: 'remote-kept', sessionId: 's1', kind: 'message', role: 'assistant', text: 'remote 載入還在' })
    })
    await waitFor(() => {
      const texts = (window.__grokSmoke?.getSessionEvents('s1') ?? [])
        .flatMap((event) => event.kind === 'message' || event.kind === 'thought' ? [event.text] : [])
      expect(texts).toContain('remote 載入還在')
    })
    act(() => { rejectFirst?.(new Error('舊載入失敗')) })
    await waitFor(() => {
      const texts = (window.__grokSmoke?.getSessionEvents('s1') ?? [])
        .flatMap((event) => event.kind === 'message' || event.kind === 'thought' ? [event.text] : [])
      expect(texts).toContain('remote 載入還在')
    })
    expect(screen.queryByText('舊載入失敗')).not.toBeInTheDocument()
  })

  it('does not let a remote ready echo cancel an in-flight desktop load', async () => {
    const api = createApiMock()
    let onRemoteState: ((state: RemoteDesktopState) => void) | undefined
    api.onRemoteState = vi.fn((callback) => { onRemoteState = callback; return () => {} })
    let resolveFirst: ((value: { sessionId: string }) => void) | undefined
    let first = true
    const loadSession = vi.fn().mockImplementation(async () => {
      if (first) {
        first = false
        return new Promise((resolve) => { resolveFirst = resolve })
      }
      return { sessionId: 's1' }
    })
    api.loadSession = loadSession
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByText('Fix tests'))
    await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(1))
    act(() => {
      onRemoteState?.({
        enabled: false, banner: 'off', pin: null, pairingSecret: null, expiresAt: null,
        publicBaseUrl: null, allowPhonePermissions: false, experimentalTunnel: false,
        focusSessionId: 's1', focusStatus: 'ready'
      })
    })
    act(() => { resolveFirst?.({ sessionId: 's1' }) })
    await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('heading', { name: 'Fix tests' })).toBeInTheDocument()
    await user.click(within(screen.getByTestId('session-list')).getByText('Fix tests'))
    expect(loadSession).toHaveBeenCalledTimes(1)
  })

  it('does not re-apply a stale focus-changed loading after remote ready', async () => {
    const api = createApiMock()
    let onRemoteState: ((state: RemoteDesktopState) => void) | undefined
    api.onRemoteState = vi.fn((callback) => { onRemoteState = callback; return () => {} })
    let onFocusChanged: ((payload: RemoteFocusChangedPayload) => void) | undefined
    api.onRemoteFocusChanged = vi.fn((callback) => { onFocusChanged = callback; return () => {} })
    let listMode: 'empty' | 'pending' | 'ready' = 'empty'
    let pendingList: Promise<SessionSummary[]> | null = null
    let resolveList: ((list: SessionSummary[]) => void) | undefined
    const sessionList = [{ id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: '2026-07-11T00:00:00Z' }]
    api.listSessions = vi.fn().mockImplementation(async () => {
      if (listMode === 'empty') return []
      if (listMode === 'pending') {
        if (!pendingList) pendingList = new Promise((resolve) => { resolveList = resolve })
        return pendingList
      }
      return sessionList
    })
    window.grokApi = api
    render(<App />)
    await waitFor(() => expect(api.listSessions).toHaveBeenCalled())

    listMode = 'pending'
    act(() => { onFocusChanged?.({ sessionId: 's1', focusStatus: 'loading' }) })
    const remoteState = (focusStatus: 'loading' | 'ready'): RemoteDesktopState => ({
      enabled: false, banner: 'off', pin: null, pairingSecret: null, expiresAt: null,
      publicBaseUrl: null, allowPhonePermissions: false, experimentalTunnel: false,
      focusSessionId: 's1', focusStatus
    })
    act(() => { onRemoteState?.(remoteState('loading')) })
    act(() => { onRemoteState?.(remoteState('ready')) })
    listMode = 'ready'
    act(() => { resolveList?.(sessionList) })

    expect(await screen.findByRole('heading', { name: 'Fix tests' })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelector('.composer-status-pill')?.className ?? '').not.toContain('is-busy')
    })
    expect(screen.queryByText('手機焦點對話載入中…')).not.toBeInTheDocument()
  })

  it('opens the YOLO confirm instead of queueing /always-approve as the next turn', async () => {
    const api = createApiMock()
    let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
    api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText('Fix tests'))
    act(() => { onEvent?.({ id: 'turn', sessionId: 's1', kind: 'turn', status: 'running' }) })
    expect(await screen.findByRole('button', { name: '排隊下一輪' })).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/回合進行中可插話|交給 Grok 一個任務/), '/always-approve')
    await user.click(screen.getByRole('button', { name: '排隊下一輪' }))
    expect(await screen.findByText(/回合執行中無法切換工具權限/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '啟用 YOLO 模式' })).not.toBeInTheDocument()
    expect(api.sendPrompt).not.toHaveBeenCalled()
    act(() => { onEvent?.({ id: 'turn-done', sessionId: 's1', kind: 'turn', status: 'completed' }) })
    expect(api.sendPrompt).not.toHaveBeenCalled()
  })

  it('opens the YOLO confirm instead of inserting /always-approve into the draft', async () => {
    const api = createApiMock()
    api.connect = vi.fn().mockResolvedValue({
      loadSession: true,
      promptCapabilities: {},
      sessionCapabilities: {},
      modes: [],
      commands: [{ name: 'always-approve', description: 'Toggle always-approve mode' }]
    })
    window.grokApi = api
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByText(/Grok 1.0.3/))
    await waitFor(() => expect(api.connect).toHaveBeenCalled())
    await user.click(await screen.findByText('Fix tests'))
    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}')
    const search = screen.getByRole('combobox', { name: '搜尋命令' })
    await user.type(search, 'always-approve')
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: '啟用 YOLO 模式' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/交給 Grok 一個任務/)).toHaveValue('')
    expect(api.sendPrompt).not.toHaveBeenCalled()
  })

  describe('wave 4 workspace chrome', () => {
    it('keeps session-header from wrapping over the transcript and folds tools at 1100px', () => {
      expect(stylesCss).toMatch(/\.session-header\s*\{[^}]*flex-wrap:\s*nowrap/)
      expect(stylesCss).toMatch(/\.session-tools\s*\{[^}]*flex-wrap:\s*nowrap/)
      expect(stylesCss).toMatch(/@media \(max-width: 1100px\)[\s\S]*\.session-tool-icons\s*\{\s*display:\s*none/)
      expect(stylesCss).toMatch(/@media \(max-width: 1100px\)[\s\S]*\.session-tools-more\s*\{\s*display:\s*inline-grid/)
      expect(stylesCss).toMatch(/\.main:has\(\.session-header\)\s*~\s*\.drawer\s*\{\s*top:\s*82px/)
    })

    it('widens bookmarks to two lines and pads the command palette list', () => {
      expect(stylesCss).toMatch(/\.prompt-bookmarks-panel[^{]*\{[^}]*width:\s*min\(520px/)
      expect(stylesCss).toMatch(/-webkit-line-clamp:\s*2/)
      expect(stylesCss).toMatch(/\.palette-results\s*\{[^}]*padding:\s*8px 8px 32px/)
    })

    it('copies the session cwd from the header button', async () => {
      window.grokApi = createApiMock()
      const user = userEvent.setup()
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
      render(<App />)
      await user.click(await screen.findByText('Fix tests'))
      fireEvent.click(await screen.findByTestId('copy-cwd'))
      expect(writeText).toHaveBeenCalledWith('C:\\repo')
      expect(await screen.findByText('已複製路徑')).toBeInTheDocument()
    })

    it('keeps Stop as the primary running-rail action and defaults the composer to 3 rows', async () => {
      const api = createApiMock()
      let onEvent: ((event: Parameters<Parameters<GrokBridgeApi['onEvent']>[0]>[0]) => void) | undefined
      api.onEvent = vi.fn((callback) => { onEvent = callback; return () => {} })
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await user.click(await screen.findByText('Fix tests'))
      const composer = screen.getByPlaceholderText(/交給 Grok 一個任務/)
      expect(composer).toHaveAttribute('rows', '3')
      expect(screen.getByTestId('session-tools-more')).toHaveAttribute('aria-label', '更多工具')
      act(() => { onEvent?.({ id: 'turn-run', sessionId: 's1', kind: 'turn', status: 'running' }) })
      const rail = await screen.findByTestId('command-rail')
      const stop = within(rail).getByTestId('stop-button')
      expect(stop.compareDocumentPosition(within(rail).getByTestId('interject-button')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
      expect(stop).toHaveTextContent('停止')
    })
  })

  describe('wave 5 readable Chinese', () => {
    it('shows Chinese eyebrows, connection status, transcript end, and attach tooltip', async () => {
      const api = createApiMock()
      api.getStatus = vi.fn().mockResolvedValue({ executable: 'C:\\Users\\demo\\.grok\\bin\\grok.exe', found: true, version: '1.0.3', connected: true })
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      expect((await screen.findAllByText('銀河座艙')).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: /Grok 1\.0\.3 · 已連線/ })).toBeInTheDocument()
      await user.click(screen.getByText('Fix tests'))
      expect(screen.getByText('目前對話')).toBeInTheDocument()
      expect(screen.getByText('以上是目前載入的內容')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '加入檔案' })).toHaveAttribute('title', '加入檔案或資料夾，也可直接拖進來')
    })

    it('shows Chinese shortcut names in settings and grouped palette plus help overlay extras', async () => {
      window.grokApi = createApiMock()
      const user = userEvent.setup()
      render(<App />)
      await user.click(await screen.findByText('Fix tests'))
      await screen.findByPlaceholderText(/交給 Grok 一個任務/)
      await user.click(screen.getByRole('button', { name: '設定' }))
      const shortcutRow = await screen.findByTestId('shortcut-row-searchTranscript')
      expect(within(shortcutRow).getByText('搜尋目前對話')).toBeInTheDocument()
      expect(within(shortcutRow).getByText('searchTranscript')).toBeInTheDocument()
      await user.keyboard('{Escape}')

      await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}')
      expect(await screen.findByTestId('palette-group-screen')).toHaveTextContent('畫面動作')
      expect(screen.getByTestId('palette-group-slash')).toHaveTextContent('斜線指令')
      await user.keyboard('{Escape}')

      await user.keyboard('?')
      const help = await screen.findByRole('dialog', { name: '快捷鍵一覽' })
      expect(within(help).getByText('快捷鍵')).toBeInTheDocument()
      expect(within(help).getByText('開關預覽')).toBeInTheDocument()
      expect(within(help).getByText('在此資料夾開新對話')).toBeInTheDocument()
      expect(within(help).getByText('工具權限：先問我／全部自動過')).toBeInTheDocument()
    })

    it('uses short Chinese feature groups and a human delete confirm without CLI copy', async () => {
      window.grokApi = createApiMock()
      const user = userEvent.setup()
      render(<App />)
      await user.click(await screen.findByRole('button', { name: '功能矩陣' }))
      const drawer = (await screen.findByRole('heading', { name: '能做' })).closest('.drawer') as HTMLElement
      expect(within(drawer).getByText('功能一覽')).toBeInTheDocument()
      expect(within(drawer).getByRole('heading', { name: '還不能做' })).toBeInTheDocument()
      expect(drawer.textContent ?? '').not.toMatch(/CAPABILITY ROUTER/)

      await user.click(screen.getByText('Fix tests'))
      await user.click(screen.getByRole('button', { name: '更多動作 Fix tests' }))
      await user.click(screen.getByRole('menuitem', { name: '刪除對話 Fix tests' }))
      const confirm = screen.getByRole('dialog', { name: '刪除對話確認' })
      expect(within(confirm).getByText('無法復原')).toBeInTheDocument()
      expect(confirm.textContent ?? '').not.toMatch(/grok sessions delete/)
    })

    it('keeps 切換帳號 readable in the light theme at 1200px', () => {
      expect(stylesCss).toMatch(/@media \(max-width: 1200px\)[\s\S]*\.app\[data-theme='light'\] \.account-pill[\s\S]*font-size:\s*10px/)
    })
  })

  describe('wave 6 fewer clicks', () => {
    it('auto-connects in the background when CLI is found and not connected', async () => {
      const api = createApiMock()
      window.grokApi = api
      render(<App />)
      await waitFor(() => expect(api.connect).toHaveBeenCalled())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByRole('button', { name: /Grok 1\.0\.3 · 已連線/ })).toBeInTheDocument()
    })

    it('shows a closable notice instead of a modal when startup connect fails', async () => {
      const api = createApiMock()
      api.connect = vi.fn().mockRejectedValue(new Error('ACP 啟動失敗'))
      window.grokApi = api
      const user = userEvent.setup()
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
      render(<App />)
      const notice = await screen.findByTestId('app-notice')
      expect(notice).toHaveTextContent('ACP 啟動失敗')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('notice-copy'))
      expect(writeText).toHaveBeenCalledWith('ACP 啟動失敗')
      await user.click(screen.getByTestId('notice-close'))
      expect(screen.queryByTestId('app-notice')).not.toBeInTheDocument()
    })

    it('lets notice action buttons receive pointer events', () => {
      expect(stylesCss).toMatch(/\.notice button[\s\S]*pointer-events:\s*auto/)
    })

    it('opens the remote section from the settings button', async () => {
      window.grokApi = createApiMock()
      const user = userEvent.setup()
      render(<App />)
      await user.click(await screen.findByRole('button', { name: '設定' }))
      await user.click(await screen.findByTestId('settings-open-remote'))
      expect(await screen.findByTestId('remote-panel')).toBeInTheDocument()
      expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument()
    })

    it('reorders last-used prompt templates to the front', async () => {
      const api = createApiMock()
      window.grokApi = api
      const user = userEvent.setup()
      render(<App />)
      await user.click(await screen.findByText('Fix tests'))
      await screen.findByPlaceholderText(/交給 Grok 一個任務/)
      const row = await screen.findByTestId('prompt-templates')
      const plan = within(row).getByRole('button', { name: '先做計畫' })
      await waitFor(() => expect(plan).not.toBeDisabled())
      expect(within(row).getAllByRole('button')[0]).toHaveTextContent('程式審查')
      await user.click(plan)
      await waitFor(() => {
        expect(within(screen.getByTestId('prompt-templates')).getAllByRole('button')[0]).toHaveTextContent('先做計畫')
      })
      expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ recentPromptTemplates: ['plan'] }))
    })

    it('keeps a compact Agents Team toggle available', async () => {
      window.grokApi = createApiMock()
      render(<App />)
      const toggle = await screen.findByTestId('agents-team-toggle')
      expect(toggle).toBeInTheDocument()
      expect(toggle.className).toMatch(/compact/)
      expect(stylesCss).toMatch(/\.team-toggle[^{]*\{[^}]*height:\s*24px/)
    })
  })
})
