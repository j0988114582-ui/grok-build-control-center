import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Command, Search } from 'lucide-react'

export type PaletteGroup = 'screen' | 'slash'

export type PaletteCommand = {
  id: string
  label: string
  description?: string
  keywords?: string
  shortcut?: string
  group?: PaletteGroup
  onRun: () => void
}

export const PALETTE_GROUP_LABELS: Record<PaletteGroup, string> = {
  screen: '畫面動作',
  slash: '斜線指令'
}

export function paletteGroupOf(command: PaletteCommand): PaletteGroup {
  if (command.group) return command.group
  return command.id.startsWith('slash:') || command.label.startsWith('/') ? 'slash' : 'screen'
}

export function groupPaletteCommands(commands: PaletteCommand[]): Array<{ group: PaletteGroup; items: PaletteCommand[] }> {
  const screen = commands.filter((command) => paletteGroupOf(command) === 'screen')
  const slash = commands.filter((command) => paletteGroupOf(command) === 'slash')
  const groups: Array<{ group: PaletteGroup; items: PaletteCommand[] }> = []
  if (screen.length) groups.push({ group: 'screen', items: screen })
  if (slash.length) groups.push({ group: 'slash', items: slash })
  return groups
}

const fuzzyMatch = (value: string, query: string): boolean => {
  let cursor = 0
  for (const character of value) {
    if (character === query[cursor]) cursor += 1
    if (cursor === query.length) return true
  }
  return query.length === 0
}

export const rankCommands = (commands: PaletteCommand[], query: string, recentIds: string[]): PaletteCommand[] => {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized) return commands.filter((command) => fuzzyMatch(`${command.label} ${command.keywords ?? ''}`.toLocaleLowerCase(), normalized))
  const recency = new Map(recentIds.map((id, index) => [id, index]))
  return commands.map((command, index) => ({ command, index })).sort((a, b) => {
    const aRecent = recency.get(a.command.id) ?? Number.MAX_SAFE_INTEGER
    const bRecent = recency.get(b.command.id) ?? Number.MAX_SAFE_INTEGER
    return aRecent - bRecent || a.index - b.index
  }).map(({ command }) => command)
}

export function CommandPalette({ commands, recentIds, onUse, onClose }: {
  commands: PaletteCommand[]
  recentIds: string[]
  onUse: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const ranked = useMemo(() => rankCommands(commands, query, recentIds), [commands, query, recentIds])
  const groups = useMemo(() => groupPaletteCommands(ranked), [ranked])
  const ordered = useMemo(() => groups.flatMap((entry) => entry.items), [groups])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setHighlighted(0) }, [query])

  const execute = (command: PaletteCommand | undefined): void => {
    if (!command) return
    command.onRun()
    onUse(command.id)
    onClose()
  }

  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!ordered.length) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((index) => (index + direction + ordered.length) % ordered.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      execute(ordered[highlighted])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }

  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
      <label className="palette-search"><Search /><input ref={inputRef} role="combobox" aria-label="搜尋命令" aria-controls="palette-results" aria-expanded="true" aria-activedescendant={ordered[highlighted] ? `palette-${ordered[highlighted].id}` : undefined} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={keyDown} placeholder="輸入功能名稱，例如：新對話、搜尋、compact" /></label>
      <div id="palette-results" className="palette-results" role="listbox" aria-label="命令結果">
        {groups.map((entry, groupIndex) => {
          const offset = groups.slice(0, groupIndex).reduce((sum, item) => sum + item.items.length, 0)
          return (
            <React.Fragment key={entry.group}>
              <div className="palette-group" data-testid={`palette-group-${entry.group}`}>{PALETTE_GROUP_LABELS[entry.group]}</div>
              {entry.items.map((command, index) => {
                const absolute = offset + index
                return <button key={command.id} id={`palette-${command.id}`} role="option" aria-selected={absolute === highlighted} data-highlighted={absolute === highlighted ? 'true' : undefined} onMouseEnter={() => setHighlighted(absolute)} onClick={() => execute(command)}>
                  <Command /><span><strong>{command.label}</strong>{command.description && <small>{command.description}</small>}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}
                </button>
              })}
            </React.Fragment>
          )
        })}
        {!ordered.length && <p>找不到命令。換個更短的關鍵字試試看。</p>}
      </div>
      <footer><span>↑↓ 選擇</span><span>Enter 執行</span><span>Esc 關閉</span></footer>
    </section>
  </div>
}
