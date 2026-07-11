import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Command, Search } from 'lucide-react'

export type PaletteCommand = { id: string; label: string; description?: string; keywords?: string; shortcut?: string; onRun: () => void }

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

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setHighlighted(0) }, [query])

  const execute = (command: PaletteCommand | undefined): void => {
    if (!command) return
    command.onRun()
    onUse(command.id)
    onClose()
  }

  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!ranked.length) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((index) => (index + direction + ranked.length) % ranked.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      execute(ranked[highlighted])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return <div className="palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
      <label className="palette-search"><Search /><input ref={inputRef} role="combobox" aria-label="搜尋命令" aria-controls="palette-results" aria-expanded="true" aria-activedescendant={ranked[highlighted] ? `palette-${ranked[highlighted].id}` : undefined} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={keyDown} placeholder="輸入功能名稱，例如：新對話、搜尋、compact" /></label>
      <div id="palette-results" className="palette-results" role="listbox" aria-label="命令結果">
        {ranked.map((command, index) => <button key={command.id} id={`palette-${command.id}`} role="option" aria-selected={index === highlighted} data-highlighted={index === highlighted ? 'true' : undefined} onMouseEnter={() => setHighlighted(index)} onClick={() => execute(command)}>
          <Command /><span><strong>{command.label}</strong>{command.description && <small>{command.description}</small>}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}
        </button>)}
        {!ranked.length && <p>找不到命令。換個更短的關鍵字試試看。</p>}
      </div>
      <footer><span>↑↓ 選擇</span><span>Enter 執行</span><span>Esc 關閉</span></footer>
    </section>
  </div>
}
