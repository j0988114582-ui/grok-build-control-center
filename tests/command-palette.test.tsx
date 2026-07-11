// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette, rankCommands, type PaletteCommand } from '../src/renderer/src/components/CommandPalette'

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
})
