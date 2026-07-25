// Does the transcript keep its bottom-lock when the composer grows / the window resizes?
// This matters for the v0.11 "unbounded composer" change: a taller composer shrinks the
// transcript viewport, and if bottom-lock is lost the user is stranded mid-history.
// READ-ONLY: clicks one session row, resizes, types nothing, sends nothing.
import { _electron as electron } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const TARGET = process.argv[2] ?? 'WORDPRESS'
const OUT = 'outputs/v011-review'
await mkdir(OUT, { recursive: true })

const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
page.setDefaultTimeout(120_000)
const log = []

const state = () => page.evaluate(() => {
  const transcript = document.querySelector('.transcript')
  let sc = null
  if (transcript) {
    const candidates = [transcript, ...transcript.querySelectorAll('*')]
    sc = candidates.find((el) => el.scrollHeight > el.clientHeight + 8) ?? transcript
  }
  const composer = document.querySelector('[data-testid="main-composer"]')
  return {
    fromBottom: sc ? Math.round(sc.scrollHeight - sc.scrollTop - sc.clientHeight) : -1,
    transcriptH: sc ? Math.round(sc.clientHeight) : -1,
    composerH: composer ? Math.round(composer.getBoundingClientRect().height) : -1,
    jump: document.querySelector('.jump-latest')?.textContent?.trim() ?? null
  }
})

const grow = (lines) => page.evaluate((n) => {
  const ta = document.querySelector('[data-testid="main-composer"] textarea')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(ta, n === 0 ? '' : Array.from({ length: n }, (_, i) => `第 ${i + 1} 行`).join('\n'))
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}, lines)

try {
  await page.waitForSelector('.session-list', { timeout: 60_000 })
  await page.waitForTimeout(3000)
  const picked = await page.evaluate((needle) => {
    for (const g of document.querySelectorAll('.session-group')) {
      if (!(g.querySelector('header span')?.textContent ?? '').includes(needle)) continue
      const r = g.querySelector('button')
      if (r) { r.setAttribute('data-probe-target', '1'); return r.innerText.slice(0, 60) }
    }
    return null
  }, TARGET)
  if (!picked) throw new Error(`no group matching ${TARGET}`)
  console.log('target:', picked)

  await page.locator('[data-probe-target="1"]').click()
  await page.waitForSelector('[data-testid="main-composer"]', { timeout: 60_000 })
  await page.waitForTimeout(6000)

  const record = async (label) => { const s = await state(); log.push({ label, ...s }); console.log(`${label.padEnd(28)} composer=${s.composerH}px transcript=${s.transcriptH}px fromBottom=${s.fromBottom}px jump=${s.jump ?? '-'}`) }

  await record('1. entered (settled)')
  await grow(40); await page.waitForTimeout(1200)
  await record('2. composer grown (40 lines)')
  await grow(0); await page.waitForTimeout(1200)
  await record('3. composer cleared')

  await page.setViewportSize({ width: 1200, height: 500 }); await page.waitForTimeout(1500)
  await record('4. window shrunk to 500px')
  await page.setViewportSize({ width: 1200, height: 900 }); await page.waitForTimeout(1500)
  await record('5. window back to 900px')

  await page.screenshot({ path: path.join(OUT, '11-layout-shift.png') })

  const lost = log.filter((l) => l.fromBottom > 60)
  console.log(`\nRESULT: bottom-lock lost in ${lost.length}/${log.length} states`)
  for (const l of lost) console.log(`  LOST at "${l.label}": ${l.fromBottom}px from bottom`)
} catch (error) {
  console.log('PROBE ERROR:', error.message)
} finally {
  await writeFile(path.join(OUT, 'layout-shift-probe.json'), JSON.stringify(log, null, 2), 'utf8')
  await app.close()
}
