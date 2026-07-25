// B4 probe: where does the transcript land when you ENTER a session with long history?
// READ-ONLY: only clicks a session row and observes. Never types, never sends, never deletes.
// Targets a session by title substring so it can never wander into an unrelated session.
import { _electron as electron } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const TARGET = process.argv[2] ?? '_upstream'
const OUT = 'outputs/v011-review'
await mkdir(OUT, { recursive: true })

const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
page.setDefaultTimeout(120_000)
const log = []

const scrollState = () => page.evaluate(() => {
  // Virtuoso's scroller is the element that actually overflows inside .transcript
  const transcript = document.querySelector('.transcript')
  let sc = null
  if (transcript) {
    const candidates = [transcript, ...transcript.querySelectorAll('*')]
    sc = candidates.find((el) => el.scrollHeight > el.clientHeight + 8) ?? transcript
  }
  const jump = document.querySelector('.jump-latest')
  return {
    scrollTop: sc ? Math.round(sc.scrollTop) : -1,
    scrollHeight: sc ? Math.round(sc.scrollHeight) : -1,
    clientHeight: sc ? Math.round(sc.clientHeight) : -1,
    distanceFromBottom: sc ? Math.round(sc.scrollHeight - sc.scrollTop - sc.clientHeight) : -1,
    jumpLatestText: jump ? jump.textContent.trim() : null,
    eventCount: document.querySelectorAll('.event-wrap').length,
    firstVisible: document.querySelector('.event-wrap')?.innerText?.slice(0, 60) ?? null
  }
})

try {
  await page.waitForSelector('.session-list', { timeout: 60_000 })
  await page.waitForTimeout(3000)

  // Pick a session row whose group header or row text contains TARGET.
  const picked = await page.evaluate((needle) => {
    const groups = [...document.querySelectorAll('.session-group')]
    for (const g of groups) {
      const head = g.querySelector('header span')?.textContent ?? ''
      if (!head.includes(needle)) continue
      const rows = [...g.querySelectorAll('button')]
      for (const r of rows) {
        const t = r.innerText ?? ''
        if (t.trim() && !/釘選|刪除|重新命名/.test(r.getAttribute('aria-label') ?? '')) {
          r.setAttribute('data-probe-target', '1')
          return { group: head, text: t.slice(0, 80) }
        }
      }
    }
    return null
  }, TARGET)
  log.push({ step: 'pick', picked })
  if (!picked) throw new Error(`no session group matching "${TARGET}"`)
  console.log('target:', JSON.stringify(picked))

  await page.locator('[data-probe-target="1"]').click()
  await page.waitForSelector('[data-testid="main-composer"]', { timeout: 60_000 })

  // Sample the scroll position as the replay streams in.
  for (const wait of [500, 1000, 1500, 2000, 3000, 4000, 5000, 8000]) {
    await page.waitForTimeout(wait)
    const s = await scrollState()
    log.push({ step: `t+${wait}`, ...s })
    console.log(`t+${wait}ms  events=${s.eventCount}  scrollTop=${s.scrollTop}/${s.scrollHeight}  fromBottom=${s.distanceFromBottom}  jump=${s.jumpLatestText}`)
  }
  await page.screenshot({ path: path.join(OUT, '10-scroll-on-entry.png') })

  const final = log[log.length - 1]
  const landedAtBottom = final.distanceFromBottom >= 0 && final.distanceFromBottom < 60
  console.log(`\nRESULT: entering a session with ${final.eventCount} events →`)
  console.log(`  landed at bottom: ${landedAtBottom}`)
  console.log(`  distance from bottom: ${final.distanceFromBottom}px of ${final.scrollHeight}px`)
  console.log(`  "跳到最新" button: ${final.jumpLatestText ?? 'not shown'}`)
} catch (error) {
  console.log('PROBE ERROR:', error.message)
  log.push({ step: 'error', message: error.message })
} finally {
  await writeFile(path.join(OUT, 'scroll-probe.json'), JSON.stringify(log, null, 2), 'utf8')
  await app.close()
}
