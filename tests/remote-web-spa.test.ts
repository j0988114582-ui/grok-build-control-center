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
    expect(js).toMatch(/elevationLocked/)
    expect(js).toMatch(/網路錯誤/)
    // Ensure post-action refresh does not call pollSnapshot (would double-timer)
    const postActionBlock = js.slice(js.indexOf('async function postAction'), js.indexOf('async function sendPrompt'))
    expect(postActionBlock).toMatch(/fetchSnapshotOnce/)
    expect(postActionBlock).not.toMatch(/void pollSnapshot/)
  })

  it('CSS enforces 44px touch targets', () => {
    expect(css).toMatch(/--touch:\s*44px/)
    expect(css).toMatch(/min-height:\s*var\(--touch\)/)
    expect(css).toMatch(/button:disabled/)
  })

  it('signals dropped desktop connection instead of freezing silently', () => {
    expect(js).toMatch(/noteSnapshotFailure/)
    expect(js).toMatch(/連線中斷/)
  })

  it('skips DOM rebuilds when snapshot sections are unchanged (no flicker)', () => {
    expect(js).toMatch(/lastTailKey/)
    expect(js).toMatch(/lastSessionsKey/)
    expect(js).toMatch(/lastPermissionsKey/)
  })

  it('disables send while a turn is running (interject row is the affordance)', () => {
    expect(js).toMatch(/sendBtn\.disabled = !!snap\.running/)
  })

  it('YOLO PIN is a two-step reveal with masked input', () => {
    expect(html).toMatch(/id="yolo-pin"[^>]*type="password"/)
    expect(js).toMatch(/再按一次「開啟 YOLO」/)
  })

  it('renders turn markers and errors distinctly in the tail', () => {
    expect(js).toMatch(/turnLabel/)
    expect(js).toMatch(/回合完成/)
    expect(js).toMatch(/error-item/)
    expect(css).toMatch(/turn-mark/)
  })

  it('offers model/mode pickers from snapshot with manual fallback', () => {
    expect(html).toMatch(/id="model-select"/)
    expect(html).toMatch(/id="effort-select"/)
    expect(html).toMatch(/id="mode-select"/)
    expect(html).toMatch(/id="model-id"/)
    expect(html).toMatch(/id="mode-id"/)
    expect(js).toMatch(/renderControls/)
    expect(js).toMatch(/renderEffortOptions/)
    expect(js).toMatch(/snap\.models/)
  })
})
