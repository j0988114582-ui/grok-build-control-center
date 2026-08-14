// Wave "sidebar active-only filter" GUI audit.
// Real Electron window, real local session list. Unit-green does not count —
// this script is the acceptance gate, same as waves 1-3.
//
//   node work/wave_active_filter_gui_audit.mjs      (after npm run build)
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const DAY = 86_400_000
const outDir = path.resolve('output', 'playwright', 'wave-active-filter')
// One profile dir reused by both launches — that reuse IS the "remembers after
// restart" test, since electron-store writes settings under --user-data-dir.
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-active-filter-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const boot = async () => {
  const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
  const page = await app.firstWindow()
  page.setDefaultTimeout(60_000)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.waitForSelector('[data-testid="session-list"] .session-row')
  return { app, page }
}

/** Titles of every row actually painted in the sidebar. */
const rows = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="session-list"] .session-row')]
    .map((row) => row.querySelector('.session-meta strong')?.textContent?.trim() ?? ''))
const caption = (page) => page.locator('[data-testid="session-caption-count"]').innerText()
const toggle = (page) => page.locator('[data-testid="active-only-toggle"]')
const cleanupLabel = (page) => page.locator('[data-testid="cleanup-suggest-button"]').innerText().catch(() => '(none)')
const captionSettles = (page, previous) => page.waitForFunction(
  (before) => document.querySelector('[data-testid="session-caption-count"]')?.textContent !== before,
  previous
)

const result = { profileDir, screenshots: [] }
const shoot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, name) })
  result.screenshots.push(name)
}

