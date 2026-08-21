// Smoke the packaged 0.14.0 win-unpacked exe (not electron-vite dev).
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const unpacked = path.resolve('outputs', 'installer', 'win-unpacked', 'Grok Build Control Center.exe')
const outDir = path.resolve('output', 'playwright', 'packaged-ux-smoke')
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-packaged-ux-'))
await mkdir(outDir, { recursive: true })
await access(unpacked)

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const app = await electron.launch({ executablePath: unpacked, args: [`--user-data-dir=${profileDir}`] })
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(60_000)
  await page.waitForLoadState('domcontentloaded')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.waitForFunction(() => Boolean(window.grokApi), null, { timeout: 60_000 })
  await page.waitForSelector('.sidebar', { timeout: 60_000 })

  const version = await app.evaluate(async ({ app: electronApp }) => electronApp.getVersion())
  check('version-0.14.0', version === '0.14.0', version)

  const body = await page.locator('body').innerText()
  check('pick-folder', body.includes('選資料夾開始') && !body.includes('選擇專案開始'), '選資料夾開始')
  check('permission-chips', body.includes('先問我') && body.includes('全部自動過'), '先問我／全部自動過')
  check('search-zh', (await page.locator('.searchbox input').getAttribute('placeholder')) === '搜尋對話', '搜尋對話')
  check('sort-control', await page.locator('select[aria-label="對話排序"]').count() === 1, '排序下拉')
  check('eyebrow-zh', body.includes('銀河座艙'), '銀河座艙')
  check('connected-zh', /已連線|連線/.test(body), body.match(/Grok[^\n]{0,40}/)?.[0] ?? '')

  const permRegion = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="permission-mode"]')
    return el ? getComputedStyle(el).webkitAppRegion || getComputedStyle(el).getPropertyValue('-webkit-app-region') : 'missing'
  })
  check('permission-no-drag', permRegion === 'no-drag', permRegion)

  await page.screenshot({ path: path.join(outDir, 'packaged-welcome.png') })
} catch (error) {
  check('packaged-smoke-crashed', false, error instanceof Error ? error.stack : String(error))
} finally {
  await app.close().catch(() => {})
}

const result = { unpacked, profileDir, checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length }
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
console.log(`${result.passed} passed / ${result.failed} failed`)
if (result.failed) process.exitCode = 1
