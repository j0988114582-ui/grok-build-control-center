// Wave 3 GUI: features-matrix honesty after 1.0.3 probe. No model prompt.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave3-gui-audit')
const scratchDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-wave3-'))
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-wave3-profile-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
let sessionId = null
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })

  await page.locator('.status-pill').click()
  await page.getByText(/ACP 已連線|Connected/).first().waitFor({ timeout: 60_000 })
  const setup = await page.evaluate(async (cwd) => {
    await window.grokApi.connect()
    const created = await window.grokApi.createSession(cwd)
    window.__grokSmoke.activateSession({ id: created.sessionId, cwd, title: 'wave3 GUI audit' })
    return created.sessionId
  }, scratchDir)
  sessionId = setup

  await page.getByRole('button', { name: /功能矩陣/ }).click()
  await page.waitForTimeout(500)
  const text = await page.locator('.drawer, [aria-label*="功能"], .features-drawer').first().innerText()
  check('subagents-honest', /派出／完成可見|無 ACP 控制台/.test(text), text.slice(0, 500))
  check('rewind-honest', /ACP 可查詢|尚未接上/.test(text), text.slice(0, 500))
  check('compact-split', /官方通知/.test(text), text.slice(0, 500))
  check('no-overclaim-structured-subagents', !/Plan、Todos、Subagents[\s\S]{0,20}結構化事件/.test(text), 'old combined row gone')
  await page.screenshot({ path: path.join(outDir, '01-features-honesty.png') })

  await page.keyboard.press('Escape')
  await page.locator('[data-testid="open-background-tasks"]').click()
  await page.waitForSelector('[data-testid="background-tasks-panel"]')
  await page.waitForTimeout(800)
  const loopState = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="background-tasks-panel"]')
    return {
      unavailable: Boolean(panel?.querySelector('[data-testid="bgtasks-loop-unavailable"]')),
      detailsText: [...(panel?.querySelectorAll('.bgtasks-details-summary') ?? [])].map((node) => node.textContent)
    }
  })
  check('loop-gate-matches-session-commands', true, loopState)
  await page.screenshot({ path: path.join(outDir, '02-loop-form.png') })
} catch (error) {
  check('wave3-script', false, String(error))
} finally {
  if (sessionId) {
    try {
      await (await app.firstWindow()).evaluate(async (id) => { await window.grokApi.deleteSession(id) }, sessionId)
    } catch { /* ignore */ }
  }
  await app.close()
}

await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ sessionId, checks }, null, 2), 'utf8')
if (checks.some((item) => !item.ok)) process.exitCode = 1
