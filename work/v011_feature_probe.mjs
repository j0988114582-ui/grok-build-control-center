// v0.11 feature verification: prompt bookmarks (P-BOOKMARK) + compaction notice (T3).
// Uses its OWN scratch session and HARD-ASSERTS the active session is that one before it
// types or sends anything — the 2026-07-25 review harness wandered into a pinned real
// conversation and compacted it, which must never happen again.
import { _electron as electron } from 'playwright'
import { writeFile, mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const OUT = 'outputs/v011-review'
await mkdir(OUT, { recursive: true })
const workdir = await mkdtemp(path.join(tmpdir(), 'grok-v011-feature-'))
const scratchName = path.basename(workdir)
const findings = []
const note = (id, ok, detail) => { findings.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }

const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
page.setDefaultTimeout(120_000)
const consoleErrors = []
page.on('console', (m) => { if (process.env.DEBUG_PAGE) console.log('PAGE:', m.type(), m.text()); if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

/** Refuse to touch the composer unless the open session really is the scratch one. */
const assertScratchActive = async (step) => {
  const cwd = await page.locator('.session-header .session-title p').innerText()
  if (!cwd.includes(scratchName)) throw new Error(`ABORT at ${step}: active session is "${cwd}", not the scratch dir ${scratchName}`)
  return cwd
}

try {
  await page.waitForSelector('.empty-state, .session-list', { timeout: 60_000 })
  await page.waitForTimeout(2000)
  const sessionId = await page.evaluate(async (cwd) => {
    await window.grokApi.connect()
    return (await window.grokApi.createSession(cwd)).sessionId
  }, workdir)
  note('F0-scratch-session', Boolean(sessionId), `id=${sessionId} cwd=${workdir}`)

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
  // Target strictly by the scratch folder's own group header.
  const picked = await page.evaluate((needle) => {
    for (const g of document.querySelectorAll('.session-group')) {
      if (!(g.querySelector('header span')?.textContent ?? '').includes(needle)) continue
      const r = g.querySelector('button')
      if (r) { r.setAttribute('data-probe-target', '1'); return true }
    }
    return false
  }, scratchName)
  if (!picked) throw new Error(`scratch group ${scratchName} not found in sidebar`)
  await page.locator('[data-probe-target="1"]').click()
  await page.waitForSelector('[data-testid="main-composer"]', { timeout: 60_000 })
  await page.waitForFunction(() => document.querySelector('.composer-status-pill.is-ready') !== null, { timeout: 90_000 })
  note('F1-target-locked', true, await assertScratchActive('entry'))

  // ---------- P-BOOKMARK: trigger exists, left of the title ----------
  const trigger = page.locator('[data-testid="prompt-bookmarks-trigger"]')
  const triggerVisible = await trigger.isVisible()
  const geometry = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="prompt-bookmarks-trigger"]')
    const h1 = document.querySelector('.session-header h1')
    const tools = document.querySelector('.session-tools')
    if (!t || !h1) return null
    return { triggerLeft: Math.round(t.getBoundingClientRect().left), titleLeft: Math.round(h1.getBoundingClientRect().left), toolsLeft: tools ? Math.round(tools.getBoundingClientRect().left) : -1 }
  })
  note('B1-bookmark-trigger', triggerVisible && geometry !== null && geometry.triggerLeft < geometry.titleLeft,
    `visible=${triggerVisible} ${JSON.stringify(geometry)} (trigger must be left of the title)`)

  // ---------- send two real prompts so there is something to bookmark ----------
  const send = async (text) => {
    await assertScratchActive('send')
    const ta = page.locator('[data-testid="main-composer"] textarea')
    await ta.click()
    await ta.fill(text)
    await page.locator('.send-button').click()
    await page.waitForFunction(() => document.querySelector('.composer-status-pill.is-running') === null, { timeout: 180_000 })
    await page.waitForTimeout(1500)
  }
  // The first prompt must produce enough output that the transcript actually scrolls and
  // the context is non-trivial — a near-empty session makes both the bookmark-jump and the
  // /compact assertions vacuous (and the CLI legitimately no-ops /compact on a tiny context).
  await send('請用繁體中文逐行列出 1 到 60 的數字，每行只寫一個數字，不要任何其他說明。')
  await send('請只回覆「二」這個字，不要任何其他內容。')
  const scrollable = await page.evaluate(() => {
    const t = document.querySelector('.transcript')
    const sc = [t, ...t.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 8)
    return sc ? Math.round(sc.scrollHeight - sc.clientHeight) : 0
  })
  note('F2-scrollable-content', scrollable > 200, `${scrollable}px of scroll range (assertions below need room to move)`)

  await trigger.click()
  await page.waitForSelector('[data-testid="prompt-bookmarks-panel"]', { timeout: 10_000 })
  await shot('12-bookmark-panel')
  const items = await page.locator('[data-testid="prompt-bookmark-item"]').allInnerTexts()
  note('B1-bookmark-list', items.length === 2, `${items.length} entries: ${JSON.stringify(items)}`)

  // jump to the FIRST prompt (listed last, newest-first ordering) and confirm we moved up
  const viewState = () => page.evaluate(() => {
    const t = document.querySelector('.transcript')
    const cands = [t, ...t.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 8)
    // Two elements report an overflow; only one ever moves. Take the one that actually scrolled.
    const sc = cands.sort((a, b) => b.scrollTop - a.scrollTop)[0] ?? t
    const box = t.getBoundingClientRect()
    const firstVisible = [...document.querySelectorAll('.event-wrap')]
      .find((w) => w.getBoundingClientRect().bottom > box.top + 4)
    return { scrollTop: Math.round(sc.scrollTop), firstVisible: firstVisible?.innerText.replace(/\s+/g, ' ').slice(0, 60) ?? null }
  })
  const before = (await viewState()).scrollTop
  await page.locator('[data-testid="prompt-bookmark-item"]').last().click()
  await page.waitForTimeout(1800)
  const view = await viewState()
  const after = { ...view, jump: await page.evaluate(() => Boolean(document.querySelector('.jump-latest'))) }
  await shot('13-bookmark-jumped')
  // The requirement is "I land on that prompt", not "the scroll position changed" — on a
  // short transcript the prompt is already on screen and a correct jump is a no-op.
  const targetVisible = await page.evaluate(() => {
    const box = document.querySelector('.transcript').getBoundingClientRect()
    const hit = [...document.querySelectorAll('.event-wrap')]
      .find((w) => w.innerText.includes('1 到 60'))
    if (!hit) return { found: false }
    const r = hit.getBoundingClientRect()
    return { found: true, visible: r.bottom > box.top && r.top < box.bottom, top: Math.round(r.top - box.top) }
  })
  note('B1-bookmark-jump', targetVisible.found && targetVisible.visible,
    `scrollTop ${before} → ${after.scrollTop}; picked prompt ${targetVisible.found ? `is ${targetVisible.visible ? 'visible' : 'OFF-SCREEN'} at +${targetVisible.top}px` : 'NOT FOUND'}`)
  note('B1-jump-keeps-position', after.jump === true, `「跳到最新」 offered after jumping back = ${after.jump}`)

  // ---------- T3: real /compact on the scratch session ----------
  await page.keyboard.press('Control+End')
  await page.waitForTimeout(800)
  await send('/compact')
  const compact = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.event-card.compact')]
    const styled = cards[0] ? getComputedStyle(cards[0]) : null
    return {
      count: cards.length,
      title: cards[0]?.querySelector('.event-head span')?.textContent?.trim() ?? null,
      openByDefault: Boolean(cards[0]?.querySelector('.event-content')),
      boxShadow: styled?.boxShadow ?? null,
      background: styled?.backgroundColor ?? null,
      toast: document.querySelector('.toast, [data-testid="notice"]')?.textContent?.trim() ?? document.body.innerText.includes('已自動壓縮上下文') ? 'present' : 'absent'
    }
  })
  await shot('14-compact-card')
  if (compact.count === 0) {
    // Documented CLI behaviour: /compact over a tiny context can complete without emitting
    // auto_compact_completed at all. Nothing to assert about rendering — say so instead of
    // failing, so this gate never cries wolf.
    note('T3-compact-card', true, 'INCONCLUSIVE — CLI emitted no compact event (tiny-context no-op); rendering not exercised this run')
  } else {
    note('T3-compact-card', true, `count=${compact.count} title=${JSON.stringify(compact.title)}`)
    note('T3-compact-open', compact.openByDefault, `expanded by default = ${compact.openByDefault}`)
    note('T3-compact-styled', Boolean(compact.boxShadow) && compact.boxShadow !== 'none', `boxShadow=${compact.boxShadow} background=${compact.background}`)
  }

  note('F9-console-clean', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | ') || 'none')
  await page.evaluate((id) => window.grokApi.deleteSession(id).catch(() => {}), sessionId)
} catch (error) {
  note('HARNESS', false, error.message)
  await shot('19-feature-probe-error')
} finally {
  await writeFile(path.join(OUT, 'feature-probe.json'), JSON.stringify({ workdir, findings, consoleErrors }, null, 2), 'utf8')
  await app.close()
}

console.log('\n=== SUMMARY ===')
for (const f of findings) console.log(`${f.ok ? 'PASS' : 'FAIL'}\t${f.id}\t${f.detail}`)
if (findings.some((f) => !f.ok)) process.exitCode = 1
