import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources/remote-web')
const html = readFileSync(path.join(root, 'index.html'), 'utf8')
const js = readFileSync(path.join(root, 'app.js'), 'utf8')
const css = readFileSync(path.join(root, 'app.css'), 'utf8')

describe('remote-web SPA (wave4)', () => {
  it('has zh-Hant shell, theme-color, and viewport-fit', () => {
    expect(html).toMatch(/lang="zh-Hant"/)
    expect(html).toMatch(/theme-color/)
    expect(html).toMatch(/viewport-fit=cover/)
    expect(html).toMatch(/Grok Build 遙控/)
  })

  it('includes pair pad, session drawer, running tools, yolo, cut-off', () => {
    expect(html).toMatch(/pin-pad/)
    expect(html).toMatch(/session-drawer/)
    expect(html).toMatch(/interject-btn/)
    expect(html).toMatch(/queue-btn/)
    expect(html).toMatch(/donow-btn/)
    expect(html).toMatch(/yolo-on-btn/)
    expect(html).toMatch(/logout-btn/)
    expect(html).toMatch(/cwd-select/)
  })

  it('SPA uses fragment pair secret strip and double-confirm logout', () => {
    expect(js).toMatch(/history\.replaceState/)
    expect(js).toMatch(/consumePairingFragment/)
    expect(js).toMatch(/pairingSecret/)
    expect(js).toMatch(/window\.confirm/)
    expect(js).toMatch(/再次確認/)
    expect(js).toMatch(/\/api\/session\/focus/)
    expect(js).toMatch(/\/api\/yolo\/enable/)
    expect(js).toMatch(/\/api\/interject/)
    expect(js).toMatch(/\/api\/do-now/)
    expect(js).toMatch(/\/api\/queue/)
    expect(js).toMatch(/sessionExpiresAt/)
    expect(js).toMatch(/fetchSnapshotOnce/)
    expect(js).toMatch(/nearBottom/)
    expect(js).toMatch(/切斷失敗/)
  })

  it('CSS enforces 44px touch targets', () => {
    expect(css).toMatch(/--touch:\s*44px/)
    expect(css).toMatch(/min-height:\s*var\(--touch\)/)
  })
})
