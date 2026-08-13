// Wave 2 live GUI: activity-first panel, collapsed forms, no transcript spam, toast, palette.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave2-gui-audit')
const scratchDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-wave2-'))
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-wave2-profile-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
let sessionId = null
const consoleErrors = []
const pageErrors = []

try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })

  await page.locator('.status-pill').click()
  await page.getByText(/ACP 已連線|Connected/).first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(300)
  const noticeBox = await page.locator('.notice').boundingBox().catch(() => null)
  check('toast-is-top', Boolean(noticeBox && noticeBox.y < 120), noticeBox)

  const setup = await page.evaluate(async (cwd) => {
    const capabilities = await window.grokApi.connect()
    const created = await window.grokApi.createSession(cwd)
    if (!created.sessionId) throw new Error('no session')
    const models = created.models ?? capabilities.modelState
    window.__grokSmoke.activateSession({ id: created.sessionId, cwd, title: 'wave2 GUI audit' })
    if (models) window.__grokSmoke.setModelState(models)
    return { sessionId: created.sessionId, commandNames: (capabilities.commands ?? []).map((item) => item.name) }
  }, scratchDir)
  sessionId = setup.sessionId

  const cleanup = page.locator('[data-testid="cleanup-suggest-button"]')
  if (await cleanup.count()) {
    const box = await cleanup.boundingBox()
    check('cleanup-trigger-compact', Boolean(box && box.height <= 40), box)
    check('cleanup-panel-default-closed', !(await page.locator('[data-testid="cleanup-suggest-panel"]').isVisible()), 'closed')
  } else {
    check('cleanup-trigger-compact', true, 'no candidates in this profile')
  }

  await page.locator('[data-testid="open-background-tasks"]').click()
  await page.waitForSelector('[data-testid="background-tasks-panel"]')
  const order = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="background-tasks-panel"]')
    if (!panel) return {}
    const activity = panel.querySelector('[aria-label="背景活動清單"]')
    const loop = panel.querySelector('.bgtasks-loop-form')
    const auto = panel.querySelector('[data-testid="bgtasks-autonomous"]')
    const position = (node) => {
      if (!node) return -1
      const all = [...panel.querySelectorAll('*')]
      return all.indexOf(node)
    }
    return {
      activity: position(activity),
      loop: position(loop),
      auto: position(auto),
      loopOpen: loop?.closest('details')?.open ?? null,
      autoOpen: auto?.closest('details')?.open ?? null,
      loopUnavailable: Boolean(panel.querySelector('[data-testid="bgtasks-loop-unavailable"]'))
    }
  })
  check('activity-before-forms', order.activity >= 0 && order.activity < order.loop && order.loop < order.auto, order)
  check('forms-default-closed', order.loopOpen === false && order.autoOpen === false, order)
  check('loop-unavailable-visible-when-missing', setup.commandNames.includes('loop') || order.loopUnavailable, setup.commandNames)
  await page.screenshot({ path: path.join(outDir, '01-background-activity-first.png') })
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+Shift+P')
  await page.waitForTimeout(400)
  const palette = await page.locator('[role="dialog"], .command-palette, [data-testid="command-palette"]').first().innerText()
  check('palette-zh', /壓縮對話|一律核准|context 用量|深度研究|工作流|自主目標/.test(palette), palette.slice(0, 400))
  await page.screenshot({ path: path.join(outDir, '02-palette-zh.png') })
  await page.keyboard.press('Escape')

  await page.evaluate((id) => {
    window.__grokSmoke.seedSessionEvents(id, [
      { id: `${id}:cmd`, sessionId: id, kind: 'commands', commands: [{ name: 'compact' }] },
      { id: `${id}:mode`, sessionId: id, kind: 'mode', modeId: 'agent' },
      { id: `${id}:msg`, sessionId: id, kind: 'message', role: 'assistant', text: 'seeded visible reply' },
      { id: `${id}:thought`, sessionId: id, kind: 'thought', text: 'thinking' }
    ])
  }, sessionId)
  await page.waitForTimeout(300)
  const body = await page.locator('.transcript').innerText()
  check('no-commands-updated-card', !/Commands updated/.test(body), body.slice(0, 300))
  check('thought-label-zh', /推理/.test(body), body.slice(0, 300))
  await page.screenshot({ path: path.join(outDir, '03-transcript-no-spam.png') })

  const composer = page.locator('[data-testid="main-composer"] textarea')
  if (await composer.isEnabled()) {
    await composer.fill('只回 WAVE2_OK 三個字，不要用工具。')
    await page.locator('.send-button').click()
    await page.locator('[data-testid="composer-status"] .is-running').waitFor({ timeout: 30_000 }).catch(() => {})
    const rail = page.locator('[data-testid="command-rail"]')
    if (await rail.isVisible().catch(() => false)) {
      const railBox = await rail.boundingBox()
      const toast = await page.locator('.notice').boundingBox().catch(() => null)
      const overlap = Boolean(railBox && toast
        && toast.x < railBox.x + railBox.width
        && toast.x + toast.width > railBox.x
        && toast.y < railBox.y + railBox.height
        && toast.y + toast.height > railBox.y)
      check('toast-not-over-rail', !overlap, { toast, railBox })
    }
    const deadline = Date.now() + 60_000
    let done = false
    while (Date.now() < deadline) {
      const running = await page.locator('[data-testid="composer-status"] .is-running').isVisible().catch(() => false)
      if (!running) { done = true; break }
      await page.waitForTimeout(1000)
    }
    const after = await page.locator('.transcript').innerText()
    check('no-unsupported-session-info', !/Unsupported Grok event: session_info_update/.test(after), after.slice(0, 400))
    check('short-prompt-finished', done, 'turn ended')
    await page.screenshot({ path: path.join(outDir, '04-after-short-prompt.png') })
  } else {
    check('toast-not-over-rail', false, 'composer locked')
  }

  check('renderer-console-clean', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })
} catch (error) {
  check('wave2-script', false, String(error))
  try { await (await app.firstWindow()).screenshot({ path: path.join(outDir, '99-error.png') }) } catch { /* ignore */ }
} finally {
  if (sessionId) {
    try {
      await (await app.firstWindow()).evaluate(async (id) => { await window.grokApi.deleteSession(id) }, sessionId)
    } catch { /* ignore */ }
  }
  await app.close()
}

const result = { sessionId, checks, consoleErrors, pageErrors }
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
if (checks.some((item) => !item.ok)) process.exitCode = 1
