// D4 measurement: is the sidebar actually expensive enough to justify virtualising it?
// READ-ONLY: types into the composer of whatever session is already open (a draft, never
// sent) to force App re-renders, then measures the resulting main-thread cost.
import { _electron as electron } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const OUT = 'outputs/v011-review'
await mkdir(OUT, { recursive: true })
const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
page.setDefaultTimeout(120_000)
const report = {}

try {
  await page.waitForSelector('.session-list', { timeout: 60_000 })
  await page.waitForTimeout(3000)

  report.dom = await page.evaluate(() => ({
    sessionRows: document.querySelectorAll('.session-row').length,
    sidebarButtons: document.querySelectorAll('.session-list button').length,
    sidebarNodes: document.querySelector('.session-list')?.querySelectorAll('*').length ?? 0,
    documentNodes: document.querySelectorAll('*').length
  }))
  console.log('DOM:', JSON.stringify(report.dom))

  // Open a session so the composer exists (first row of the first *folder* group, never
  // pinned — and we only type a draft, we never send).
  const opened = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.session-group')].filter((g) => !g.classList.contains('pinned'))
    const row = groups[0]?.querySelector('button')
    if (!row) return false
    row.setAttribute('data-perf-target', '1')
    return true
  })
  if (!opened) throw new Error('no non-pinned session group to open')
  await page.locator('[data-perf-target="1"]').click()
  await page.waitForSelector('[data-testid="main-composer"]', { timeout: 60_000 })
  await page.waitForTimeout(4000)

  // Each keystroke runs setDrafts → a full App render, which is exactly the path that used
  // to re-render all sidebar rows. Measure the main thread while typing.
  report.typing = await page.evaluate(async () => {
    const ta = document.querySelector('[data-testid="main-composer"] textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    const longTasks = []
    const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push(Math.round(e.duration)) })
    try { observer.observe({ entryTypes: ['longtask'] }) } catch { /* not supported */ }

    const durations = []
    for (let i = 1; i <= 40; i++) {
      const t0 = performance.now()
      setter.call(ta, 'x'.repeat(i))
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      durations.push(performance.now() - t0)
    }
    setter.call(ta, '')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    observer.disconnect()

    const sorted = [...durations].sort((a, b) => a - b)
    return {
      keystrokes: durations.length,
      medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
      p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      maxMs: +sorted[sorted.length - 1].toFixed(2),
      longTasks
    }
  })
  console.log('TYPING (sidebar open):', JSON.stringify(report.typing))

  // Attribution: collapse the sidebar (Ctrl+B) so its rows leave the tree entirely, then
  // repeat. The delta is the sidebar's real share of the per-keystroke cost.
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(1200)
  report.sidebarCollapsed = await page.evaluate(() => document.querySelectorAll('.session-row').length)
  report.typingCollapsed = await page.evaluate(async () => {
    const ta = document.querySelector('[data-testid="main-composer"] textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    const durations = []
    for (let i = 1; i <= 40; i++) {
      const t0 = performance.now()
      setter.call(ta, 'y'.repeat(i))
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      durations.push(performance.now() - t0)
    }
    setter.call(ta, '')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    const sorted = [...durations].sort((a, b) => a - b)
    return { medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2), p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2) }
  })
  console.log('TYPING (sidebar collapsed):', JSON.stringify(report.typingCollapsed), 'rows now:', report.sidebarCollapsed)

  const { medianMs, p95Ms } = report.typing
  console.log(`\nRESULT: ${report.dom.sessionRows} session rows / ${report.dom.sidebarButtons} buttons`)
  console.log(`  per-keystroke frame cost: median ${medianMs}ms, p95 ${p95Ms}ms`)
  console.log(`  long tasks (>50ms) during 40 keystrokes: ${report.typing.longTasks.length}`)
  console.log(`  virtualisation warranted: ${p95Ms > 16 ? 'YES — over one frame budget' : 'NO — inside the 16ms frame budget'}`)
} catch (error) {
  console.log('PROBE ERROR:', error.message)
  report.error = error.message
} finally {
  await writeFile(path.join(OUT, 'sidebar-perf.json'), JSON.stringify(report, null, 2), 'utf8')
  await app.close()
}
