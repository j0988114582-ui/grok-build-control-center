// @vitest-environment jsdom
import React from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette, rankCommands, type PaletteCommand } from '../src/renderer/src/components/CommandPalette'

const stylesCss = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/renderer/src/styles.css'),
  'utf8'
)

const commands: PaletteCommand[] = [
  { id: 'new', label: '建立新對話', keywords: 'new session 專案', onRun: vi.fn() },
  { id: 'search', label: '搜尋目前對話', keywords: 'find transcript', onRun: vi.fn() },
  { id: 'compact', label: '/compact', keywords: 'context 壓縮', onRun: vi.fn() }
]

describe('CommandPalette', () => {
  afterEach(cleanup)

  it('ranks recent commands first until a fuzzy query narrows the list', () => {
    expect(rankCommands(commands, '', ['compact']).map((item) => item.id)).toEqual(['compact', 'new', 'search'])
    expect(rankCommands(commands, 'ses', []).map((item) => item.id)).toEqual(['new'])
  })

  it('supports arrow navigation, Enter execution, and Escape', async () => {
    const onClose = vi.fn()
    const onUse = vi.fn()
    const user = userEvent.setup()
    render(<CommandPalette commands={commands} recentIds={[]} onUse={onUse} onClose={onClose} />)

    const search = screen.getByRole('combobox', { name: '搜尋命令' })
    await user.type(search, 'a')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(commands[2].onRun).toHaveBeenCalled()
    expect(onUse).toHaveBeenCalledWith('compact')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('leaves bottom padding so the last result can scroll fully into view', () => {
    expect(stylesCss).toMatch(/\.palette-results\s*\{[^}]*padding:\s*8px 8px 32px/)
    expect(stylesCss).toMatch(/\.palette-results\s*\{[^}]*scroll-padding-bottom:\s*32px/)
  })

  it('groups screen actions and slash commands', () => {
    render(<CommandPalette commands={commands} recentIds={[]} onUse={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('palette-group-screen')).toHaveTextContent('畫面動作')
    expect(screen.getByTestId('palette-group-slash')).toHaveTextContent('斜線指令')
    const screenGroup = screen.getByTestId('palette-group-screen')
    const slashGroup = screen.getByTestId('palette-group-slash')
    expect(screenGroup.compareDocumentPosition(slashGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
