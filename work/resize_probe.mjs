// Maximize-freeze probe: reproduce the pale-wash after window maximize and
// bisect which layer paints it (starfield canvas / empty-state css / hero 3d).
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-gui-resize-'))
const output = path.resolve('outputs', 'ui-smoke')
await mkdir(output, { recursive: true })

const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`] })
const report = { health: [], canvas: [], shots: [] }
const page = await app.firstWindow()
page.setDefaultTimeout(60_000)
await page.waitForLoadState('domcontentloaded')
await page.locator('.starfield-canvas').waitFor()
const shot = async (name) => {
  const file = path.join(output, name)
  await page.screenshot({ path: file })
  report.shots.push(file)
}
const probe = async (label) => {
  const data = await page.evaluate(() => {
    const canvas = document.querySelector('.starfield-canvas')
    return {
      health: globalThis.__grokStarfieldHealth ?? null,
      renderer: canvas?.dataset.renderer,
      buffer: canvas ? { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight } : null,
      hero: Boolean(document.querySelector('.empty-hero3d canvas')),
      inner: { w: window.innerWidth, h: window.innerHeight }
    }
  })
  report.canvas.push({ label, ...data })
}

await page.waitForTimeout(2_500)
await probe('before')
await shot('resize-0-before.png')

await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
await page.waitForTimeout(2_800)
await probe('after-maximize')
await shot('resize-1-after-maximize.png')

// Layer bisection
await page.evaluate(() => { document.querySelector('.starfield-canvas').style.display = 'none' })
await page.waitForTimeout(300)
await shot('resize-2-no-starfield.png')
await page.evaluate(() => { document.querySelector('.starfield-canvas').style.display = '' })

await page.evaluate(() => { const el = document.querySelector('.empty-state'); if (el) el.style.backgroundImage = 'none' })
await page.waitForTimeout(300)
await shot('resize-3-no-emptystate-bg.png')
await page.evaluate(() => { const el = document.querySelector('.empty-state'); if (el) el.style.backgroundImage = '' })

await page.evaluate(() => { const el = document.querySelector('.empty-hero3d'); if (el) el.style.display = 'none' })
await page.waitForTimeout(300)
await shot('resize-4-no-hero.png')

await page.waitForTimeout(2_000)
await probe('late')
await app.close().catch(() => null)
await writeFile(path.join(output, 'resize-probe.json'), JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report.canvas, null, 2))
