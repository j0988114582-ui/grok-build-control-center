// Electron smoke for Preview Dock 0.7.0 — no Grok install / no paid prompts.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-gui-preview-'))
const output = path.resolve('outputs', 'preview-smoke')
await mkdir(output, { recursive: true })

const executablePath = process.env.GROK_GUI_EXE?.trim()
const app = await electron.launch(executablePath
  ? { executablePath: path.resolve(executablePath), args: [`--user-data-dir=${profile}`] }
  : { args: ['.', `--user-data-dir=${profile}`] })

const result = {
  dockMounted: false,
  toggleOpen: false,
  toggleClose: false,
  shortcut: false,
  csp: false,
  a11y: [],
  screenshots: [],
  exitCode: 1
}

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
      return output.violations
        .filter((item) => item.impact === 'serious' || item.impact === 'critical')
        .map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }))
    })
    result.a11y.push({ state, violations: report })
  }

  // CSP meta present with media-src + grok-preview
  result.csp = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    const content = meta?.getAttribute('content') ?? ''
    return content.includes('media-src') && content.includes('grok-preview:') && content.includes('https:')
  })

  const dock = page.getByTestId('preview-dock')
  await dock.waitFor()
  result.dockMounted = true

  // Default is collapsed rail
  const openAttr = await dock.getAttribute('data-open')
  if (openAttr === 'false') {
    await page.getByRole('button', { name: '展開預覽台' }).click()
  }
  await page.waitForTimeout(200)
  result.toggleOpen = (await dock.getAttribute('data-open')) === 'true'
  const openShot = path.join(output, 'preview-open.png')
  await page.screenshot({ path: openShot, fullPage: true })
  result.screenshots.push(openShot)
  await audit('preview-open')

  await page.getByRole('button', { name: '收合預覽台' }).click()
  await page.waitForTimeout(150)
  result.toggleClose = (await dock.getAttribute('data-open')) === 'false'

  // Ctrl+Shift+V toggles
  await page.keyboard.press('Control+Shift+V')
  await page.waitForTimeout(150)
  result.shortcut = (await dock.getAttribute('data-open')) === 'true'

  const railShot = path.join(output, 'preview-rail.png')
  await page.keyboard.press('Control+Shift+V')
  await page.waitForTimeout(150)
  await page.screenshot({ path: railShot, fullPage: true })
  result.screenshots.push(railShot)
  await audit('preview-rail')

  const serious = result.a11y.flatMap((entry) => entry.violations)
  const ok = result.dockMounted && result.toggleOpen && result.toggleClose && result.shortcut && result.csp && serious.length === 0
  result.exitCode = ok ? 0 : 1
  result.ok = ok
  result.seriousA11y = serious.length
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  result.exitCode = 1
} finally {
  await app.close().catch(() => undefined)
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.exitCode)
}
