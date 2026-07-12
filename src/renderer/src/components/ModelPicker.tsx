import React, { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Orbit } from 'lucide-react'
import type { ModelState } from '../../../shared/types'

const formatContext = (value?: number): string => value === undefined ? 'Context 未提供' : `${Math.round(value / 1000)}k context`

export function ModelPicker({ models, onModelChange, onEffortChange }: {
  models: ModelState
  onModelChange: (modelId: string) => void
  onEffortChange: (effort: string) => void
}): React.JSX.Element {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(models.currentModelId)
  const empty = models.availableModels.length === 0
  const selectedIndex = Math.max(0, models.availableModels.findIndex((model) => model.modelId === selectedId))
  const [highlighted, setHighlighted] = useState(selectedIndex)
  const activeModel = models.availableModels[selectedIndex] ?? models.availableModels[0]

  useEffect(() => {
    setSelectedId(models.currentModelId)
    const index = models.availableModels.findIndex((model) => model.modelId === models.currentModelId)
    setHighlighted(Math.max(0, index))
  }, [models])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const selectModel = (index: number): void => {
    const model = models.availableModels[index]
    if (!model) return
    setSelectedId(model.modelId)
    setHighlighted(index)
    setOpen(false)
    onModelChange(model.modelId)
  }

  const keyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (empty) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { setOpen(true); setHighlighted(selectedIndex); return }
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((index) => (index + direction + models.availableModels.length) % models.availableModels.length)
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      selectModel(highlighted)
    } else if (event.key === 'Escape') {
      if (open) {
        event.stopPropagation()
        setOpen(false)
      }
    }
  }

  return <div className="model-picker" ref={rootRef}>
    <button className="model-trigger" aria-label={`模型：${activeModel?.name ?? '未選擇'}`} aria-haspopup="listbox" aria-expanded={open && !empty} aria-controls={listboxId} disabled={empty} onClick={() => { if (!empty) setOpen((value) => !value) }} onKeyDown={keyDown}>
      <Orbit />
      <span><strong>{activeModel?.name ?? '選擇模型'}</strong><small>{activeModel?.description ?? 'No description'}</small><em>{formatContext(activeModel?.totalContextTokens)}</em></span>
      <ChevronDown />
    </button>
    {open && !empty && <div className="model-listbox" id={listboxId} role="listbox" aria-label="可用模型" aria-activedescendant={`${listboxId}-${highlighted}`}>
      {models.availableModels.map((model, index) => <button
        key={model.modelId}
        id={`${listboxId}-${index}`}
        role="option"
        aria-selected={model.modelId === selectedId}
        data-highlighted={index === highlighted ? 'true' : undefined}
        onMouseEnter={() => setHighlighted(index)}
        onClick={() => selectModel(index)}
      >
        <span className="model-orbit"><i />{model.modelId === selectedId && <Check />}</span>
        <span><strong>{model.name}</strong><small>{model.description ?? 'No description'}</small><em>{formatContext(model.totalContextTokens)}</em></span>
      </button>)}
    </div>}
    {activeModel?.reasoningEfforts.length ? <div className="effort-picker" role="radiogroup" aria-label="推理強度">
      {activeModel.reasoningEfforts.map((effort) => {
        const checked = effort.value === (activeModel.currentReasoningEffort ?? activeModel.reasoningEfforts.find((item) => item.default)?.value)
        return <button key={effort.id} role="radio" aria-checked={checked} className={checked ? 'active' : ''} title={effort.description} onClick={() => onEffortChange(effort.value)}>{effort.label}</button>
      })}
    </div> : null}
  </div>
}
