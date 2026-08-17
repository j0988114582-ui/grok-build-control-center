// Wave A2 — project-group + button and media path chips.
// Real Electron clicks + screenshots.
//
//   npm run build ; node work/wave_a2_sidebar_plus_gui_audit.mjs
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave-a2-plus')
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-a2-plus-'))
const scratchDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-a2-scratch-'))
await mkdir(outDir, { recursive: true })
await writeFile(path.join(scratchDir, 'clip.mp4'), Buffer.alloc(64))
await writeFile(path.join(scratchDir, 'voice.mp3'), Buffer.alloc(64))

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const result = { profileDir, scratchDir, screenshots: [] }
const shoot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, name) })
  result.screenshots.push(name)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
const consoleErrors = []
const pageErrors = []

try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(60_000)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })

  await page.locator('.status-pill').click()
  const connected = await page.getByText(/ACP 已連線|Connected/).first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false)
  check('cli-connected', connected, connected ? 'connected' : 'could not connect')

  const created = await page.evaluate(async (cwd) => {
    const capabilities = await window.grokApi.connect()
    const session = await window.grokApi.createSession(cwd)
    if (!session.sessionId) throw new Error('createSession returned no id')
    window.__grokSmoke.activateSession({
      id: session.sessionId,
      cwd,
      title: 'A2 第一則對話',
      updatedAt: new Date().toISOString()
    })
    if (capabilities.modelState) window.__grokSmoke.setModelState(capabilities.modelState)
    return session.sessionId
  }, scratchDir)
  await page.waitForSelector('[data-testid="session-group-add"]')
  await shoot(page, '01-group-plus-visible.png')

  const plusCount = await page.getByTestId('session-group-add').count()
  check('plus-on-each-project-group', plusCount >= 1, `groups with +=${plusCount}`)

  const targetPlus = page.getByRole('button', { name: new RegExp(`在「${path.basename(scratchDir)}`) })
  const addLabel = await targetPlus.getAttribute('aria-label')
  check('plus-has-project-label', Boolean(addLabel && addLabel.includes('新增對話')), addLabel)

  const rowsBefore = await page.locator('[data-testid="session-list"] .session-row').count()
  await targetPlus.click()
  await page.waitForFunction((before) =>
    document.querySelectorAll('[data-testid="session-list"] .session-row').length > before,
  rowsBefore)
  const rowsAfter = await page.locator('[data-testid="session-list"] .session-list .session-row').count().catch(() => 0)
  const rowsAfterAll = await page.locator('[data-testid="session-list"] .session-row').count()
  check('plus-creates-another-session', rowsAfterAll > rowsBefore, { rowsBefore, rowsAfter, rowsAfterAll })
  await shoot(page, '02-after-plus-click.png')

  const pickFolder = page.getByTestId('new-session-pick-folder')
  check('top-button-renamed', (await pickFolder.innerText()).includes('選資料夾開始'), await pickFolder.innerText())

  const videoPath = path.join(scratchDir, 'clip.mp4')
  const audioPath = path.join(scratchDir, 'voice.mp3')
  await page.evaluate((paths) => {
    const sessionId = window.__grokSmoke.getActiveSessionId()
    if (!sessionId) throw new Error('no active session for path chips')
    window.__grokSmoke.dropLocalPaths(sessionId, paths)
  }, [videoPath, audioPath])
  const chips = page.getByTestId('path-chip')
  await chips.first().waitFor({ state: 'visible' })
  const chipTexts = await chips.allInnerTexts()
  check('video-path-chip', chipTexts.some((text) => text.includes('clip.mp4')), chipTexts)
  check('audio-path-chip', chipTexts.some((text) => text.includes('voice.mp3')), chipTexts)
  await shoot(page, '03-media-path-chips.png')

  check('renderer-console-clean', consoleErrors.length === 0 && pageErrors.length === 0, {
    consoleErrors,
    pageErrors
  })
} catch (error) {
  check('audit-crashed', false, error instanceof Error ? error.stack : String(error))
} finally {
  await app.close().catch(() => {})
  const failed = checks.filter((item) => !item.ok).length
  result.checks = checks
  result.passed = checks.filter((item) => item.ok).length
  result.failed = failed
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2))
  console.log(`\n${result.passed} passed / ${failed} failed — ${outDir}`)
  if (failed) process.exit(1)
}
