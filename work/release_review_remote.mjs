// Pre-release interactive review — theme via real UI + full remote journey with a
// browser standing in for the phone, against the REAL app, REAL tunnel, REAL Grok.
import { _electron as electron, chromium } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-review2-'))
const workspace = await mkdtemp(path.join(tmpdir(), 'grok-review2-ws-'))
await writeFile(path.join(workspace, 'README.md'), '# Remote review workspace\n', 'utf8')
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
page.on('dialog', (dialog) => { void dialog.accept() })
let phone = null
let browser = null
const shot = async (target, name) => {
  const file = path.join(output, name)
  await target.screenshot({ path: file })
  shots.push(file)
}

try {
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
  }, workspace)
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('GROK BUILD', { exact: true }).waitFor()

  const connectButton = page.getByRole('button', { name: '連接本機 Grok' })
  if (await connectButton.isVisible().catch(() => false)) await connectButton.click()
  await page.locator('[data-testid="quota-summary"], [aria-label^="總額度已使用"]').first()
    .waitFor({ timeout: 90_000 }).catch(() => null)
  await page.getByRole('button', { name: '選擇專案開始' }).click()
  await page.locator('.composer textarea, textarea').first().waitFor({ timeout: 90_000 })
  note('setup-session-ready', true)

  // ── Theme through the real UI control ──
  await page.getByRole('button', { name: /設定/ }).first().click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /亮色/ }).first().click()
  await page.waitForTimeout(3_000)
  const lightTheme = await page.locator('.app').getAttribute('data-theme')
  const lightHealth = await page.evaluate(() => globalThis.__grokStarfieldHealth ?? null)
  await shot(page, 'r01-light-via-ui.png')
  note('light-theme-via-ui', lightTheme === 'light', `theme=${lightTheme}`)
  note('light-starfield-alive', Boolean(lightHealth && lightHealth.renderer !== 'none' && lightHealth.frames > 0), JSON.stringify(lightHealth))

  await page.getByRole('button', { name: /深色/ }).first().click()
  await page.waitForTimeout(3_000)
  const darkHealth = await page.evaluate(() => globalThis.__grokStarfieldHealth ?? null)
  note('dark-starfield-after-toggle', Boolean(darkHealth && darkHealth.renderer !== 'none' && darkHealth.frames > 0), JSON.stringify(darkHealth))

  // ── Remote panel (lives under 功能矩陣, not 設定 — see discoverability finding) ──
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /功能矩陣/ }).first().click()
  await page.waitForTimeout(900)
  const remotePanel = page.locator('[data-testid="remote-panel"]')
  await remotePanel.scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await shot(page, 'r02-remote-panel.png')
  note('remote-panel-present', await remotePanel.isVisible())

  await page.locator('[data-testid="remote-quick-tunnel"]').check()
  await page.locator('[data-testid="remote-enable"]').click()
  const pairUrlEl = page.locator('[data-testid="remote-pair-url"]')
  const enabled = await pairUrlEl.waitFor({ timeout: 180_000 }).then(() => true).catch(() => false)
  note('remote-enable-with-tunnel', enabled)
  if (!enabled) throw new Error('remote enable failed; aborting remote journey')

  const pairUrl = (await pairUrlEl.innerText()).trim()
  const pin = (await page.locator('[data-testid="remote-pin"]').innerText()).replace(/\D/g, '').slice(0, 6)
  const isPublic = /trycloudflare\.com/.test(pairUrl)
  note('pair-url-is-public', isPublic, pairUrl.replace(/t=.*/, 't=<secret>'))
  await shot(page, 'r03-qr-ready.png')

  // ── Phone (browser) ──
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
    // SPA CSP (script-src 'self') blocks Playwright string eval; CSP itself is
    // covered by tests/remote-server.test.ts — here we test behaviour.
    bypassCSP: true
  })
  phone = await context.newPage()
  phone.setDefaultTimeout(45_000)
  phone.on('dialog', (dialog) => { void dialog.accept() })
  const phoneErrors = []
  phone.on('console', (m) => { if (m.type() === 'error') phoneErrors.push(m.text()) })

  await phone.goto(pairUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await phone.waitForSelector('#pin-pad button')
  await shot(phone, 'r04-phone-pair.png')
  note('phone-pair-page-loads-over-tunnel', true)

  for (const ch of pin) {
    await phone.locator('#pin-pad button', { hasText: new RegExp(`^${ch}$`) }).first().click()
  }
  await phone.locator('#pair-btn').click()
  const paired = await phone.waitForSelector('#main-panel:not(.hidden)', { timeout: 30_000 }).then(() => true).catch(() => false)
  note('phone-pairs-with-pin', paired)

  const focusReady = await phone.waitForFunction(
    "document.getElementById('focus-status').textContent.includes('焦點就緒')",
    undefined,
    { timeout: 45_000 }
  ).then(() => true).catch(() => false)
  await shot(phone, 'r05-phone-main.png')
  note('phone-auto-focus-ready', focusReady, await phone.locator('#focus-status').innerText().catch(() => ''))

  // Model / mode pickers fed by REAL capabilities
  await phone.locator('#overflow-toggle').click()
  await phone.waitForSelector('#overflow-panel:not(.hidden)')
  await phone.waitForTimeout(2_000)
  const pickers = await phone.evaluate(() => ({
    modelHidden: document.getElementById('model-select-wrap').classList.contains('hidden'),
    models: [...document.getElementById('model-select').options].map((o) => o.textContent),
    modeHidden: document.getElementById('mode-select-wrap').classList.contains('hidden'),
    modes: [...document.getElementById('mode-select').options].map((o) => o.textContent),
    cwds: [...document.getElementById('cwd-select').options].map((o) => o.textContent)
  }))
  await shot(phone, 'r06-phone-pickers.png')
  note('phone-model-picker-from-real-caps', !pickers.modelHidden && pickers.models.length > 0, JSON.stringify(pickers.models).slice(0, 160))
  note('phone-mode-picker-from-real-caps', !pickers.modeHidden && pickers.modes.length > 0, JSON.stringify(pickers.modes).slice(0, 120))
  note('phone-cwd-list-populated', pickers.cwds.length > 0 && !pickers.cwds[0].includes('無可用'), JSON.stringify(pickers.cwds).slice(0, 120))
  await phone.locator('#overflow-toggle').click()

  // ── Real prompt from the phone, answered by real Grok ──
  await phone.fill('#prompt', '請只回覆兩個字：遠端')
  const t0 = Date.now()
  await phone.locator('#send-btn').click()
  const accepted = await phone.waitForFunction(
    "document.getElementById('notices').textContent.includes('已送出')",
    undefined,
    { timeout: 20_000 }
  ).then(() => true).catch(() => false)
  const acceptMs = Date.now() - t0
  note('phone-prompt-accepted-fast', accepted && acceptMs < 8_000, `${acceptMs}ms`)

  const phoneSawReply = await phone.waitForFunction(
    "document.getElementById('tail').innerText.includes('遠端')",
    undefined,
    { timeout: 120_000 }
  ).then(() => true).catch(() => false)
  await phone.waitForTimeout(1_500)
  await shot(phone, 'r07-phone-reply.png')
  note('phone-sees-grok-reply', phoneSawReply)

  const desktopSawIt = await page.evaluate(() => document.querySelector('.transcript')?.innerText?.includes('遠端') ?? false)
  await shot(page, 'r08-desktop-mirrors-phone.png')
  note('desktop-mirrors-phone-turn', desktopSawIt)

  // Send button must re-enable after the turn
  const reEnabled = await phone.waitForFunction(
    "!document.getElementById('send-btn').disabled",
    undefined,
    { timeout: 30_000 }
  ).then(() => true).catch(() => false)
  note('phone-send-reenabled', reEnabled)

  // ── Logout from the phone ──
  await phone.locator('#logout-btn').click()
  const backToPair = await phone.waitForSelector('#pair-panel:not(.hidden)', { timeout: 20_000 }).then(() => true).catch(() => false)
  await shot(phone, 'r09-phone-logout.png')
  note('phone-logout-returns-to-pair', backToPair)

  await page.waitForTimeout(2_000)
  const desktopBanner = await page.locator('[data-testid="remote-banner"]').innerText().catch(() => '')
  note('desktop-reflects-logout', /過期|已過期/.test(desktopBanner), desktopBanner)

  // ── Does the persistent toast block the drawer buttons underneath? ──
  const blocked = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="remote-disable"]')
    if (!button) return { checked: false }
    const rect = button.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const notice = document.querySelector('.notice')
    return {
      checked: true,
      blockedBy: top === button ? null : (top?.className ?? top?.tagName ?? 'unknown'),
      noticePresent: Boolean(notice),
      noticeText: notice?.innerText?.replace(/\s+/g, ' ').slice(0, 60) ?? null
    }
  })
  note('drawer-buttons-not-blocked-by-toast', blocked.checked && blocked.blockedBy === null, JSON.stringify(blocked))

  // Dismiss the toast the way a user must, then continue.
  await page.locator('.notice').click().catch(() => null)
  await page.waitForTimeout(400)
  await page.locator('[data-testid="remote-disable"]').click()
  await page.waitForTimeout(2_500)
  await shot(page, 'r10-remote-disabled.png')
  const disabled = await page.locator('[data-testid="remote-enable"]').isVisible().catch(() => false)
  note('remote-disable-returns-to-off', disabled)
  note('phone-no-console-errors', phoneErrors.length === 0, phoneErrors.slice(0, 3).join(' | '))
} catch (error) {
  note('harness-exception', false, error instanceof Error ? error.message : String(error))
} finally {
  await browser?.close().catch(() => null)
  await app.close().catch(() => null)
  await writeFile(path.join(output, 'remote-review.json'), JSON.stringify({ steps, findings, shots }, null, 2), 'utf8')
  console.log(`\nfindings: ${findings.length}`)
  process.exitCode = findings.length === 0 ? 0 : 1
}
