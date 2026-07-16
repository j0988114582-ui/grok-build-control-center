import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

describe('Preview Dock CSP (P-SEC-6)', () => {
  it('renderer index.html allows grok-preview media/images and https images', async () => {
    const html = await readFile(path.join(root, 'src/renderer/index.html'), 'utf8')
    expect(html).toMatch(/img-src[^"]*grok-preview:/)
    expect(html).toMatch(/img-src[^"]*https:/)
    expect(html).toMatch(/img-src[^"]*data:/)
    expect(html).toMatch(/media-src[^"]*grok-preview:/)
    // frame-src must not open blob for HTML (srcdoc only)
    expect(html).not.toMatch(/frame-src[^"]*blob/)
  })

  it('togglePreview is in DEFAULT_SHORTCUTS', async () => {
    const { DEFAULT_SHORTCUTS } = await import('../src/shared/shortcuts')
    expect(DEFAULT_SHORTCUTS.some((item) => item.command === 'togglePreview' && item.accelerator === 'Ctrl+Shift+V')).toBe(true)
  })
})
