// axe over the v0.11 surfaces the standard ui smoke never opens: the bookmark listbox
// (open state) and the collapsed/expanded composer. READ-ONLY — types a draft, never sends.
import { _electron as electron } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const TARGET = process.argv[2] ?? 'WORDPRESS'
const OUT = 'outputs/v011-review'
await mkdir(OUT, { recursive: true })

const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.addInitScript({ path: path.resolve('node_modules', 'axe-core', 'axe.min.js') })
await page.reload()
await page.waitForLoadState('domcontentloaded')
page.setDefaultTimeout(120_000)
const results = []

const scan = async (state) => {
  const out = await page.evaluate(async () => {
    const r = await globalThis.axe.run(document)
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, target: v.nodes[0]?.target?.join(' ') ?? '' }))
  })
  results.push({ state, violations: out })
  console.log(`${out.length === 0 ? 'PASS' : 'FAIL'} ${state} — ${out.length ? JSON.stringify(out) : 'no serious/critical violations'}`)
}

try {
  await page.waitForSelector('.session-list', { timeout: 60_000 })
  await page.waitForTimeout(3000)
  const ok = await page.evaluate((needle) => {
    for (const g of document.querySelectorAll('.session-group')) {
      if (!(g.querySelector('header span')?.textContent ?? '').includes(needle)) continue
      const r = g.querySelector('button')
      if (r) { r.setAttribute('data-a11y', '1'); return true }
    }
    return false
  }, TARGET)
  if (!ok) throw new Error(`no session group matching ${TARGET}`)
  await page.locator('[data-a11y="1"]').click()
  await page.waitForSelector('[data-testid="main-composer"]', { timeout: 60_000 })
  await page.waitForTimeout(5000)
  await scan('session (baseline)')

  await page.locator('[data-testid="prompt-bookmarks-trigger"]').click()
  await page.waitForSelector('[data-testid="prompt-bookmarks-panel"]', { timeout: 10_000 })
  await scan('bookmark panel open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // Tall draft → collapse control appears; scan both composer states.
  await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="main-composer"] textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 行`).join('\n'))
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(1200)
  await scan('composer grown + collapse control')
  await page.locator('[data-testid="composer-collapse"]').click()
  await page.waitForTimeout(1000)
  await scan('composer collapsed')
  await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="main-composer"] textarea')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, '')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })

  // Light theme repeat for the bookmark panel (Dawn Nebula has its own overrides).
  await page.evaluate(() => { document.querySelector('.app')?.setAttribute('data-theme', 'light') })
  await page.waitForTimeout(800)
  await page.locator('[data-testid="prompt-bookmarks-trigger"]').click()
  await page.waitForSelector('[data-testid="prompt-bookmarks-panel"]', { timeout: 10_000 })
  await scan('bookmark panel open (light theme)')
  await page.screenshot({ path: path.join(OUT, '15-bookmark-light.png') })
} catch (error) {
  console.log('PROBE ERROR:', error.message)
  results.push({ state: 'error', message: error.message })
} finally {
  await writeFile(path.join(OUT, 'a11y-probe.json'), JSON.stringify(results, null, 2), 'utf8')
  await app.close()
}

const bad = results.filter((r) => (r.violations?.length ?? 0) > 0 || r.state === 'error')
console.log(`\nRESULT: ${bad.length === 0 ? 'PASS — no serious/critical violations in any v0.11 state' : `FAIL — ${bad.length} state(s) with problems`}`)
if (bad.length) process.exitCode = 1
