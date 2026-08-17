// Diagnose CONTEXT + stuck "processing" cards when switching sessions.
// Real Electron, real CLI, no prompts.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave-session-switch')
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-switch-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail.slice(0, 240) : JSON.stringify(detail)}`)
}
const result = { profileDir, screenshots: [] }
const shoot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, name) })
  result.screenshots.push(name)
}

const snapshot = async (page) => page.evaluate(() => {
  const events = window.__grokSmoke.getSessionEvents?.() ?? []
  const kinds = {}
  for (const event of events) {
    const key = event.kind === 'turn' ? `turn:${event.status}` : event.kind === 'tool' ? `tool:${event.status}` : event.kind
    kinds[key] = (kinds[key] ?? 0) + 1
  }
  const context = document.querySelector('[data-context-zone="session"]')?.textContent?.trim() ?? ''
  const composer = document.querySelector('[data-testid="composer-status"]')?.textContent?.trim() ?? ''
  const working = [...document.querySelectorAll('.turn-marker')].map((node) => node.textContent?.trim())
  const thoughts = [...document.querySelectorAll('.event-card.thought .event-head span')].map((node) => node.textContent?.trim())
  const jump = document.querySelector('.jump-latest')?.textContent?.trim() ?? ''
  return {
    sessionId: window.__grokSmoke.getActiveSessionId?.() ?? null,
    eventCount: events.length,
    kinds,
    context,
    composer,
    working,
    thoughtCount: thoughts.length,
    jump,
    title: document.querySelector('.session-title h1')?.textContent?.trim() ?? ''
  }
})

const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })

  await page.locator('.status-pill').click()
  await page.getByText(/ACP 已連線|Connected/).first().waitFor({ timeout: 60_000 })

  const pair = await page.evaluate(async () => {
    const list = await window.grokApi.listSessions()
    const ranked = [...list].sort((a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0))
    const longOne = ranked.find((item) => (item.messageCount ?? 0) >= 4) ?? ranked[0]
    const other = ranked.find((item) => item.id !== longOne?.id) ?? null
    return {
      total: list.length,
      longOne,
      other,
      top: ranked.slice(0, 5).map((item) => ({ id: item.id, title: item.title, messageCount: item.messageCount, cwd: item.cwd }))
    }
  })
  result.pair = pair
  if (!pair.longOne || !pair.other) {
    check('have-two-sessions', false, pair)
    throw new Error('need two real sessions')
  }
  check('have-two-sessions', true, { long: pair.longOne.title, other: pair.other.title, messages: pair.longOne.messageCount })

  const open = async (session, label) => {
    const row = page.locator('[data-testid="session-list"] .session-row').filter({
      has: page.locator('.session-meta strong', { hasText: session.title })
    }).first()
    await row.scrollIntoViewIfNeeded()
    await row.locator('.session-open, button, .session-meta').first().click()
    await page.waitForFunction((title) => document.querySelector('.session-title h1')?.textContent?.trim() === title, session.title)
    await page.waitForTimeout(1500)
    const snap = await snapshot(page)
    result[label] = snap
    await shoot(page, `${label}.png`)
    return snap
  }

  const afterLong = await open(pair.longOne, '01-long')
  const afterOther = await open(pair.other, '02-other')
  const afterBack = await open(pair.longOne, '03-back-to-long')

  const stuckWorking = (snap) => (snap.working ?? []).filter((text) => text && text.includes('正在工作')).length
  check('other-session-not-showing-long-title', afterOther.title !== afterLong.title, { other: afterOther.title, long: afterLong.title })
  check('other-context-is-own-or-empty', !afterOther.context.includes('%') || afterOther.context !== afterLong.context || afterLong.context.includes('—'), {
    long: afterLong.context,
    other: afterOther.context
  })
  check('back-switch-does-not-leave-running-composer', !/執行中/.test(afterBack.composer), afterBack.composer)
  check('back-switch-does-not-stack-working-markers', stuckWorking(afterBack) <= 1, {
    long: stuckWorking(afterLong),
    other: stuckWorking(afterOther),
    back: stuckWorking(afterBack),
    working: afterBack.working,
    kinds: afterBack.kinds
  })
  check('other-switch-does-not-stack-working-markers', stuckWorking(afterOther) <= 1, {
    working: afterOther.working,
    kinds: afterOther.kinds,
    composer: afterOther.composer
  })
  const jumpUnread = (snap) => {
    const match = String(snap.jump ?? '').match(/(\d+)/)
    return match ? Number(match[1]) : 0
  }
  check('back-switch-does-not-flood-jump-unread', jumpUnread(afterBack) < 20, {
    jump: afterBack.jump,
    eventCount: afterBack.eventCount
  })
  check('back-switch-keeps-long-context', /62%|311k/.test(afterBack.context) || afterBack.context === afterLong.context, {
    long: afterLong.context,
    back: afterBack.context
  })
  check('other-context-not-copied-from-long', !afterOther.context.includes('%') || afterOther.context !== afterLong.context, {
    long: afterLong.context,
    other: afterOther.context
  })
  check('back-switch-event-count-stable', Math.abs((afterBack.eventCount ?? 0) - (afterLong.eventCount ?? 0)) < 30, {
    long: afterLong.eventCount,
    back: afterBack.eventCount
  })
} catch (error) {
  check('audit-crashed', false, error instanceof Error ? error.stack : String(error))
} finally {
  await app.close().catch(() => {})
  result.checks = checks
  result.passed = checks.filter((item) => item.ok).length
  result.failed = checks.filter((item) => !item.ok).length
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2))
  console.log(`\n${result.passed} passed / ${result.failed} failed — ${outDir}`)
  if (result.failed) process.exit(1)
}
