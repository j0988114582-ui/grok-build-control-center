// Electron visual smoke for galaxy modes. Uses a temporary profile and never installs Grok or sends a prompt.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-gui-visual-'))
const output = path.resolve('outputs', 'ui-smoke')
await mkdir(output, { recursive: true })

const executablePath = process.env.GROK_GUI_EXE?.trim()
const app = await electron.launch(executablePath
  ? { executablePath: path.resolve(executablePath), args: [`--user-data-dir=${profile}`] }
  : { args: ['.', `--user-data-dir=${profile}`] })
const result = { setup: false, connected: false, sessionAvailable: false, beginner: false, focus: false, deep: false, reducedMotion: false, quota: false, quotaProducts: false, accountSwitch: false, cursor: false, modelPicker: false, commandPalette: false, shortcuts: false, sidebarFits: false, renderer: 'none', a11y: [], screenshots: [] }
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('GROK BUILD', { exact: true }).waitFor()
  await page.addInitScript({ path: path.resolve('node_modules', 'axe-core', 'axe.min.js') })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('GROK BUILD', { exact: true }).waitFor()
  const audit = async (state) => {
    const report = await page.evaluate(async () => {
      const output = await globalThis.axe.run(document)
      return output.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical').map((item) => ({
        id: item.id,
        impact: item.impact,
        nodes: item.nodes.map((node) => ({ target: node.target, html: node.html, summary: node.failureSummary }))
      }))
    })
    result.a11y.push({ state, violations: report })
  }
  const beginnerHeading = page.locator('.empty-state h1')
  await beginnerHeading.waitFor()
  result.beginner = /選一個專案資料夾|第一次使用/.test(await beginnerHeading.innerText())
  result.cursor = await page.getByTestId('cursor-fx').isVisible()
  await audit('empty')
  await page.locator('.empty-state h1').click()
  await page.keyboard.type('?')
  await page.getByRole('dialog', { name: '快捷鍵一覽' }).waitFor()
  result.shortcuts = true
  const shortcutPath = path.join(output, 'shortcuts-1440.png')
  await page.screenshot({ path: shortcutPath })
  result.screenshots.push(shortcutPath)
  await page.keyboard.press('Escape')

  const installButton = page.getByRole('button', { name: '安裝 Grok CLI' })
  result.setup = await installButton.isVisible().catch(() => false)
  if (!result.setup) {
    const connectButton = page.getByRole('button', { name: '連接本機 Grok' })
    if (await connectButton.isVisible().catch(() => false)) {
      await connectButton.click()
      await page.locator('[aria-label^="總額度已使用"]').waitFor()
      result.connected = true
      result.quota = await page.getByText(/重置/).first().isVisible()
      // v0.8 P-QUOTA: product rings may be hidden when service omits breakdown; total must remain.
      const totalVisible = await page.locator('[data-testid="quota-summary"] [aria-label^="總額度"]').isVisible()
      result.quotaProducts = totalVisible
      result.accountSwitch = await page.getByRole('button', { name: '切換 Grok 帳號' }).isVisible()
      await page.getByRole('button', { name: '切換 Grok 帳號' }).click()
      await page.getByRole('dialog', { name: '登入 Grok 帳號' }).waitFor()
      await audit('account-switch-confirmation')
      const accountPath = path.join(output, 'account-switch-confirmation.png')
      await page.screenshot({ path: accountPath })
      result.screenshots.push(accountPath)
      await page.keyboard.press('Escape')
    }
  }

  const starfield = page.locator('.starfield-canvas')
  result.renderer = await starfield.getAttribute('data-renderer') ?? 'none'
  // The toast is pointer-events:none (it must never block controls beneath it),
  // so dismiss it through its close button — or just let it auto-expire.
  const clearNotice = async () => {
    await page.waitForTimeout(350)
    const notice = page.locator('.notice')
    if (!(await notice.isVisible().catch(() => false))) return
    await page.getByRole('button', { name: '關閉通知' }).first().click({ timeout: 5_000 }).catch(() => null)
    await notice.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => null)
  }
  await clearNotice()
  const canvasPath = path.join(output, 'canvas-webgl.png')
  await starfield.screenshot({ path: canvasPath })
  result.screenshots.push(canvasPath)

  const focusPath = path.join(output, 'focus-1440.png')
  await page.screenshot({ path: focusPath })
  result.focus = await page.locator('.app').getAttribute('data-immersion') === 'focus'
  result.sidebarFits = await page.locator('.session-list').evaluate((element) => getComputedStyle(element).overflowX === 'hidden')
  result.screenshots.push(focusPath)

  await page.keyboard.press('Control+Shift+P')
  await page.getByRole('combobox', { name: '搜尋命令' }).waitFor()
  result.commandPalette = true
  const palettePath = path.join(output, 'palette-1440.png')
  await page.screenshot({ path: palettePath })
  result.screenshots.push(palettePath)
  await page.keyboard.press('Escape')

  const firstSession = page.locator('.session-open').first()
  result.sessionAvailable = await firstSession.count() > 0
  if (result.sessionAvailable && result.connected) {
    await firstSession.click()
    await page.locator('.session-header').waitFor()
    result.modelPicker = await page.getByRole('button', { name: /^模型：/ }).isVisible()
    await audit('session')
  }
  await clearNotice()

  await page.getByRole('button', { name: '設定' }).click()
  await page.locator('.immersion-choice button').filter({ hasText: '全沉浸' }).click()
  await page.getByRole('button', { name: '儲存設定' }).click()
  await page.locator('.app[data-immersion="deep"]').waitFor()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('canvas[data-static="true"]').waitFor()
  await clearNotice()
  const deepPath = path.join(output, 'deep-1440.png')
  await page.screenshot({ path: deepPath })
  result.deep = true
  result.screenshots.push(deepPath)

  await page.getByRole('button', { name: '設定' }).click()
  await page.getByText('停用全部動效', { exact: true }).click()
  await page.getByRole('button', { name: '儲存設定' }).click()
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.app[data-fx-off="true"]').waitFor()
  await page.locator('canvas[data-static="true"]').waitFor()
  if (await page.getByTestId('cursor-fx').count()) throw new Error('Cursor layer remained active after reduced-motion setting')
  await clearNotice()
  const staticPath = path.join(output, 'reduced-motion-1440.png')
  await page.screenshot({ path: staticPath })
  result.reducedMotion = true
  result.screenshots.push(staticPath)

  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
} finally {
  await app.close()
}

const a11yFailures = result.a11y.flatMap((entry) => entry.violations)
const environmentPath = result.setup || (result.connected && result.quota && result.quotaProducts && result.accountSwitch)
const sessionPath = !result.sessionAvailable || !result.connected || result.modelPicker
if (!environmentPath || !sessionPath || !result.beginner || !result.focus || !result.deep || !result.reducedMotion || !result.cursor || !result.commandPalette || !result.shortcuts || !result.sidebarFits || result.renderer === 'none' || a11yFailures.length) process.exitCode = 1
