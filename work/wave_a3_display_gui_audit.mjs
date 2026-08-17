// Wave A3 — display / honesty GUI audit.
//   npm run build ; node work/wave_a3_display_gui_audit.mjs
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave-a3-display')
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-a3-display-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}
const result = { profileDir, screenshots: [] }
const shoot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, name) })
  result.screenshots.push(name)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
const consoleErrors = []
const pageErrors = []

try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(45_000)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })

  const now = Date.now()
  await page.evaluate((stamp) => {
    window.__grokSmoke.seedSessions([
      { id: 'a3-fresh', cwd: 'C:\\repo', title: 'A3 今天的對話', updatedAt: new Date(stamp).toISOString() }
    ])
    window.__grokSmoke.activateSession({
      id: 'a3-fresh',
      cwd: 'C:\\repo',
      title: 'A3 今天的對話',
      updatedAt: new Date(stamp).toISOString()
    })
    window.__grokSmoke.appendSessionEvent({
      id: 'a3-fresh:user',
      sessionId: 'a3-fresh',
      kind: 'message',
      role: 'user',
      text: 'A3 使用者訊息'
    })
    window.__grokSmoke.appendSessionEvent({
      id: 'a3-fresh:turn:cancelled',
      sessionId: 'a3-fresh',
      kind: 'turn',
      status: 'cancelled'
    })
  }, now)
  await page.waitForSelector('[data-testid="main-composer"] textarea')

  const body = await page.locator('body').innerText()
  check('top-button-zh', body.includes('選資料夾開始'), '選資料夾開始 visible')
  check('recent-sessions-zh', body.includes('最近對話'), '最近對話 visible')
  const labels = await page.locator('.message-label').allInnerTexts()
  check('you-label-zh', labels.includes('你'), labels)
  const turnText = await page.locator('.turn-marker').innerText().catch(() => '')
  check('cancelled-turn-zh', turnText.includes('回合已取消'), turnText)
  await shoot(page, '01-session-zh.png')

  await page.getByRole('button', { name: '功能矩陣' }).click()
  const features = page.locator('.drawer').filter({ hasText: '功能矩陣' })
  await features.waitFor({ state: 'visible' })
  const featureText = await features.innerText()
  check('plan-row-honest', /Plan[\s\S]{0,40}核准盒/.test(featureText), featureText.slice(0, 280))
  check('todos-not-native', /Todos[\s\S]{0,20}尚未接上/.test(featureText), 'Todos marked 尚未接上')
  check('worktree-tui', /Worktree／Fork[\s\S]{0,20}在 TUI 開啟/.test(featureText), 'Worktree is TUI')
  const drawerBg = await features.evaluate((node) => getComputedStyle(node).backgroundColor)
  check('drawer-is-opaque', drawerBg.startsWith('rgb(') && !drawerBg.startsWith('rgba('), drawerBg)
  await shoot(page, '02-features-honest.png')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '設定' }).click()
  await page.locator('.drawer').filter({ hasText: '工作台設定' }).waitFor({ state: 'visible' })
  await shoot(page, '03-settings-opaque.png')
  await page.keyboard.press('Escape')

  await page.getByLabel('收合側欄').click()
  const leaked = await page.evaluate(() => {
    const visible = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return false
      const style = getComputedStyle(node)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    return {
      folder: visible('[data-testid="folder-filter"]'),
      team: visible('.sidebar-team-bar'),
      cleanup: visible('[data-testid="cleanup-suggest-bar"]'),
      active: visible('[data-testid="active-only-filter"]')
    }
  })
  check('collapsed-hides-new-controls', !leaked.folder && !leaked.team && !leaked.cleanup && !leaked.active, leaked)
  await shoot(page, '04-sidebar-collapsed.png')
  await page.locator('.sidebar-expand-float').click()

  await page.setViewportSize({ width: 1080, height: 800 })
  const grid = await page.evaluate(() => getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns)
  check('narrow-keeps-preview-track', grid.split(' ').filter(Boolean).length >= 3, grid)
  await shoot(page, '05-narrow-1100.png')

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
