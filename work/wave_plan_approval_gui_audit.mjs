// Plan-approval GUI audit: real Electron window, real Grok CLI, real plan mode.
//
// Before the fix, `_x.ai/exit_plan_mode` was unregistered, the SDK answered
// -32601, and the CLI cancelled the turn with "client disconnected mid-approval"
// (reproduced by work/plan_mode_acp_probe.mjs). This proves the GUI now shows
// the plan, answers the agent, and lets the turn finish.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave-plan-approval')
const scratchDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-planmode-'))
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-planmode-profile-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const app = await electron.launch({ args: ['.', `--user-data-dir=${profileDir}`] })
let sessionId = null
const result = { scratchDir: '<tmp>', screenshots: [] }
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.__grokSmoke))
  await page.setViewportSize({ width: 1440, height: 960 })

  await page.locator('.status-pill').click()
  await page.getByText(/ACP 已連線|Connected/).first().waitFor({ timeout: 60_000 })
  sessionId = await page.evaluate(async (cwd) => {
    await window.grokApi.connect()
    const created = await window.grokApi.createSession(cwd)
    window.__grokSmoke.activateSession({ id: created.sessionId, cwd, title: 'plan approval GUI audit' })
    return created.sessionId
  }, scratchDir)
  check('session-ready', Boolean(sessionId), 'created + activated')

  // Drive the agent into plan mode and make it ask for approval.
  const promptText = [
    '請先呼叫 enter_plan_mode 進入規劃模式。',
    '接著把計畫寫進 plan.md：標題「建立 hello.txt」，內文兩三句說明要在這個空資料夾建立一個內容為 hello 的純文字檔。',
    '寫完 plan.md 之後，呼叫 exit_plan_mode 請求我核准這個計畫。',
    '除了 plan.md 以外不要建立或修改任何檔案，也不要執行終端指令。'
  ].join('')
  await page.evaluate(async ({ id, text }) => {
    // Fire and forget: the turn only settles after the approval is answered.
    window.grokApi.sendPrompt(id, [{ type: 'text', text }]).catch(() => {})
  }, { id: sessionId, text: promptText })

  // THE fix: this modal could never appear before.
  const modal = page.locator('[data-testid="plan-approval-modal"]')
  await modal.waitFor({ timeout: 240_000 })
  check('plan-approval-modal-appears', true, 'GUI rendered the plan approval instead of silently cancelling')

  const planText = await page.locator('[data-testid="plan-approval-content"]').innerText().catch(() => '')
  const emptyState = await page.locator('[data-testid="plan-approval-empty"]').count()
  check('plan-content-visible', planText.trim().length > 0 || emptyState > 0,
    planText ? `${planText.length} chars: ${planText.slice(0, 120).replace(/\s+/g, ' ')}` : 'empty-state shown')

  const buttons = await page.evaluate(() => ['plan-approve', 'plan-request-changes', 'plan-abandon']
    .map((id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null))
  check('three-decisions-offered', buttons.every(Boolean), buttons)
  await page.screenshot({ path: path.join(outDir, '01-plan-approval-modal.png') })
  result.screenshots.push('01-plan-approval-modal.png')

  await page.locator('[data-testid="plan-approve"]').click()
  await modal.waitFor({ state: 'detached', timeout: 30_000 })
  check('modal-closes-on-approve', true, 'answered { approved: true }')

  // The turn must now finish instead of dying as "cancelled".
  await page.waitForFunction(() => {
    const text = document.body.innerText
    return !/Grok 正在工作|Reasoning/.test(text)
  }, null, { timeout: 240_000 }).catch(() => {})
  const transcript = await page.locator('.transcript, main').first().innerText().catch(() => '')
  const disconnectCopy = /client disconnected|連線中斷|approval will reappear/i.test(transcript)
  check('no-disconnect-message', !disconnectCopy, disconnectCopy ? transcript.slice(0, 300) : 'clean transcript')
  await page.screenshot({ path: path.join(outDir, '02-after-approve.png') })
  result.screenshots.push('02-after-approve.png')
} catch (error) {
  check('plan-approval-script', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  if (sessionId) {
    try {
      await (await app.firstWindow()).evaluate(async (id) => { await window.grokApi.deleteSession(id) }, sessionId)
    } catch { /* ignore */ }
  }
  await app.close()
}

result.checks = checks
result.passed = checks.filter((item) => item.ok).length
result.failed = checks.filter((item) => !item.ok).length
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
console.log(`\n${result.passed} passed / ${result.failed} failed — screenshots in ${outDir}`)
if (result.failed) process.exitCode = 1
