// Wave 1 live GUI: interject envelope + transcript echo; subagent stays 執行中.
// Launches the local built app (out/), not the installed 0.13.0 exe.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave1-gui-audit')
const scratchDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-wave1-'))
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-wave1-profile-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
let sessionId = null
const consoleErrors = []
const pageErrors = []

try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })

  const appInfo = await app.evaluate(({ app: electronApp }) => ({
    name: electronApp.getName(),
    version: electronApp.getVersion()
  }))
  check('source-app-launched', Boolean(appInfo.version), appInfo)

  await page.locator('.status-pill').click()
  await page.getByText(/ACP 已連線|Connected/).first().waitFor({ timeout: 60_000 })

  const setup = await page.evaluate(async (cwd) => {
    const capabilities = await window.grokApi.connect()
    const created = await window.grokApi.createSession(cwd)
    if (!created.sessionId) throw new Error('session/new did not return an id')
    const models = created.models ?? capabilities.modelState
    window.__grokSmoke.activateSession({ id: created.sessionId, cwd, title: 'wave1 GUI audit' })
    if (models) window.__grokSmoke.setModelState(models)
    return { sessionId: created.sessionId, currentModelId: models?.currentModelId ?? null }
  }, scratchDir)
  sessionId = setup.sessionId

  await page.waitForSelector('[data-testid="main-composer"] textarea')
  const composer = page.locator('[data-testid="main-composer"] textarea')
  await composer.waitFor({ state: 'visible' })
  if (!(await composer.isEnabled())) throw new Error('composer still disabled')

  await page.evaluate(() => {
    window.__auditEvents = []
    window.grokApi.onEvent((event) => {
      window.__auditEvents.push({
        kind: event.kind,
        status: event.status,
        toolName: event.toolName,
        title: event.title,
        description: event.description,
        origin: event.origin,
        text: typeof event.text === 'string' ? event.text.slice(0, 80) : undefined
      })
    })
    window.grokApi.onPermission((request) => {
      const allow = request.options.find((item) => String(item.kind).includes('allow_once'))
        || request.options.find((item) => !String(item.kind).includes('reject'))
      if (allow) void window.grokApi.respondPermission(request.requestId, allow.optionId)
    })
  })

  await composer.fill('不要使用任何工具。請用繁體中文從 1 慢慢數到 20，每個數字單獨一行。不要提前結束。')
  await page.locator('.send-button').click()
  await page.locator('[data-testid="composer-status"] .is-running').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(800)

  await composer.fill('插話測試：請改成只數到 5 就停，並在回覆最後一行寫 INTERJECT_OK。')
  await page.screenshot({ path: path.join(outDir, '01-interject-armed.png') })
  await page.locator('[data-testid="interject-button"]').click()

  const interjectUi = await page.waitForFunction(() => {
    const notice = document.querySelector('.notice')?.textContent ?? ''
    const queued = document.querySelector('[data-testid="interject-status"]')?.textContent ?? ''
    const body = document.querySelector('.transcript')?.innerText ?? ''
    const draft = document.querySelector('[data-testid="main-composer"] textarea')?.value ?? ''
    return { notice, queued, body, draft }
  }, null, { timeout: 20_000 }).then((handle) => handle.jsonValue())

  await page.screenshot({ path: path.join(outDir, '02-interject-after-click.png') })

  const failedNotice = /未預期的插話狀態|Error invoking remote method|插話失敗/.test(interjectUi.notice)
  const accepted = /已排入|下一個安全點/.test(`${interjectUi.notice}${interjectUi.queued}`)
  check('interject-no-failure-toast', !failedNotice, interjectUi.notice)
  check('interject-queued-notice', accepted, { notice: interjectUi.notice, queued: interjectUi.queued })
  check('interject-draft-cleared', interjectUi.draft.trim() === '', interjectUi.draft)
  check('interject-echo-in-transcript', /YOU · 插話|插話測試/.test(interjectUi.body), interjectUi.body.slice(0, 400))

  const interjectDeadline = Date.now() + 90_000
  let agentAck = false
  while (Date.now() < interjectDeadline) {
    const snap = await page.evaluate(() => ({
      running: Boolean(document.querySelector('[data-testid="composer-status"] .is-running')),
      body: document.querySelector('.transcript')?.innerText ?? ''
    }))
    if (/INTERJECT_OK/.test(snap.body)) agentAck = true
    if (!snap.running) break
    await sleep(1500)
  }
  await page.screenshot({ path: path.join(outDir, '03-interject-after-turn.png') })
  check('interject-agent-acknowledged', agentAck, 'agent wrote INTERJECT_OK')

  await composer.fill('請立刻使用 spawn_subagent 同時派出兩個子代理：A 從 1 數到 8；B 列出 A 到 H。兩個都完成後再由你用一句話彙整。不要編輯任何檔案。')
  await page.locator('.send-button').click()
  await page.locator('[data-testid="composer-status"] .is-running').waitFor({ timeout: 30_000 })
  await page.locator('[data-testid="open-background-tasks"]').click()
  await page.waitForSelector('[data-testid="background-tasks-panel"]')

  const samples = []
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[data-testid="bgtasks-item"]')].map((node) => node.innerText)
      const events = (window.__auditEvents || []).filter((item) =>
        item.kind === 'subagent' || item.toolName === 'spawn_subagent' || item.toolName === 'get_command_or_subagent_output'
      )
      return {
        running: Boolean(document.querySelector('[data-testid="composer-status"] .is-running')),
        items,
        events
      }
    })
    samples.push(sample)
    if (!sample.running && sample.items.length > 0) {
      await sleep(800)
      break
    }
    await sleep(1200)
  }
  await page.screenshot({ path: path.join(outDir, '04-background-live.png') })

  const sawRunning = samples.some((sample) => sample.items.some((text) => /執行中/.test(text)))
  const sawSpawn = samples.some((sample) => sample.items.length > 0 || sample.events.some((item) => item.toolName === 'spawn_subagent'))
  check('subagent-cards-appeared', sawSpawn, {
    lastItems: samples.at(-1)?.items ?? [],
    eventKinds: (samples.at(-1)?.events ?? []).map((item) => `${item.kind}:${item.toolName || ''}:${item.status || ''}`)
  })
  check('subagent-showed-running', sawRunning, {
    uniqueTexts: [...new Set(samples.flatMap((sample) => sample.items))].slice(0, 12)
  })

  check('renderer-console-clean', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })
} catch (error) {
  check('wave1-script', false, String(error))
  try {
    const page = await app.firstWindow()
    await page.screenshot({ path: path.join(outDir, '99-error.png') })
  } catch { /* ignore */ }
} finally {
  if (sessionId) {
    try {
      const page = await app.firstWindow()
      await page.evaluate(async (id) => { await window.grokApi.deleteSession(id) }, sessionId)
    } catch { /* best-effort */ }
  }
  await app.close()
}

const result = { scratchDir, profileDir, sessionId, checks, consoleErrors, pageErrors }
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
console.log(`\nWrote ${path.join(outDir, 'result.json')}`)
if (checks.some((item) => !item.ok)) process.exitCode = 1
