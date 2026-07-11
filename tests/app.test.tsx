// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/src/App'
import { createDefaultSettings } from '../src/shared/settings'
import type { GrokBridgeApi } from '../src/shared/bridge'

const createApiMock = (): GrokBridgeApi => ({
  getStatus: vi.fn().mockResolvedValue({ executable: 'C:\\Users\\111\\.grok\\bin\\grok.exe', found: true, version: '0.2.93', connected: false }),
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
  getSettings: vi.fn().mockResolvedValue(createDefaultSettings('C:\\Users\\111')),
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
    expect(screen.getByLabelText('GrokBuild 已使用 50%')).toBeInTheDocument()
    expect(screen.getByText(/7\/17 重置/)).toBeInTheDocument()
    expect(api.getBilling).toHaveBeenCalled()
  })

  it('mounts cursor decoration only when the saved accessibility settings allow it', async () => {
    const api = createApiMock()
    window.grokApi = api
    const first = render(<App />)

    expect(await screen.findByTestId('cursor-fx')).toBeInTheDocument()
    first.unmount()

    const reduced = createDefaultSettings('C:\\Users\\111')
    reduced.effects.reducedMotion = true
    api.getSettings = vi.fn().mockResolvedValue(reduced)
    render(<App />)
    await screen.findByText('Fix tests')
    expect(screen.queryByTestId('cursor-fx')).not.toBeInTheDocument()
  })

  it('restores and persists a session draft without losing unfinished text', async () => {
    const api = createApiMock()
    const saved = createDefaultSettings('C:\\Users\\111')
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
})
