// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/src/App'
import { createDefaultSettings } from '../src/shared/settings'

describe('App', () => {
  it('shows CLI status and existing sessions without a terminal surface', async () => {
    window.grokApi = {
      getStatus: vi.fn().mockResolvedValue({ executable: 'C:\\Users\\111\\.grok\\bin\\grok.exe', found: true, version: '0.2.93', connected: false }),
      connect: vi.fn().mockResolvedValue({ loadSession: true, promptCapabilities: {}, sessionCapabilities: {}, modes: [], commands: [] }),
      listSessions: vi.fn().mockResolvedValue([{ id: 's1', cwd: 'C:\\repo', title: 'Fix tests', updatedAt: '2026-07-11T00:00:00Z' }]),
      getSettings: vi.fn().mockResolvedValue(createDefaultSettings('C:\\Users\\111')),
      saveSettings: vi.fn(), createSession: vi.fn(), loadSession: vi.fn(), sendPrompt: vi.fn(), cancel: vi.fn(), setMode: vi.fn(), setConfigOption: vi.fn(),
      respondPermission: vi.fn(), chooseDirectory: vi.fn(), chooseFiles: vi.fn(), exportSession: vi.fn(), openTui: vi.fn(), openExternal: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}), onPermission: vi.fn().mockReturnValue(() => {}), onStatus: vi.fn().mockReturnValue(() => {})
    }
    render(<App />)
    expect(await screen.findByText('Fix tests')).toBeInTheDocument()
    expect(screen.getByText(/Grok 0.2.93/)).toBeInTheDocument()
    expect(screen.queryByText('Terminal')).not.toBeInTheDocument()
  })
})
