// Narrow probe: does the PHONE actually render Grok's assistant reply (not just
// the echo of its own prompt)? Asserts on .tail article.msg-assistant.
import { _electron as electron, chromium } from 'playwright'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-reply-probe-'))
const workspace = await mkdtemp(path.join(tmpdir(), 'grok-reply-ws-'))
await writeFile(path.join(workspace, 'README.md'), '# probe\n', 'utf8')
const out = path.resolve('outputs', 'release-review')

const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`] })
const page = await app.firstWindow()
page.setDefaultTimeout(60_000)
page.on('dialog', (d) => { void d.accept() })
let browser = null
try {
  await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }) }, workspace)
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('GROK BUILD', { exact: true }).waitFor()
  const connect = page.getByRole('button', { name: '連接本機 Grok' })
  if (await connect.isVisible().catch(() => false)) await connect.click()
  await page.locator('[data-testid="quota-summary"], [aria-label^="總額度已使用"]').first().waitFor({ timeout: 90_000 }).catch(() => null)
  await page.getByRole('button', { name: '選擇專案開始' }).click()
  await page.locator('.composer textarea, textarea').first().waitFor({ timeout: 90_000 })

  await page.getByRole('button', { name: /功能矩陣/ }).first().click()
  await page.waitForTimeout(900)
  // Loopback mode: the browser is on this machine, so 127.0.0.1 is reachable.
  // Keeps this probe independent of Cloudflare Quick Tunnel availability.
  await page.locator('[data-testid="remote-enable"]').click()
  const gotUrl = await page.locator('[data-testid="remote-pair-url"]')
    .waitFor({ timeout: 180_000 }).then(() => true).catch(() => false)
  if (!gotUrl) {
    const diag = await page.evaluate(() => ({
      banner: document.querySelector('[data-testid="remote-banner"]')?.innerText ?? null,
      notice: document.querySelector('.notice')?.innerText?.replace(/\s+/g, ' ').slice(0, 300) ?? null
    }))
    console.log('TUNNEL-FAILED-DIAG:', JSON.stringify(diag))
    throw new Error('tunnel did not come up')
  }
  const pairUrl = (await page.locator('[data-testid="remote-pair-url"]').innerText()).trim()
  const pin = (await page.locator('[data-testid="remote-pin"]').innerText()).replace(/\D/g, '').slice(0, 6)

  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, bypassCSP: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  })
  const phone = await context.newPage()
  phone.setDefaultTimeout(45_000)
  phone.on('dialog', (d) => { void d.accept() })
  await phone.goto(pairUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await phone.waitForSelector('#pin-pad button')
  for (const ch of pin) await phone.locator('#pin-pad button', { hasText: new RegExp(`^${ch}$`) }).first().click()
  await phone.locator('#pair-btn').click()
  await phone.waitForSelector('#main-panel:not(.hidden)')
  await phone.waitForFunction("document.getElementById('focus-status').textContent.includes('焦點就緒')", undefined, { timeout: 45_000 })

  const token = '星艦就緒'
  await phone.fill('#prompt', `請一字不差只回覆這四個字：${token}`)
  await phone.locator('#send-btn').click()
  await phone.waitForFunction("document.getElementById('notices').textContent.includes('已送出')", undefined, { timeout: 20_000 })

  const assistant = await phone.waitForFunction(
    (t) => {
      const nodes = [...document.querySelectorAll('.tail article.msg-assistant')]
      const hit = nodes.find((n) => n.innerText.includes(t))
      return hit ? hit.innerText.replace(/\s+/g, ' ').slice(0, 80) : false
    },
    token,
    { timeout: 150_000 }
  ).then((handle) => handle.jsonValue()).catch(() => null)

  await phone.waitForTimeout(1200)
  await phone.screenshot({ path: path.join(out, 'p01-phone-assistant-reply.png'), fullPage: true })

  const tailShape = await phone.evaluate(() => ({
    user: document.querySelectorAll('.tail article.msg-user').length,
    assistant: document.querySelectorAll('.tail article.msg-assistant').length,
    turns: document.querySelectorAll('.tail article.turn-item').length,
    tools: document.querySelectorAll('.tail .tool').length,
    text: document.getElementById('tail').innerText.replace(/\s+/g, ' ').slice(0, 260)
  }))
  console.log('assistant-bubble:', assistant ?? 'NOT FOUND')
  console.log('tail-shape:', JSON.stringify(tailShape, null, 1))
  process.exitCode = assistant ? 0 : 1
} catch (error) {
  console.log('EXCEPTION:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => null)
  await app.close().catch(() => null)
}
