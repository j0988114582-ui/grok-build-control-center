// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewDock, type PreviewLoadState } from '../src/renderer/src/components/PreviewDock/PreviewDock'
import { HtmlView } from '../src/renderer/src/components/PreviewDock/HtmlView'
import type { PreviewItem } from '../src/shared/preview-types'
import { MarkdownRemoteChipProbe } from './preview-markdown-probe'

afterEach(cleanup)

const baseItem = (over: Partial<PreviewItem> = {}): PreviewItem => ({
  id: 'file:c:\\repo\\a.png',
  kind: 'image',
  source: { type: 'file', path: 'C:\\repo\\a.png' },
  label: 'a.png',
  discoveredAt: 1,
  sessionId: 's1',
  ...over
})

function DockHarness({
  load,
  items = [baseItem()],
  activeId = 'file:c:\\repo\\a.png',
  onCancelTurn
}: {
  load: PreviewLoadState
  items?: PreviewItem[]
  activeId?: string | null
  onCancelTurn?: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return <>
    <PreviewDock
      open={open}
      width={360}
      items={items}
      activeId={activeId}
      load={load}
      showHtmlScriptAdvanced
      htmlScriptsAllowed={false}
      onToggleOpen={() => setOpen((v) => !v)}
      onWidthChange={() => undefined}
      onSelectItem={() => undefined}
      onRefresh={() => undefined}
      onRescan={() => undefined}
      onOpenFile={() => undefined}
      onToggleHtmlScripts={() => undefined}
      onCopyPath={() => undefined}
      onRevealPath={() => undefined}
      onOpenExternalPath={() => undefined}
    />
    <button type="button" data-testid="fake-cancel" onClick={onCancelTurn}>cancel</button>
  </>
}

describe('PreviewDock', () => {
  it('toggles open rail vs expanded', async () => {
    const user = userEvent.setup()
    render(<DockHarness load={{ status: 'idle' }} />)
    expect(screen.getByTestId('preview-dock')).toHaveAttribute('data-open', 'true')
    await user.click(screen.getByRole('button', { name: '收合預覽台' }))
    expect(screen.getByTestId('preview-dock')).toHaveAttribute('data-open', 'false')
    await user.click(screen.getByRole('button', { name: '展開預覽台' }))
    expect(screen.getByTestId('preview-dock')).toHaveAttribute('data-open', 'true')
  })

  it('P-CLOSE-1: close current item clears stage to idle without collapsing dock', async () => {
    const user = userEvent.setup()
    const onCloseItem = vi.fn()
    render(
      <PreviewDock
        open
        width={360}
        items={[baseItem()]}
        activeId="file:c:\\repo\\a.png"
        load={{ status: 'ready', kind: 'image', mediaSrc: 'data:image/png;base64,aa', path: 'C:\\repo\\a.png' }}
        showHtmlScriptAdvanced
        htmlScriptsAllowed={false}
        onToggleOpen={() => undefined}
        onWidthChange={() => undefined}
        onSelectItem={() => undefined}
        onCloseItem={onCloseItem}
        onRefresh={() => undefined}
        onRescan={() => undefined}
        onOpenFile={() => undefined}
        onToggleHtmlScripts={() => undefined}
        onCopyPath={() => undefined}
        onRevealPath={() => undefined}
        onOpenExternalPath={() => undefined}
      />
    )
    expect(screen.getByTestId('preview-dock')).toHaveAttribute('data-open', 'true')
    await user.click(screen.getByTestId('preview-close-item'))
    expect(onCloseItem).toHaveBeenCalledTimes(1)
    // list item remains (close ≠ delete / remove from recent)
    expect(screen.getByText('a.png')).toBeInTheDocument()
  })

  it('Escape closes lightbox without bubbling cancel-turn intent', () => {
    const onCancelTurn = vi.fn()
    render(
      <DockHarness
        load={{ status: 'ready', kind: 'image', mediaSrc: 'data:image/png;base64,aa', path: 'C:\\repo\\a.png' }}
        onCancelTurn={onCancelTurn}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '全螢幕' }))
    expect(screen.getByTestId('preview-lightbox')).toBeInTheDocument()
    // Capture-phase Escape handler inside dock should close lightbox
    fireEvent.keyDown(window, { key: 'Escape', bubbles: true })
    expect(screen.queryByTestId('preview-lightbox')).not.toBeInTheDocument()
    // Global cancelTurn is a separate listener; dock must not leave lightbox open
    expect(onCancelTurn).not.toHaveBeenCalled()
  })

  it('shows Chinese error state', () => {
    render(<DockHarness load={{ status: 'error', message: '找不到檔案，可能已被移動或刪除' }} />)
    expect(screen.getByTestId('preview-error')).toHaveTextContent('找不到檔案')
  })

  it('HTML iframe always has sandbox and never same-origin+scripts together', () => {
    const { rerender } = render(
      <HtmlView html="<p>hi</p>" allowScripts={false} showScriptControl onToggleScripts={() => undefined} />
    )
    const frame = screen.getByTestId('preview-html-frame')
    expect(frame).toHaveAttribute('sandbox')
    // empty sandbox = all restrictions
    expect(frame.getAttribute('sandbox') ?? '').not.toMatch(/allow-scripts/)
    expect(frame.getAttribute('sandbox') ?? '').not.toMatch(/allow-same-origin/)

    rerender(
      <HtmlView html="<script>window.x=1</script>" allowScripts showScriptControl onToggleScripts={() => undefined} />
    )
    const frame2 = screen.getByTestId('preview-html-frame')
    const sandbox = frame2.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
    expect(screen.getByTestId('preview-html-script-banner')).toBeInTheDocument()
  })

  it('transcript remote images render as chip, not auto-loading img', () => {
    render(<MarkdownRemoteChipProbe />)
    expect(screen.getByTestId('md-remote-image-chip')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
