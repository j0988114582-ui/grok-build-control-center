// Wave A1 — logic-hole GUI audit.
// Real Electron window, real clicks, screenshots. Unit-green does not count.
//
//   npm run build ; node work/wave_a1_logic_gui_audit.mjs
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const DAY = 86_400_000
const outDir = path.resolve('output', 'playwright', 'wave-a1-logic')
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-a1-logic-'))
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
  page.setDefaultTimeout(60_000)
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
      { id: 'fresh-a1', cwd: 'C:\\repo', title: 'A1 今天的對話', updatedAt: new Date(stamp).toISOString() },
      { id: 'stale-a1', cwd: 'C:\\repo', title: 'A1 兩週沒動的', updatedAt: new Date(stamp - 14 * 86_400_000).toISOString() }
    ])
    window.__grokSmoke.activateSession({
      id: 'fresh-a1',
      cwd: 'C:\\repo',
      title: 'A1 今天的對話',
      updatedAt: new Date(stamp).toISOString()
    })
  }, now)
  await page.waitForSelector('[data-testid="main-composer"] textarea')

  // ---- 1. Plan leftover: Esc answers request-changes and closes the dialog ----
  await page.evaluate(() => {
    window.__grokSmoke.enqueuePlanApproval({
      requestId: 'plan:a1-esc',
      sessionId: 'fresh-a1',
      toolCallId: 'tool-1',
      planContent: 'A1 測試計畫：Esc 應該關掉這個視窗，並且回覆請它修改。'
    })
  })
  const planModal = page.getByTestId('plan-approval-modal')
  await planModal.waitFor({ state: 'visible' })
  await shoot(page, '01-plan-modal-open.png')
  await page.keyboard.press('Escape')
  await planModal.waitFor({ state: 'hidden' })
  check('esc-closes-plan-modal', !(await planModal.isVisible().catch(() => false)), 'modal gone after Escape')
  await shoot(page, '02-plan-modal-after-esc.png')

  // ---- 2. Turn cancelled also clears a leftover plan dialog ----------------
  await page.evaluate(() => {
    window.__grokSmoke.enqueuePlanApproval({
      requestId: 'plan:a1-turn',
      sessionId: 'fresh-a1',
      toolCallId: 'tool-2',
      planContent: 'A1 測試計畫：回合取消後這個視窗必須消失。'
    })
  })
  await planModal.waitFor({ state: 'visible' })
  await page.evaluate(() => {
    window.__grokSmoke.appendSessionEvent({
      id: 'fresh-a1:turn:cancel',
      sessionId: 'fresh-a1',
      kind: 'turn',
      status: 'cancelled'
    })
  })
  await planModal.waitFor({ state: 'hidden' })
  check('turn-end-clears-plan-modal', !(await planModal.isVisible().catch(() => false)), 'modal gone after cancelled turn')
  await shoot(page, '03-plan-modal-after-turn-cancel.png')

  // ---- 3. Permission reply failure must keep the dialog -------------------
  await page.evaluate(() => {
    window.__grokSmoke.enqueuePermission({
      requestId: 'perm:a1-fail',
      sessionId: 'fresh-a1',
      title: 'A1 權限失敗仍應留在畫面上',
      options: [
        { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject', name: 'Cancel', kind: 'reject_once' }
      ]
    })
  })
  const permDialog = page.getByRole('dialog', { name: 'A1 權限失敗仍應留在畫面上' })
  await permDialog.waitFor({ state: 'visible' })
  await shoot(page, '04-permission-before-fail.png')
  await page.getByRole('button', { name: /Allow once/ }).click()
  await page.waitForTimeout(500)
  const stillOpen = await permDialog.isVisible()
  const noticeText = await page.locator('.notice').innerText().catch(() => '')
  check('permission-failure-keeps-modal', stillOpen, {
    stillOpen,
    noticeText
  })
  await shoot(page, '05-permission-after-fail.png')
  if (stillOpen) {
    await page.evaluate(() => window.__grokSmoke.clearPermissions())
    await permDialog.waitFor({ state: 'hidden' })
  }

  // ---- 4. Cleanup delete still works when active-only hides the session ----
  const toggle = page.locator('[data-testid="active-only-toggle"]')
  if (!(await toggle.isChecked())) await toggle.click()
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll('[data-testid="session-list"] .session-meta strong')]
      .map((node) => node.textContent?.trim())
    return titles.includes('A1 今天的對話') && !titles.includes('A1 兩週沒動的')
  })
  await page.getByTestId('cleanup-suggest-button').click()
  const cleanupPanel = page.getByTestId('cleanup-suggest-panel')
  await cleanupPanel.waitFor({ state: 'visible' })
  await cleanupPanel.locator('label', { hasText: 'A1 兩週沒動的' }).locator('input').check()
  await shoot(page, '06-cleanup-hidden-selected.png')
  await page.getByTestId('cleanup-batch-delete').click()
  const confirm = page.getByRole('dialog', { name: '批次刪除確認' })
  await confirm.waitFor({ state: 'visible' })
  const confirmText = await confirm.innerText()
  check('cleanup-delete-reaches-confirm', confirmText.includes('將刪除 1 則對話'), confirmText.slice(0, 120))
  await shoot(page, '07-cleanup-delete-confirm.png')
  await confirm.getByRole('button', { name: /取消/ }).click()
  await confirm.waitFor({ state: 'hidden' })

  // ---- 5. /always-approve from the palette opens YOLO confirm, not a draft --
  await page.evaluate(() => {
    window.__grokSmoke.setCommands([{ name: 'always-approve', description: 'Toggle always-approve mode' }])
  })
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+Shift+KeyP')
  const paletteSearch = page.getByRole('combobox', { name: '搜尋命令' })
  const paletteOpened = await paletteSearch.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)
  if (!paletteOpened) {
    check('always-approve-palette-opens-yolo', false, 'command palette did not open')
  } else {
    await paletteSearch.fill('always-approve')
    const alwaysRow = page.getByRole('option', { name: /always-approve/i })
    await alwaysRow.waitFor({ state: 'visible', timeout: 8_000 })
    await alwaysRow.click()
    const yolo = page.getByRole('dialog', { name: '啟用 YOLO 模式' })
    const yoloVisible = await yolo.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)
    const draft = await page.locator('[data-testid="main-composer"] textarea').inputValue().catch(() => '')
    check('always-approve-palette-opens-yolo', yoloVisible && !draft.includes('/always-approve'), {
      yoloVisible,
      draft
    })
    await shoot(page, '08-always-approve-yolo.png')
    if (yoloVisible) await yolo.getByRole('button', { name: /取消/ }).click()
  }

  const unexpectedPageErrors = pageErrors.filter((message) => !/addEventListener/.test(message))
  check('renderer-console-clean', consoleErrors.length === 0 && unexpectedPageErrors.length === 0, {
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