let handle = null
try {
  handle = await boot()
  let page = handle.page

  // Ground truth read from the same source the sidebar reads.
  const pool = await page.evaluate(async (day) => {
    const list = await window.grokApi.listSessions()
    const activity = (session) => Date.parse(session.updatedAt ?? session.createdAt ?? '')
    const within = (days) => {
      const cutoff = Date.now() - days * day
      return list.filter((session) => Number.isFinite(activity(session)) && activity(session) >= cutoff).length
    }
    return { total: list.length, within4: within(4), within20: within(20) }
  }, DAY)
  result.pool = pool
  console.log(`local sessions: ${pool.total} total / ${pool.within4} active in 4d / ${pool.within20} in 20d`)

  // ---- 1. Default is OFF, and OFF lists everything -------------------------
  const defaultChecked = await toggle(page).isChecked()
  const allRows = await rows(page)
  const offCaption = (await caption(page)).trim()
  const offCleanup = await cleanupLabel(page)
  check('default-off', defaultChecked === false, `checkbox checked=${defaultChecked}`)
  check('off-lists-every-session', allRows.length === pool.total,
    { domRows: allRows.length, listSessions: pool.total, caption: offCaption })
  check('off-caption-is-a-plain-count', /^\d+$/.test(offCaption), offCaption)
  await shoot(page, '01-filter-off.png')

  // ---- 2. Turning it ON shrinks the list to the 4-day window ---------------
  await toggle(page).click()
  await captionSettles(page, offCaption)
  const onRows = await rows(page)
  const onCaption = (await caption(page)).trim()
  const onCleanup = await cleanupLabel(page)
  check('on-matches-the-4-day-window', onRows.length === pool.within4,
    { domRows: onRows.length, expected: pool.within4 })
  check('on-actually-hides-something', onRows.length < allRows.length,
    `${allRows.length} → ${onRows.length}`)
  check('caption-reads-N-活躍-4-天', /^\d+ · 活躍 4 天$/.test(onCaption), onCaption)
  const folderAll = await page.locator('[data-testid="folder-filter"] option[value="all"]').innerText()
  check('folder-dropdown-agrees-with-caption', folderAll.includes(`（${onRows.length}）`),
    { folderOption: folderAll, caption: onCaption })
  check('cleanup-suggestions-unchanged', onCleanup === offCleanup, { off: offCleanup, on: onCleanup })
  await shoot(page, '02-filter-on-4-days.png')

  const dropped = allRows.filter((title) => !onRows.includes(title))
  result.droppedSample = dropped.slice(0, 5)

  // ---- 3. A hidden session comes back the moment it is pinned --------------
  if (!dropped.length) {
    check('pinned-survives-filter', false, 'no session was old enough to hide — cannot test the pin exception')
  } else {
    const victim = dropped[0]
    result.victim = victim
    await toggle(page).click() // OFF so the row is reachable
    const pinRow = page.locator('[data-testid="session-list"] .session-row')
      .filter({ has: page.getByRole('button', { name: `釘選 ${victim}`, exact: true }) }).first()
    await pinRow.hover()
    await pinRow.getByRole('button', { name: `釘選 ${victim}`, exact: true }).click()
    await page.waitForSelector('.session-group.pinned')
    await toggle(page).click() // ON again
    await page.waitForFunction(() => Boolean(document.querySelector('.session-group.pinned')))
    const pinnedTitles = await page.locator('.session-group.pinned .session-meta strong').allInnerTexts()
    check('pinned-survives-filter', pinnedTitles.some((title) => title.trim() === victim),
      { victim, pinnedTitles })
    await shoot(page, '03-pinned-stale-still-visible.png')
  }

  // ---- 4. The conversation you have open is never hidden -------------------
  const ghost = {
    id: 'wave-active-filter-ghost',
    cwd: 'C:\\gui-audit\\stale',
    title: 'GUI 稽核 · 100 天沒動的對話',
    updatedAt: new Date(Date.now() - 100 * DAY).toISOString(),
    messageCount: 3
  }
  const fresher = {
    id: 'wave-active-filter-other',
    cwd: 'C:\\gui-audit\\fresh',
    title: 'GUI 稽核 · 今天的對話',
    updatedAt: new Date().toISOString(),
    messageCount: 1
  }
  await page.evaluate((session) => window.__grokSmoke.activateSession(session), ghost)
  await page.waitForFunction((title) =>
    [...document.querySelectorAll('[data-testid="session-list"] .session-meta strong')]
      .some((node) => node.textContent?.trim() === title), ghost.title)
  check('open-session-never-hidden', true, `${ghost.title} (100d old) stays listed while it is the open session`)
  await shoot(page, '04-open-stale-session-visible.png')

  // Prove it is the exception doing the work: open something else and it goes.
  await page.evaluate((session) => window.__grokSmoke.activateSession(session), fresher)
  await page.waitForFunction((title) =>
    ![...document.querySelectorAll('[data-testid="session-list"] .session-meta strong')]
      .some((node) => node.textContent?.trim() === title), ghost.title)
  const afterSwitch = await rows(page)
  check('stale-session-hides-once-it-is-no-longer-open',
    !afterSwitch.includes(ghost.title) && afterSwitch.includes(fresher.title),
    { ghostStillListed: afterSwitch.includes(ghost.title), fresherListed: afterSwitch.includes(fresher.title) })

  // ---- 5. Settings page: same toggle, live day slider ----------------------
  await page.locator('.sidebar-footer button', { hasText: '設定' }).click()
  await page.waitForSelector('[data-testid="sidebar-sessions-settings"]')
  const settingsChecked = await page.locator('[data-testid="settings-active-only"]').isChecked()
  check('settings-mirrors-sidebar-state', settingsChecked === true, `settings checkbox checked=${settingsChecked}`)
  // Scroll the whole section (incl. fine print) into frame so the evidence shows it.
  await page.locator('[data-testid="sidebar-sessions-fine-print"]').scrollIntoViewIfNeeded()
  const finePrint = await page.locator('[data-testid="sidebar-sessions-fine-print"]').innerText()
  check('fine-print-says-what-it-does-not-do',
    /不會刪除任何對話/.test(finePrint) && /10 天規則/.test(finePrint), finePrint)
  await shoot(page, '05-settings-section.png')

  const beforeSlider = (await caption(page)).trim()
  await page.locator('[data-testid="settings-active-days"]').fill('20')
  await captionSettles(page, beforeSlider)
  const caption20 = (await caption(page)).trim()
  const rows20 = await rows(page)
  const dayOutput = await page.locator('[data-testid="settings-active-days-output"]').innerText()
  check('day-slider-is-live', /^\d+ · 活躍 20 天$/.test(caption20) && dayOutput.trim() === '20 天',
    { caption: caption20, output: dayOutput })
  check('wider-window-lists-more', rows20.length >= onRows.length, { at4: onRows.length, at20: rows20.length })
  await shoot(page, '06-settings-20-days-live.png')

  await page.getByRole('button', { name: '儲存設定' }).click()
  await page.waitForSelector('[data-testid="settings-drawer"]', { state: 'detached' })

  // ---- 6. Restart: the setting is still there ------------------------------
  await handle.app.close()
  handle = await boot()
  page = handle.page
  const restoredChecked = await toggle(page).isChecked()
  const restoredCaption = (await caption(page)).trim()
  const restoredPinned = await page.locator('.session-group.pinned .session-meta strong').allInnerTexts()
  check('survives-restart', restoredChecked === true && /^\d+ · 活躍 20 天$/.test(restoredCaption),
    { restoredChecked, restoredCaption })
  if (result.victim) {
    check('pin-exception-survives-restart', restoredPinned.some((title) => title.trim() === result.victim),
      { victim: result.victim, restoredPinned })
  }
  await shoot(page, '07-after-restart.png')

  // Turning it back off restores the full list in the restarted app.
  await toggle(page).click()
  await captionSettles(page, restoredCaption)
  const finalRows = await rows(page)
  check('off-again-restores-everything', finalRows.length === pool.total,
    { domRows: finalRows.length, listSessions: pool.total })
  await shoot(page, '08-toggled-back-off.png')
} catch (error) {
  check('wave-active-filter-script', false, String(error?.stack ?? error))
} finally {
  if (handle?.app) {
    try { await handle.app.close() } catch { /* ignore */ }
  }
}

result.checks = checks
result.passed = checks.filter((item) => item.ok).length
result.failed = checks.filter((item) => !item.ok).length
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
console.log(`\n${result.passed} passed / ${result.failed} failed — screenshots in ${outDir}`)
if (result.failed) process.exitCode = 1
