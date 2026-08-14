// v0.13.0 real Electron GUI audit: version, surfaces, interject, subagent panel.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'v013-gui-audit')
const scratchDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-v013-audit-'))
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-v013-audit-profile-'))
await mkdir(outDir, { recursive: true })

// Derived from the running user's home so this never hard-codes a local path.
const executablePath = process.env.GROK_GUI_EXE?.trim()
  || path.join(homedir(), 'AppData', 'Local', 'Programs', 'Grok Build Control Center', 'Grok Build Control Center.exe')

const checks = []
const notes = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const app = await electron.launch({
  executablePath: path.resolve(executablePath),
  args: [`--user-data-dir=${profileDir}`]
})

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
  check('installed-app-version', appInfo.version === '0.13.0', appInfo)

  await page.screenshot({ path: path.join(outDir, '01-welcome.png') })
  const welcome = await page.locator('.empty-state h1').innerText().catch(() => '')
  check('welcome-empty-state', /選一個專案|第一次使用/.test(welcome), welcome.replaceAll('\n', ' '))

  const statusPill = await page.locator('.status-pill').innerText()
  check('status-pill-shows-cli', /Grok\s+1\.0\.3/i.test(statusPill), statusPill)

  // Renderer connect() bumps connectionGeneration; grokApi.connect() alone leaves
  // composer locked with "此對話尚未在目前連線就緒".
  await page.locator('.status-pill').click()
  await page.getByText(/ACP 已連線|Connected/).first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(400)

  const setup = await page.evaluate(async (cwd) => {
    const capabilities = await window.grokApi.connect()
    const created = await window.grokApi.createSession(cwd)
    if (!created.sessionId) throw new Error('session/new did not return an id')
    const models = created.models ?? capabilities.modelState
    window.__grokSmoke.activateSession({
      id: created.sessionId,
      cwd,
      title: 'v0.13 GUI audit'
    })
    if (models) window.__grokSmoke.setModelState(models)
    return {
      sessionId: created.sessionId,
      cli: await window.grokApi.getStatus(),
      commandNames: (capabilities.commands ?? []).map((item) => item.name),
      currentModelId: models?.currentModelId ?? null,
      modelIds: (models?.availableModels ?? []).map((item) => item.modelId),
      efforts: (models?.availableModels ?? []).map((item) => ({
        id: item.modelId,
        name: item.name,
        efforts: item.supportedReasoningEfforts ?? item.availableReasoningEfforts ?? null,
        current: item.currentReasoningEffort ?? null
      }))
    }
  }, scratchDir)
  sessionId = setup.sessionId

  check('cli-connected', setup.cli.connected === true && setup.cli.version?.includes('1.0.3'), setup.cli)
  check('grok-4.6-default', setup.currentModelId === 'grok-4.6', setup)
  check('model-catalog', setup.modelIds.includes('grok-4.6') && setup.modelIds.includes('grok-4.5'), setup.modelIds)
  check('session-info-command', setup.commandNames.includes('session-info'), setup.commandNames)

  await page.waitForSelector('[data-testid="main-composer"]')
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(outDir, '02-session-ready.png') })

  const modelPickerText = await page.locator('.model-trigger').innerText()
  check('model-picker-visible-4.6', /Grok 4\.6/.test(modelPickerText), modelPickerText.replaceAll('\n', ' | '))
  const composerEnabled = await page.locator('[data-testid="main-composer"] textarea').isEnabled()
  check('composer-ready-after-connect', composerEnabled, composerEnabled ? 'composer enabled' : 'still locked')

  // Settings + features + shortcuts surfaces
  await page.getByRole('button', { name: '設定' }).click()
  await page.waitForSelector('.drawer, [data-testid="settings-panel"], .settings-drawer', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, '03-settings.png') })
  const settingsText = await page.locator('.drawer, [data-testid="settings-panel"], .settings-drawer').first().innerText().catch(() => '')
  check('settings-panel-opens', settingsText.length > 40, settingsText.slice(0, 240))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  await page.getByRole('button', { name: /功能矩陣/ }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, '04-features.png') })
  const featuresText = await page.locator('.drawer, [aria-label*="功能"], .features-drawer').first().innerText().catch(() => page.locator('body').innerText())
  check('features-panel-opens', /遙控|Remote|功能/.test(featuresText), featuresText.slice(0, 280))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  await page.keyboard.press('Control+Shift+P')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, '05-command-palette.png') })
  const paletteText = await page.locator('[role="dialog"], .command-palette, [data-testid="command-palette"]').first().innerText().catch(() => '')
  check('command-palette-opens', /背景任務|session-info|搜尋/.test(paletteText), paletteText.slice(0, 280))
  await page.keyboard.press('Escape')

  await page.locator('[data-testid="open-background-tasks"]').click()
  await page.waitForSelector('[data-testid="background-tasks-panel"]')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, '06-background-empty.png') })
  const emptyPanel = await page.locator('[data-testid="background-tasks-panel"]').innerText()
  check('background-empty-state', /目前沒有偵測到背景任務/.test(emptyPanel), emptyPanel.slice(0, 320))
  check('background-has-autonomous-forms', /Workflow|Goal|深度研究|建立定時任務/.test(emptyPanel), /Workflow/.test(emptyPanel))

  // Seed a running subagent so we can see what the UI *can* render.
  await page.evaluate((id) => {
    window.__grokSmoke.seedSessionEvents(id, [
      { id: `${id}:sub:run`, sessionId: id, kind: 'subagent', subagentId: 'seed-running', description: '審查 PR 變更', status: 'running', output: '正在讀取 diff…' },
      { id: `${id}:task:run`, sessionId: id, kind: 'task', taskId: 'seed-task', description: 'npm run build', status: 'running' }
    ])
  }, sessionId)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, '07-background-seeded-running.png') })
  const seededItems = await page.locator('[data-testid="bgtasks-item"]').allInnerTexts()
  check('seeded-running-subagent-visible', seededItems.some((text) => /執行中|審查 PR/.test(text)), seededItems)

  // Restore empty-ish transcript before live prompts.
  await page.evaluate((id) => { window.__grokSmoke.seedSessionEvents(id, []) }, sessionId)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // Auto-approve any permission dialogs.
  await page.evaluate(() => {
    window.__auditPermissions = []
    window.grokApi.onPermission((request) => {
      window.__auditPermissions.push({ title: request.title, options: request.options.map((item) => item.kind) })
      const allow = request.options.find((item) => String(item.kind).includes('allow_once'))
        || request.options.find((item) => !String(item.kind).includes('reject'))
      if (allow) void window.grokApi.respondPermission(request.requestId, allow.optionId)
    })
    window.__auditEvents = []
    window.grokApi.onEvent((event) => {
      window.__auditEvents.push({
        kind: event.kind,
        status: event.status,
        toolName: event.toolName,
        title: event.title,
        description: event.description,
        subagentId: event.subagentId,
        output: typeof event.output === 'string' ? event.output.slice(0, 160) : undefined
      })
    })
  })

  const composer = page.locator('[data-testid="main-composer"] textarea')
  if (!(await composer.isEnabled())) {
    throw new Error('composer still disabled after renderer connect + activateSession')
  }
  await composer.click()
  await composer.fill('不要使用任何工具。請用繁體中文從 1 慢慢數到 20，每個數字單獨一行，每行後面加一句很短的說明。不要提前結束，也不要一次倒出全部。')
  await page.screenshot({ path: path.join(outDir, '08-prompt-ready.png') })
  await page.locator('.send-button').click()

  const runningPill = page.locator('[data-testid="composer-status"] .is-running')
  await runningPill.waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(outDir, '09-turn-running.png') })

  const railVisible = await page.locator('[data-testid="command-rail"]').isVisible()
  const interjectBtn = page.locator('[data-testid="interject-button"]')
  const interjectDisabledEmpty = await interjectBtn.isDisabled()
  check('running-shows-command-rail', railVisible, 'command-rail visible while turn running')
  check('interject-disabled-when-empty', interjectDisabledEmpty, 'empty draft disables 插話')

  await composer.fill('插話測試：請改成只數到 5 就停，並在回覆最後一行寫 INTERJECT_OK。')
  await page.waitForTimeout(200)
  const interjectEnabled = !(await interjectBtn.isDisabled())
  check('interject-enabled-with-text', interjectEnabled, 'draft filled enables 插話')
  await page.screenshot({ path: path.join(outDir, '10-interject-armed.png') })

  const interjectStarted = Date.now()
  await interjectBtn.click()
  const interjectUi = await page.waitForFunction(() => {
    const notice = document.querySelector('.notice')
    const queued = document.querySelector('[data-testid="interject-status"]')
    return {
      notice: notice ? notice.textContent : '',
      queued: queued ? queued.textContent : '',
      draft: document.querySelector('[data-testid="main-composer"] textarea')?.value ?? ''
    }
  }, null, { timeout: 20_000 }).then((handle) => handle.jsonValue()).catch(async (error) => ({
    error: String(error),
    notice: await page.locator('.notice').textContent().catch(() => ''),
    queued: await page.locator('[data-testid="interject-status"]').textContent().catch(() => ''),
    draft: await composer.inputValue().catch(() => '')
  }))
  const interjectLatencyMs = Date.now() - interjectStarted
  await page.screenshot({ path: path.join(outDir, '11-interject-after-click.png') })

  const interjectAccepted = /已排入|下一個安全點/.test(`${interjectUi.notice || ''}${interjectUi.queued || ''}`)
  const interjectFailedNotice = /不支援|失敗|未預期|Method not found|無效/.test(interjectUi.notice || '')
  check('interject-rpc-accepted', interjectAccepted && !interjectFailedNotice, { ...interjectUi, interjectLatencyMs })

  // Wait for turn to finish or 90s, watching whether the interjection appears in transcript.
  const interjectWaitDeadline = Date.now() + 90_000
  let interjectObserved = null
  while (Date.now() < interjectWaitDeadline) {
    const snapshot = await page.evaluate(() => {
      const events = (window.__auditEvents || [])
      const running = Boolean(document.querySelector('[data-testid="composer-status"] .is-running'))
      const body = document.querySelector('.transcript')?.innerText || ''
      return {
        running,
        bodyHasInterject: /INTERJECT_OK|只數到 5|插話測試/.test(body),
        eventKinds: events.map((item) => item.kind),
        lastEvents: events.slice(-8)
      }
    })
    interjectObserved = snapshot
    if (!snapshot.running) break
    await sleep(1500)
  }
  await page.screenshot({ path: path.join(outDir, '12-interject-after-turn.png') })
  check('interject-visible-in-transcript', Boolean(interjectObserved?.bodyHasInterject), interjectObserved)

  // Subagent live probe
  await composer.fill('請立刻使用 spawn_subagent 同時派出兩個子代理：A 從 1 數到 6；B 列出 A 到 F。兩個都完成後再由你用一句話彙整。不要編輯任何檔案，也不要啟動 loop。')
  await page.locator('.send-button').click()
  await runningPill.waitFor({ timeout: 30_000 })
  await page.locator('[data-testid="open-background-tasks"]').click()
  await page.waitForSelector('[data-testid="background-tasks-panel"]')

  const subagentSamples = []
  const subagentDeadline = Date.now() + 180_000
  while (Date.now() < subagentDeadline) {
    const sample = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[data-testid="bgtasks-item"]')].map((node) => node.innerText)
      const events = (window.__auditEvents || []).filter((item) =>
        item.kind === 'subagent' || item.kind === 'task' || item.toolName === 'spawn_subagent' || /subagent|spawn/i.test(`${item.title || ''} ${item.description || ''}`)
      )
      return {
        running: Boolean(document.querySelector('[data-testid="composer-status"] .is-running')),
        items,
        relatedEvents: events
      }
    })
    subagentSamples.push({ atMs: Date.now(), ...sample })
    if (!sample.running && sample.items.length > 0) break
    if (!sample.running && Date.now() > subagentDeadline - 5_000) break
    await sleep(2000)
  }
  await page.screenshot({ path: path.join(outDir, '13-background-live-subagents.png') })

  const liveStatuses = subagentSamples.flatMap((sample) => sample.items)
  const sawRunningLive = liveStatuses.some((text) => /執行中|進行中|running/i.test(text))
  const onlyCompleted = liveStatuses.length > 0 && liveStatuses.every((text) => /已完成/.test(text)) && !sawRunningLive
  check('live-subagent-cards-appeared', liveStatuses.length > 0, {
    sampleCount: subagentSamples.length,
    lastItems: subagentSamples.at(-1)?.items ?? [],
    relatedEvents: subagentSamples.at(-1)?.relatedEvents ?? []
  })
  check('live-subagent-showed-running', sawRunningLive, {
    onlyCompleted,
    uniqueTexts: [...new Set(liveStatuses)].slice(0, 12)
  })

  // Expand first background card if present.
  const firstItem = page.locator('[data-testid="bgtasks-item-head"], .bgtasks-item-head').first()
  if (await firstItem.count()) {
    await firstItem.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(outDir, '14-background-item-expanded.png') })
  }

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(outDir, '15-final-session.png') })

  const finalState = await page.evaluate(() => ({
    permissions: window.__auditPermissions || [],
    eventSummary: (window.__auditEvents || []).reduce((acc, item) => {
      const key = `${item.kind}${item.toolName ? `:${item.toolName}` : ''}${item.status ? `:${item.status}` : ''}`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
    related: (window.__auditEvents || []).filter((item) =>
      item.kind === 'subagent' || item.kind === 'task' || item.toolName === 'spawn_subagent' || item.kind === 'unknown'
    )
  }))
  notes.push(finalState)
  check('renderer-console-clean', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors })
} catch (error) {
  check('audit-script', false, String(error))
  try {
    const page = await app.firstWindow()
    await page.screenshot({ path: path.join(outDir, '99-error.png') })
  } catch { /* ignore */ }
} finally {
  if (sessionId) {
    try {
      const page = await app.firstWindow()
      await page.evaluate(async (id) => { await window.grokApi.deleteSession(id) }, sessionId)
    } catch { /* best-effort cleanup */ }
  }
  await app.close()
}

const result = {
  version: '0.13.0',
  executablePath,
  scratchDir,
  profileDir,
  sessionId,
  checks,
  notes,
  consoleErrors,
  pageErrors
}
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
console.log(`\nWrote ${path.join(outDir, 'result.json')}`)
if (checks.some((item) => !item.ok)) process.exitCode = 1
