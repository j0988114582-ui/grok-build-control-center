// Wave 2 GUI audit: official subagent roster (read-only).
//
// Spawns a real subagent through the real CLI and proves the background panel
// shows the official `_x.ai/subagent/list_running` card — one card per child,
// labelled as officially reported, with no cancel control anywhere on it.
//
// Polls explicitly and logs a timeline rather than using a blind waitForFunction,
// so a failure says *why* (no child ran / permission modal blocking / roster
// answered but UI ignored it) instead of just timing out.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave-subagent-roster')
const scratchDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-subagent-'))
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-subagent-profile-'))
await mkdir(outDir, { recursive: true })

const ROSTER_WAIT_MS = 180_000
const CLEAR_WAIT_MS = 120_000
const SNAP_MS = 3_000
const OFFICIAL = /執行中（官方回報）/

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
let sessionId = null
let watching = false
let approver = null
const result = { screenshots: [], timeline: [], approvals: [] }

/** One read of everything that matters, straight from the live window. */
const snapshot = (page, id) => page.evaluate(async (sid) => {
  const panel = document.querySelector('[data-testid="background-tasks-panel"]')
  const roster = await window.grokApi.listRunningSubagents(sid).catch((e) => `ERR ${String(e)}`)
  return {
    rosterCount: Array.isArray(roster) ? roster.length : roster,
    rosterFirst: Array.isArray(roster) && roster[0] ? { id: roster[0].subagentId, type: roster[0].subagentType, desc: roster[0].description } : null,
    panelText: panel?.innerText ?? '(no panel)',
    permissionModal: Boolean(document.querySelector('.permission-modal')),
    busy: /Grok 正在工作|Reasoning/.test(document.body.innerText)
  }
}, id).catch((error) => ({ error: String(error).slice(0, 200) }))

try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })

  await page.locator('.status-pill').click()
  await page.getByText(/ACP 已連線|Connected/).first().waitFor({ timeout: 60_000 })
  sessionId = await page.evaluate(async (cwd) => {
    await window.grokApi.connect()
    const created = await window.grokApi.createSession(cwd)
    window.__grokSmoke.activateSession({ id: created.sessionId, cwd, title: 'subagent roster GUI audit' })
    return created.sessionId
  }, scratchDir)
  check('session-ready', Boolean(sessionId), 'created + activated')

  const baseline = await page.evaluate(async (id) => window.grokApi.listRunningSubagents(id), sessionId)
  check('list-running-answers', Array.isArray(baseline), `baseline roster: ${JSON.stringify(baseline)}`)

  await page.locator('[data-testid="open-background-tasks"]').click()
  await page.waitForSelector('[data-testid="background-tasks-panel"]')

  // Approve permission prompts the way a watching operator would; the agent needs
  // approval before it can spawn anything.
  watching = true
  approver = (async () => {
    while (watching) {
      if (page.isClosed()) return
      const clicked = await page.evaluate(() => {
        const modal = document.querySelector('.permission-modal:not(.plan-approval-modal)')
        if (!modal) return null
        const buttons = [...modal.querySelectorAll('button')]
        const allow = buttons.find((b) => !b.className.includes('danger-option') && /允許|同意|Allow|一律/i.test(b.textContent ?? ''))
          ?? buttons.find((b) => !b.className.includes('danger-option'))
        if (!allow) return null
        const label = allow.textContent?.trim().slice(0, 60) ?? ''
        allow.click()
        return label
      }).catch(() => null)
      if (clicked) {
        result.approvals.push(clicked)
        console.log(`  [approved] ${clicked.replace(/\s+/g, ' ')}`)
      }
      await sleep(400)
    }
  })()

  const promptText = [
    '請用 spawn_subagent 派出一個 general-purpose 子代理，',
    '任務是：寫一段約 300 字的繁體中文短文，說明「什麼是版本控制」，並在最後條列三個常見用途。',
    '你自己在等待期間不要做別的事，也不要建立或修改任何檔案。'
  ].join('')
  await page.evaluate(async ({ id, text }) => {
    window.grokApi.sendPrompt(id, [{ type: 'text', text }]).catch(() => {})
  }, { id: sessionId, text: promptText })

  const started = Date.now()
  let officialPanel = null
  while (Date.now() - started < ROSTER_WAIT_MS) {
    const snap = await snapshot(page, sessionId)
    const at = Math.round((Date.now() - started) / 1000)
    result.timeline.push({ at, ...snap, panelText: undefined })
    console.log(`  t+${at}s roster=${JSON.stringify(snap.rosterCount)} perm=${snap.permissionModal} busy=${snap.busy}${snap.rosterFirst ? ` first=${snap.rosterFirst.desc}` : ''}`)
    if (typeof snap.panelText === 'string' && OFFICIAL.test(snap.panelText)) { officialPanel = snap.panelText; break }
    await sleep(SNAP_MS)
  }

  check('official-running-card-visible', Boolean(officialPanel),
    officialPanel ? officialPanel.replace(/\s+/g, ' ').slice(0, 240) : 'never appeared — see timeline in result.json')
  await page.screenshot({ path: path.join(outDir, officialPanel ? '01-official-subagent-card.png' : '00-failure-state.png') })
  result.screenshots.push(officialPanel ? '01-official-subagent-card.png' : '00-failure-state.png')

  if (officialPanel) {
    const shape = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="background-tasks-panel"]')
      const text = panel?.innerText ?? ''
      return {
        officialCount: (text.match(/執行中（官方回報）/g) ?? []).length,
        cancelish: [...(panel?.querySelectorAll('button') ?? [])]
          .map((b) => b.textContent?.trim() ?? '')
          .filter((label) => /取消子代理|終止子代理|kill/i.test(label))
      }
    })
    check('one-card-per-subagent', shape.officialCount === 1, shape)
    check('no-cancel-control', shape.cancelish.length === 0, shape.cancelish)

    // The card must not keep claiming it runs after the child is gone.
    const clearStart = Date.now()
    let cleared = false
    while (Date.now() - clearStart < CLEAR_WAIT_MS) {
      const snap = await snapshot(page, sessionId)
      if (typeof snap.panelText === 'string' && !OFFICIAL.test(snap.panelText)) { cleared = true; break }
      await sleep(SNAP_MS)
    }
    check('roster-card-clears-when-child-finishes', cleared, cleared ? 'card gone once the child left the roster' : 'still showing after the wait')
    await page.screenshot({ path: path.join(outDir, '02-after-child-finished.png') })
    result.screenshots.push('02-after-child-finished.png')
  }
} catch (error) {
  check('subagent-roster-script', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  // Must run on every path: an orphaned approver loop keeps node alive forever.
  watching = false
  if (approver) await approver.catch(() => {})
  if (sessionId) {
    try {
      await (await app.firstWindow()).evaluate(async (id) => { await window.grokApi.deleteSession(id) }, sessionId)
    } catch { /* ignore */ }
  }
  await app.close().catch(() => {})
}

result.checks = checks
result.passed = checks.filter((item) => item.ok).length
result.failed = checks.filter((item) => !item.ok).length
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
console.log(`\n${result.passed} passed / ${result.failed} failed — screenshots in ${outDir}`)
if (result.failed) process.exitCode = 1
