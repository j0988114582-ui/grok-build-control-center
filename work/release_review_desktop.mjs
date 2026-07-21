// Pre-release interactive review — desktop journey, driven as a real user.
// Uses real Grok CLI + real quota (tiny prompts). Native folder dialog is stubbed
// in the main process because Playwright cannot drive OS dialogs.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-review-'))
const workspace = await mkdtemp(path.join(tmpdir(), 'grok-review-ws-'))
await writeFile(path.join(workspace, 'README.md'), '# Review workspace\n', 'utf8')
const output = path.resolve('outputs', 'release-review')
await mkdir(output, { recursive: true })

const findings = []
const steps = []
const shots = []
const note = (id, ok, detail) => {
  steps.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? `  — ${detail}` : ''}`)
  if (!ok) findings.push({ id, detail })
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`] })
const page = await app.firstWindow()
page.setDefaultTimeout(60_000)
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
const shot = async (name) => {
  const file = path.join(output, name)
  await page.screenshot({ path: file })
  shots.push(file)
}

try {
  // Stub the native directory picker so "選擇專案開始" can be exercised.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
  }, workspace)

  await page.waitForLoadState('domcontentloaded')
  await page.getByText('GROK BUILD', { exact: true }).waitFor()
  await page.waitForTimeout(2_500)
  await shot('01-cold-start.png')
  note('cold-start-renders', true)

  const health = await page.evaluate(() => globalThis.__grokStarfieldHealth ?? null)
  note('starfield-alive', Boolean(health && health.frames > 0 && health.renderer !== 'none'), JSON.stringify(health))

  // ── Connect ──
  const connectButton = page.getByRole('button', { name: '連接本機 Grok' })
  if (await connectButton.isVisible().catch(() => false)) {
    await connectButton.click()
  }
  const connected = await page.locator('[aria-label^="總額度已使用"], [data-testid="quota-summary"]')
    .first().waitFor({ timeout: 90_000 }).then(() => true).catch(() => false)
  note('connect-to-grok', connected)
  await shot('02-connected.png')

  // ── Create a session in a real folder ──
  await page.getByRole('button', { name: '選擇專案開始' }).click()
  const composer = page.locator('.composer textarea, textarea').first()
  const sessionReady = await composer.waitFor({ timeout: 90_000 }).then(() => true).catch(() => false)
  note('create-session', sessionReady)
  await page.waitForTimeout(1_500)
  await shot('03-session-created.png')

  // ── Send a real (tiny) prompt ──
  await composer.fill('請只回覆兩個字：收到')
  await composer.press('Enter')
  const running = await page.locator('.stop-button, [aria-label*="停止"], .send-button[data-running="true"]')
    .first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false)
  await page.waitForTimeout(900)
  await shot('04-turn-running.png')
  note('prompt-starts-turn', running, running ? '' : 'no visible running affordance')

  // Mid-turn affordances a user would look for
  const midTurn = await page.evaluate(() => ({
    stop: Boolean(document.querySelector('.stop-button')),
    queueHint: document.body.innerText.includes('排隊') || document.body.innerText.includes('插話')
  }))
  note('mid-turn-controls', midTurn.stop, JSON.stringify(midTurn))

  const replied = await page.waitForFunction(
    () => document.querySelectorAll('.message-body, .transcript article').length > 1,
    undefined,
    { timeout: 120_000 }
  ).then(() => true).catch(() => false)
  await page.waitForTimeout(2_000)
  await shot('05-reply.png')
  note('grok-replies', replied)

  const transcriptText = await page.evaluate(() => document.querySelector('.transcript')?.innerText?.slice(0, 400) ?? '')
  note('reply-visible-in-transcript', transcriptText.length > 0, transcriptText.replace(/\s+/g, ' ').slice(0, 120))

  // ── Usage / quota updated ──
  await page.waitForTimeout(2_500)
  const usage = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="quota-summary"], .quota-reactor-main')
    return el?.innerText?.replace(/\s+/g, ' ').slice(0, 120) ?? null
  })
  note('usage-visible', Boolean(usage), usage ?? 'no quota element')

  // ── Command palette ──
  await page.keyboard.press('Control+Shift+P')
  const paletteOpen = await page.locator('.palette, [role="dialog"][aria-label*="命令"]').first()
    .waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
  await shot('06-command-palette.png')
  note('command-palette', paletteOpen)
  await page.keyboard.press('Escape')

  // ── Theme switch: light then back to dark ──
  await page.evaluate(async () => {
    const s = await window.grokApi.getSettings()
    await window.grokApi.saveSettings({ ...s, theme: 'light' })
  })
  await page.waitForTimeout(2_800)
  const lightHealth = await page.evaluate(() => globalThis.__grokStarfieldHealth ?? null)
  const lightTheme = await page.locator('.app').getAttribute('data-theme')
  await shot('07-light-theme.png')
  note('light-theme-applies-live', lightTheme === 'light', `theme=${lightTheme}`)
  note('light-starfield-alive', Boolean(lightHealth && lightHealth.renderer !== 'none' && lightHealth.frames > 0), JSON.stringify(lightHealth))

  await page.evaluate(async () => {
    const s = await window.grokApi.getSettings()
    await window.grokApi.saveSettings({ ...s, theme: 'dark' })
  })
  await page.waitForTimeout(2_800)
  const backHealth = await page.evaluate(() => globalThis.__grokStarfieldHealth ?? null)
  await shot('08-back-to-dark.png')
  note('dark-starfield-after-switch-back', Boolean(backHealth && backHealth.renderer !== 'none' && backHealth.frames > 0), JSON.stringify(backHealth))

  // ── Maximize (the user-reported wash bug) ──
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.waitForTimeout(3_000)
  const maxHealth = await page.evaluate(() => globalThis.__grokStarfieldHealth ?? null)
  await shot('09-maximized.png')
  note('starfield-survives-maximize', Boolean(maxHealth && maxHealth.renderer !== 'none' && maxHealth.frames > 0), JSON.stringify(maxHealth))

  // ── Sidebar / session list usability ──
  const sessionCount = await page.locator('.session-row, .session-list button').count()
  note('session-list-populated', sessionCount > 0, `rows=${sessionCount}`)

  // ── Settings drawer ──
  await page.getByRole('button', { name: /設定/ }).first().click().catch(() => null)
  await page.waitForTimeout(1_200)
  await shot('10-settings.png')
  const settingsOpen = await page.evaluate(() => document.body.innerText.includes('手機 QR 遙控'))
  note('settings-drawer-with-remote-panel', settingsOpen)

  note('no-console-errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (error) {
  note('harness-exception', false, error instanceof Error ? error.message : String(error))
} finally {
  await app.close().catch(() => null)
  const report = { steps, findings, shots, consoleErrors, workspace }
  await writeFile(path.join(output, 'desktop-review.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(`\nfindings: ${findings.length}`)
  process.exitCode = findings.length === 0 ? 0 : 1
}
