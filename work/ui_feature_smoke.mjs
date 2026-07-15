// Electron visual smoke for v0.3.0 galaxy modes. Uses a temporary Electron profile and sends no prompt.
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
const result = { beginner: false, focus: false, deep: false, reducedMotion: false, quota: false, quotaProducts: false, accountSwitch: false, cursor: false, modelPicker: false, commandPalette: false, shortcuts: false, sidebarFits: false, renderer: 'none', a11y: [], screenshots: [] }
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
  await page.getByRole('button', { name: '連接本機 Grok' }).click()
  await page.locator('[aria-label^="總額度已使用"]').waitFor()
  result.quota = await page.getByText(/重置/).first().isVisible()
  result.quotaProducts = (await Promise.all(['Build', 'Imagine', 'API'].map(async (label) => page.locator(`[data-testid="quota-summary"] [aria-label^="${label} "]`).isVisible()))).every(Boolean)
  result.accountSwitch = await page.getByRole('button', { name: '切換 Grok 帳號' }).isVisible()
  await page.getByRole('button', { name: '切換 Grok 帳號' }).click()
  await page.getByRole('dialog', { name: '登入 Grok 帳號' }).waitFor()
  await audit('account-switch-confirmation')
  const accountPath = path.join(output, 'account-switch-confirmation.png')
  await page.screenshot({ path: accountPath })
  result.screenshots.push(accountPath)
  await page.keyboard.press('Escape')
  const starfield = page.locator('.starfield-canvas')
  result.renderer = await starfield.getAttribute('data-renderer') ?? 'none'
  const clearNotice = async () => {
    await page.waitForTimeout(350)
    const notice = page.locator('.notice')
    if (await notice.isVisible().catch(() => false)) await notice.click()
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

  const firstSession = page.locator('.session-open').first()
  if (await firstSession.count()) {
    await firstSession.click()
    await page.locator('.session-header').waitFor()
    result.modelPicker = await page.getByRole('button', { name: /^模型：/ }).isVisible()
    await page.keyboard.press('Control+Shift+P')
    await page.getByRole('combobox', { name: '搜尋命令' }).waitFor()
    result.commandPalette = true
    const palettePath = path.join(output, 'palette-1440.png')
    await page.screenshot({ path: palettePath })
    result.screenshots.push(palettePath)
    await page.keyboard.press('Escape')
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
if (!result.beginner || !result.focus || !result.deep || !result.reducedMotion || !result.quota || !result.quotaProducts || !result.accountSwitch || !result.cursor || !result.modelPicker || !result.commandPalette || !result.shortcuts || !result.sidebarFits || result.renderer === 'none' || a11yFailures.length) process.exitCode = 1
