// Why does clicking a bookmark not move the transcript? READ-ONLY on an existing session.
import { _electron as electron } from 'playwright'

const TARGET = process.argv[2] ?? 'WORDPRESS'
const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
page.setDefaultTimeout(120_000)

const snap = () => page.evaluate(() => {
  const t = document.querySelector('.transcript')
  const cands = [t, ...t.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 8)
  return {
    scrollerCount: cands.length,
    scrollers: cands.map((el) => ({ cls: el.className?.toString?.().slice(0, 40) ?? '', top: Math.round(el.scrollTop), h: Math.round(el.scrollHeight), c: Math.round(el.clientHeight) })),
    firstVisible: (() => {
      const wraps = [...document.querySelectorAll('.event-wrap')]
      const box = t.getBoundingClientRect()
      const hit = wraps.find((w) => w.getBoundingClientRect().bottom > box.top + 4)
      return hit ? hit.innerText.replace(/\s+/g, ' ').slice(0, 50) : null
    })(),
    wraps: document.querySelectorAll('.event-wrap').length
  }
})

try {
  await page.waitForSelector('.session-list', { timeout: 60_000 })
  await page.waitForTimeout(3000)
  const ok = await page.evaluate((needle) => {
    for (const g of document.querySelectorAll('.session-group')) {
      if (!(g.querySelector('header span')?.textContent ?? '').includes(needle)) continue
      const r = g.querySelector('button')
      if (r) { r.setAttribute('data-dbg', '1'); return true }
    }
    return false
  }, TARGET)
  if (!ok) throw new Error('no target group')
  await page.locator('[data-dbg="1"]').click()
  await page.waitForSelector('[data-testid="main-composer"]', { timeout: 60_000 })
  await page.waitForTimeout(6000)

  console.log('before open :', JSON.stringify(await snap()))
  await page.locator('[data-testid="prompt-bookmarks-trigger"]').click()
  await page.waitForSelector('[data-testid="prompt-bookmarks-panel"]', { timeout: 10_000 })
  const count = await page.locator('[data-testid="prompt-bookmark-item"]').count()
  console.log('bookmarks   :', count)
  if (count === 0) throw new Error('no bookmarks in this session')
  console.log('panel open  :', JSON.stringify(await snap()))

  await page.locator('[data-testid="prompt-bookmark-item"]').last().click()
  for (const wait of [300, 800, 2000]) {
    await page.waitForTimeout(wait)
    console.log(`after +${wait}ms:`, JSON.stringify(await snap()))
  }
} catch (error) {
  console.log('DEBUG ERROR:', error.message)
} finally {
  await app.close()
}
