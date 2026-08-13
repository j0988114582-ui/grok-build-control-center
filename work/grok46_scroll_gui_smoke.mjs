// v0.13 real Electron GUI smoke: live Grok 4.6 model picker + scroll-intent lock.
// Creates and deletes one empty Grok session, switches models, but never sends a prompt.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'grok46-scroll')
const scratchDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-v013-'))
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-v013-profile-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}
const scrollState = (page) => page.evaluate(() => {
  const scroller = document.querySelector('[data-testid="virtuoso-scroller"]')
  const distanceFromBottom = scroller instanceof HTMLElement
    ? Math.round(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight)
    : -1
  return {
    scrollTop: scroller instanceof HTMLElement ? Math.round(scroller.scrollTop) : -1,
    scrollHeight: scroller instanceof HTMLElement ? Math.round(scroller.scrollHeight) : -1,
    clientHeight: scroller instanceof HTMLElement ? Math.round(scroller.clientHeight) : -1,
    distanceFromBottom,
    jumpVisible: Boolean(document.querySelector('.jump-latest'))
  }
})

const executablePath = process.env.GROK_GUI_EXE?.trim()
const app = await electron.launch(executablePath
  ? { executablePath: path.resolve(executablePath), args: [`--user-data-dir=${profileDir}`] }
  : { args: ['.', `--user-data-dir=${profileDir}`] })
let sessionId = null
const consoleErrors = []
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))

  const setup = await page.evaluate(async (cwd) => {
    const capabilities = await window.grokApi.connect()
    const created = await window.grokApi.createSession(cwd)
    if (!created.sessionId) throw new Error('Grok did not return a session id')
    const models = created.models ?? capabilities.modelState
    if (!models) throw new Error('Grok did not return a model catalog')

    const events = []
    for (let index = 1; index <= 70; index += 1) {
      events.push({
        id: `user-${index}`,
        sessionId: created.sessionId,
        kind: 'message',
        role: 'user',
        text: `回顧指令 ${index}：這是用來驗證長對話閱讀位置的本機 GUI 測試。`
      })
      events.push({
        id: `assistant-${index}`,
        sessionId: created.sessionId,
        kind: 'message',
        role: 'assistant',
        text: `第 ${index} 段測試回覆。\n\n保持捲動內容足夠長，確認使用者回看時不會被串流輸出拉回底部。`
      })
    }
    events.push({ id: 'turn-running', sessionId: created.sessionId, kind: 'turn', status: 'running' })
    events.push({ id: 'thought-stream', sessionId: created.sessionId, kind: 'thought', text: '正在分析 GUI 捲動狀態。' })

    window.__grokSmoke.activateSession({ id: created.sessionId, cwd, title: 'v0.13 Grok 4.6 GUI smoke' })
    window.__grokSmoke.setModelState(models)
    window.__grokSmoke.seedSessionEvents(created.sessionId, events)
    return {
      sessionId: created.sessionId,
      currentModelId: models.currentModelId,
      modelIds: models.availableModels.map((model) => model.modelId)
    }
  }, scratchDir)
  sessionId = setup.sessionId

  await page.getByRole('button', { name: '模型：Grok 4.6' }).waitFor()
  check('live-model-catalog', setup.currentModelId === 'grok-4.6' && setup.modelIds.includes('grok-4.5'), JSON.stringify(setup))
  await page.screenshot({ path: path.join(outDir, '01-grok-4.6-model.png') })

  await page.getByRole('button', { name: '模型：Grok 4.6' }).click()
  await page.getByRole('option', { name: /Grok 4.5/ }).click()
  await page.waitForTimeout(700)
  check('gui-switch-to-4.5', await page.getByRole('button', { name: '模型：Grok 4.5' }).isVisible(), 'model picker remained on Grok 4.5 after ACP apply')

  await page.getByRole('button', { name: '模型：Grok 4.5' }).click()
  await page.getByRole('option', { name: /Grok 4.6/ }).click()
  await page.waitForTimeout(700)
  check('gui-switch-back-to-4.6', await page.getByRole('button', { name: '模型：Grok 4.6' }).isVisible(), 'model picker remained on Grok 4.6 after ACP apply')

  await page.getByTitle('命令').click()
  await page.getByText('/session-info', { exact: true }).waitFor()
  check('latest-session-info-command', true, 'Grok Build 1.0.3 command is present in the live GUI palette')
  await page.keyboard.press('Escape')

  const scroller = page.locator('[data-testid="virtuoso-scroller"]')
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="virtuoso-scroller"]')
    return element instanceof HTMLElement && element.scrollHeight > element.clientHeight + 1000
  })
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Reasoning/ }).click()
  await page.waitForTimeout(200)

  await page.locator('.transcript').hover()
  await page.mouse.wheel(0, -850)
  await page.getByRole('button', { name: /跳到最新/ }).waitFor()
  const paused = await scrollState(page)
  check('wheel-pauses-follow-tail', paused.jumpVisible && paused.distanceFromBottom > 100, JSON.stringify(paused))

  for (let index = 0; index < 14; index += 1) {
    await page.evaluate(({ id, part }) => {
      window.__grokSmoke.appendSessionEvent({
        id: `thought-chunk-${part}`,
        sessionId: id,
        kind: 'thought',
        text: `\n串流思考區塊 ${part}：` + '持續增加內容以觸發虛擬列表重新量測。'.repeat(10)
      })
    }, { id: sessionId, part: index + 1 })
    await page.waitForTimeout(35)
  }
  await page.waitForTimeout(500)
  const afterStream = await scrollState(page)
  check('stream-does-not-steal-position', afterStream.jumpVisible && afterStream.distanceFromBottom > 100, JSON.stringify(afterStream))
  await page.screenshot({ path: path.join(outDir, '02-scroll-paused-during-reasoning.png') })

  await page.getByRole('button', { name: /跳到最新/ }).click()
  await page.waitForTimeout(900)
  const resumed = await scrollState(page)
  check('jump-latest-resumes-follow-tail', !resumed.jumpVisible && resumed.distanceFromBottom <= 12, JSON.stringify(resumed))
  await page.screenshot({ path: path.join(outDir, '03-jump-latest-restored.png') })
  check('renderer-console-clean', consoleErrors.length === 0, consoleErrors.join(' | ') || 'no console/page errors')
} catch (error) {
  check('smoke-completed', false, error instanceof Error ? error.stack ?? error.message : String(error))
} finally {
  try {
    const windows = app.windows()
    if (sessionId && windows[0]) {
      await windows[0].evaluate((id) => window.grokApi.deleteSession(id).catch(() => false), sessionId)
    }
  } finally {
    await app.close()
  }
}

const result = { executablePath: executablePath ? path.resolve(executablePath) : 'development Electron', scratchDir, profileDir, sessionId, checks, consoleErrors }
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
if (checks.some((item) => !item.ok)) process.exitCode = 1
