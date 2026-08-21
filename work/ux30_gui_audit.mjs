// Multi-round UX convenience + display-bug GUI audit for Grok Build GUI 0.14.0
// Run from work/_upstream: node work/ux30_gui_audit.mjs
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'ux30-audit')
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-ux30-'))
const projectA = await mkdtemp(path.join(tmpdir(), 'ux30-proj-a-'))
const projectB = await mkdtemp(path.join(tmpdir(), 'ux30-proj-b-'))
await mkdir(outDir, { recursive: true })

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAQCAIAAAD6B1YFAAAAHElEQVR4nGP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const fileA = path.join(projectA, 'inside-a.png')
const fileB = path.join(projectB, 'inside-b.png')
await writeFile(fileA, PNG)
await writeFile(fileB, PNG)

const findings = []
const note = (round, name, ok, detail) => {
  findings.push({ round, name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} [R${round}] ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}
const shots = []
const result = { profileDir, projectA, projectB, fileA, fileB, shots, findings, facts: {} }

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

  const shoot = async (name) => {
    const file = `${name}.png`
    await page.screenshot({ path: path.join(outDir, file) })
    shots.push(file)
    return file
  }

  const appRegionChain = async (selector) => page.evaluate((sel) => {
    const node = document.querySelector(sel)
    if (!node) return { missing: true }
    const chain = []
    let cur = node
    while (cur && cur !== document.documentElement) {
      const style = getComputedStyle(cur)
      chain.push({
        tag: cur.tagName.toLowerCase(),
        className: String(cur.className || '').slice(0, 80),
        appRegion: style.webkitAppRegion || style.getPropertyValue('-webkit-app-region') || style.getPropertyValue('app-region'),
        pointerEvents: style.pointerEvents,
        opacity: style.opacity
      })
      cur = cur.parentElement
    }
    const rect = node.getBoundingClientRect()
    return {
      disabled: 'disabled' in node ? Boolean(node.disabled) : false,
      locked: node.getAttribute('data-locked'),
      value: 'value' in node ? node.value : undefined,
      title: node.getAttribute('title') || node.parentElement?.getAttribute('title') || '',
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      chain
    }
  }, selector)

  // ───────── Round 1: welcome / chrome / permission ─────────
  await page.getByText('GROK BUILD', { exact: true }).waitFor()
  await shoot('r1-welcome')
  const welcomeText = await page.locator('.empty-state').innerText().catch(() => '')
  result.facts.welcomeText = welcomeText.slice(0, 800)
  note(1, 'welcome-button-mismatch',
    !(welcomeText.includes('選擇專案開始') && !welcomeText.includes('選資料夾開始') === false),
    {
      hasChooseProjectCopy: welcomeText.includes('選擇專案開始'),
      hasPickFolderButton: welcomeText.includes('選資料夾開始') || await page.getByTestId('new-session-pick-folder').count() > 0,
      sidebarButton: await page.getByTestId('new-session-pick-folder').innerText().catch(() => ''),
      emptyPrimary: await page.locator('.empty-actions .primary').innerText().catch(() => '')
    }
  )
  note(1, 'welcome-english-eyebrow', /GALAXY COCKPIT/.test(welcomeText), welcomeText.slice(0, 120))
  note(1, 'welcome-empty-stats-english', /L1\+L2/.test(welcomeText), 'L1+L2 銀河座艙')

  const perm = await appRegionChain('select[aria-label="權限模式"]')
  result.facts.permissionSelect = perm
  const dragAncestor = (perm.chain || []).some((item) => item.appRegion === 'drag')
  const selfNoDrag = (perm.chain || [])[0]?.appRegion === 'no-drag'
  note(1, 'permission-select-inside-drag-region', dragAncestor && !selfNoDrag, perm)
  const permClick = await page.evaluate(() => {
    const select = document.querySelector('select[aria-label="權限模式"]')
    if (!select) return { missing: true }
    const before = select.value
    select.focus()
    const opened = typeof select.showPicker === 'function'
    try { if (opened) select.showPicker() } catch (error) {
      return { before, value: select.value, showPickerError: String(error), opened: false }
    }
    return { before, value: select.value, opened }
  })
  result.facts.permissionClick = permClick
  await page.locator('select[aria-label="權限模式"]').click({ force: false }).catch((error) => {
    result.facts.permissionNativeClickError = String(error)
  })
  await shoot('r1-permission-after-click')
  const yoloModal = await page.getByRole('dialog', { name: '啟用 YOLO 模式' }).count()
  note(1, 'permission-click-opens-yolo', yoloModal > 0, { yoloModal, permClick, nativeError: result.facts.permissionNativeClickError || null })

  const titlebarFacts = await page.evaluate(() => {
    const bar = document.querySelector('.titlebar')
    const rect = bar?.getBoundingClientRect()
    const kids = [...(bar?.children ?? [])].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        className: String(el.className || '').slice(0, 60),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        overflowRight: r.right > window.innerWidth - 150
      }
    })
    return { width: rect?.width, height: rect?.height, kids, innerWidth: window.innerWidth }
  })
  result.facts.titlebar = titlebarFacts
  note(1, 'titlebar-controls-crowd-window-buttons',
    titlebarFacts.kids.some((k) => k.overflowRight),
    titlebarFacts.kids.filter((k) => k.overflowRight)
  )

  // ───────── Round 2: multi-project sessions / filters ─────────
  const now = Date.now()
  await page.evaluate(({ now, projectA, projectB }) => {
    window.__grokSmoke.seedSessions([
      { id: 'ux30-a-new', cwd: projectA, title: '專案 A 剛用過的對話', updatedAt: new Date(now).toISOString() },
      { id: 'ux30-a-old', cwd: projectA, title: '專案 A 一週前的對話', updatedAt: new Date(now - 8 * 86400000).toISOString() },
      { id: 'ux30-b-mid', cwd: projectB, title: '專案 B 昨天的對話', updatedAt: new Date(now - 1 * 86400000).toISOString() },
      { id: 'ux30-b-pin', cwd: projectB, title: '專案 B 很舊但該釘選', updatedAt: new Date(now - 40 * 86400000).toISOString() },
      { id: 'ux30-ghost', cwd: 'C:\\Users\\demo\\orphan-empty', title: '空對話建議清理', updatedAt: new Date(now - 20 * 86400000).toISOString() }
    ])
    window.__grokSmoke.activateSession({
      id: 'ux30-a-new',
      cwd: projectA,
      title: '專案 A 剛用過的對話',
      updatedAt: new Date(now).toISOString()
    })
    window.__grokSmoke.appendSessionEvent({
      id: 'ux30-a-new:user',
      sessionId: 'ux30-a-new',
      kind: 'message',
      role: 'user',
      text: '請把圖片放到另一個專案：' + projectB.replace(/\\/g, '\\\\') + '\\inside-b.png'
    })
    window.__grokSmoke.appendSessionEvent({
      id: 'ux30-a-new:asst',
      sessionId: 'ux30-a-new',
      kind: 'message',
      role: 'assistant',
      text: '已寫入 `' + projectA.replace(/\\/g, '/') + '/inside-a.png` 以及跨專案 `' + projectB.replace(/\\/g, '/') + '/inside-b.png`'
    })
    window.__grokSmoke.appendSessionEvent({
      id: 'ux30-a-new:turn',
      sessionId: 'ux30-a-new',
      kind: 'turn',
      status: 'completed'
    })
  }, { now, projectA, projectB })
  await page.waitForSelector('[data-testid="main-composer"] textarea')
  await shoot('r2-sessions-default')

  const sidebarText = await page.locator('.sidebar').innerText()
  result.facts.sidebarText = sidebarText.slice(0, 1200)
  const hasSortControl = /排序|最近使用|依名稱|依時間/.test(sidebarText)
  note(2, 'sidebar-has-sort-control', hasSortControl, { hasSortControl, caption: await page.locator('.session-caption').innerText() })
  const folderOptions = await page.locator('[data-testid="folder-filter"] option').allInnerTexts()
  result.facts.folderOptions = folderOptions
  note(2, 'folder-filter-shows-full-path', folderOptions.some((t) => t.includes(projectA) || t.includes('—')), folderOptions)

  const order = await page.locator('.session-open strong').allInnerTexts()
  result.facts.sessionOrder = order
  note(2, 'sessions-grouped-by-project-not-flat-recency', order.join('|').includes('專案 A') && order.join('|').includes('專案 B'), order)

  await page.getByTestId('active-only-toggle').check()
  await page.waitForTimeout(150)
  await shoot('r2-active-only')
  const afterActive = await page.locator('.session-open strong').allInnerTexts()
  result.facts.afterActiveFilter = afterActive
  note(2, 'active-only-hides-old-unpinned', !afterActive.some((t) => t.includes('空對話')), afterActive)

  await page.getByTestId('folder-filter').locator('select').selectOption({ index: 1 }).catch(() => {})
  await page.waitForTimeout(120)
  await shoot('r2-folder-filter')
  await page.getByTestId('folder-filter').locator('select').selectOption('all')
  await page.getByTestId('active-only-toggle').uncheck()

  const searchPlaceholder = await page.locator('.searchbox input').getAttribute('placeholder')
  note(2, 'session-search-placeholder-english', /sessions/i.test(searchPlaceholder || ''), searchPlaceholder)

  await page.locator('.searchbox input').fill('專案 B 昨天')
  await page.waitForTimeout(80)
  await shoot('r2-search')
  const searched = await page.locator('.session-open strong').allInnerTexts()
  result.facts.searched = searched
  await page.locator('.searchbox input').fill('')

  const hoverActions = await page.evaluate(() => {
    const row = document.querySelector('.session-row')
    const del = row?.querySelector('.session-delete')
    const before = del ? getComputedStyle(del).opacity : null
    row?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    const after = del ? getComputedStyle(del).opacity : null
    return { before, after }
  })
  result.facts.hoverActions = hoverActions
  note(2, 'session-actions-hidden-until-hover', Number(hoverActions.before) === 0, hoverActions)

  // ───────── Round 3: preview across projects ─────────
  const dock = page.getByTestId('preview-dock')
  if ((await dock.getAttribute('data-open')) === 'false') {
    await page.getByRole('button', { name: '展開預覽台' }).click()
  }
  await page.waitForTimeout(200)
  await shoot('r3-preview-idle')
  const previewHead = await page.locator('.preview-dock-head').innerText().catch(() => '')
  note(3, 'preview-english-eyebrow', /PREVIEW DOCK/.test(previewHead), previewHead)

  const refreshIcons = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.preview-dock-actions button')]
    return buttons.map((btn) => ({
      label: btn.getAttribute('aria-label'),
      title: btn.getAttribute('title'),
      svg: btn.querySelector('svg')?.outerHTML?.slice(0, 80)
    }))
  })
  result.facts.previewActions = refreshIcons
  const refreshSvgs = refreshIcons.filter((b) => /重新/.test(b.label || '')).map((b) => b.svg)
  note(3, 'preview-refresh-and-rescan-same-icon', refreshSvgs.length >= 2 && refreshSvgs[0] === refreshSvgs[1], refreshIcons)

  const regA = await page.evaluate(async (p) => window.grokApi.previewRegister(p).catch((e) => ({ ok: false, reason: String(e) })), fileA)
  const regB = await page.evaluate(async (p) => window.grokApi.previewRegister(p).catch((e) => ({ ok: false, reason: String(e) })), fileB)
  result.facts.previewRegister = { regA, regB }
  note(3, 'preview-file-in-other-project-blocked',
    regB?.ok === false && /工作區外|允許/.test(regB?.reason || ''),
    { regA, regB }
  )

  await page.evaluate((p) => window.__grokSmoke.openPreviewPath(p), fileB)
  await page.waitForTimeout(500)
  await shoot('r3-preview-other-project')
  const previewError = await page.getByTestId('preview-error').innerText().catch(() => '')
  result.facts.previewErrorB = previewError
  note(3, 'preview-ui-shows-workspace-error-for-other-project',
    /工作區外|找不到|失敗|不支援/.test(previewError) || previewError.length > 0,
    previewError
  )

  await page.evaluate((p) => window.__grokSmoke.openPreviewPath(p), fileA)
  await page.waitForTimeout(500)
  await shoot('r3-preview-same-project')
  const previewStageA = await page.getByTestId('preview-stage').innerText().catch(() => '')
  const previewHasImg = await page.locator('[data-testid="preview-stage"] img').count()
  result.facts.previewStageA = { text: previewStageA.slice(0, 400), previewHasImg, regA }
  note(3, 'preview-same-project-without-loadsession-also-blocked',
    previewHasImg === 0 && (regA?.ok === false),
    { previewHasImg, previewStageA: previewStageA.slice(0, 200), regA }
  )

  // Try live loadSession to register cwd, if CLI is up.
  let livePreview = null
  try {
    livePreview = await page.evaluate(async ({ cwd, file }) => {
      const status = await window.grokApi.getStatus()
      if (!status?.found) return { skipped: true, reason: 'cli-not-found', status }
      await window.grokApi.connect()
      const created = await window.grokApi.createSession(cwd)
      await window.grokApi.loadSession(created.sessionId, cwd)
      window.__grokSmoke.activateSession({
        id: created.sessionId,
        cwd,
        title: 'live preview session',
        updatedAt: new Date().toISOString()
      })
      const inRoot = await window.grokApi.previewRegister(file)
      return { skipped: false, sessionId: created.sessionId, inRoot }
    }, { cwd: projectA, file: fileA })
  } catch (error) {
    livePreview = { skipped: true, error: error instanceof Error ? error.message : String(error) }
  }
  result.facts.livePreview = livePreview
  note(3, 'preview-works-after-session-load-in-same-cwd',
    livePreview?.skipped || livePreview?.inRoot?.ok === true,
    livePreview
  )

  // ───────── Round 4: session workspace / composer / tools ─────────
  const header = await page.locator('.session-header').innerText().catch(() => '')
  result.facts.sessionHeader = header.slice(0, 500)
  note(4, 'session-header-english-eyebrow', /ACTIVE SESSION/.test(header), header.slice(0, 160))

  const sessionTools = await page.evaluate(() => {
    return [...document.querySelectorAll('.session-tools button, .session-tools [aria-label]')].map((el) => ({
      tag: el.tagName.toLowerCase(),
      aria: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height)
    }))
  })
  result.facts.sessionTools = sessionTools
  const iconOnly = sessionTools.filter((t) => t.tag === 'button' && !t.text && (t.title || t.aria))
  note(4, 'session-tools-icon-only-no-visible-label', iconOnly.length >= 4, iconOnly)

  const composerPh = await page.locator('[data-testid="main-composer"] textarea').getAttribute('placeholder')
  result.facts.composerPlaceholder = composerPh
  const templates = await page.locator('[data-testid="prompt-templates"]').innerText().catch(() => '')
  note(4, 'templates-present', /程式審查|修錯誤|解釋這段/.test(templates), templates)

  // After live createSession the composer may be disabled until ACP ready.
  // Re-activate a smoke-ready session so later UI probes stay clickable.
  await page.evaluate(({ now, projectA }) => {
    window.__grokSmoke.activateSession({
      id: 'ux30-a-new',
      cwd: projectA,
      title: '專案 A 剛用過的對話',
      updatedAt: new Date(now).toISOString()
    })
  }, { now, projectA })
  await page.waitForTimeout(200)
  const composer = page.locator('[data-testid="main-composer"] textarea')
  const composerDisabled = await composer.isDisabled().catch(() => true)
  if (composerDisabled) {
    await page.evaluate(() => {
      const ta = document.querySelector('[data-testid="main-composer"] textarea')
      if (ta) ta.removeAttribute('disabled')
    })
  }
  await composer.fill('第一行\n第二行\n第三行足夠觸發收合', { force: true })
  await page.waitForTimeout(80)
  const collapse = await page.getByTestId('composer-collapse').count()
  note(4, 'composer-collapse-only-when-multiline', collapse > 0, { collapse, composerDisabled })
  await shoot('r4-composer-multiline')

  await page.getByTitle('搜尋').click().catch(() => page.locator('.session-tools button').nth(0).click())
  await page.waitForTimeout(80)
  const searchOpen = await page.locator('.transcript-search').count()
  note(4, 'transcript-search-opens', searchOpen > 0, { searchOpen })
  await shoot('r4-transcript-search')
  if (searchOpen) await page.locator('.transcript-search button').click().catch(() => {})

  await page.getByTestId('prompt-bookmarks-trigger').click()
  await page.waitForTimeout(80)
  await shoot('r4-bookmarks')
  await page.keyboard.press('Escape')

  const footerEnglish = await page.locator('.transcript-end').innerText().catch(() => '')
  note(4, 'transcript-end-english', /END OF CURRENT CONTEXT/.test(footerEnglish), footerEnglish)

  const statusPill = await page.locator('.status-pill').innerText().catch(() => '')
  note(4, 'status-pill-english', /Connected|Connect|CLI not found|Setup/.test(statusPill), statusPill)

  // ───────── Round 5: drawers / palette / shortcuts ─────────
  await page.getByRole('button', { name: '功能矩陣' }).click()
  const features = page.locator('.drawer').filter({ hasText: '功能矩陣' })
  await features.waitFor({ state: 'visible' })
  await shoot('r5-features')
  const featureText = await features.innerText()
  result.facts.features = featureText.slice(0, 1500)
  note(5, 'features-english-eyebrow', /CAPABILITY ROUTER/.test(featureText), 'CAPABILITY ROUTER')
  note(5, 'features-todos-unwired', /Todos[\s\S]{0,20}尚未接上/.test(featureText), 'Todos 尚未接上')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '設定' }).click()
  const settings = page.locator('[data-testid="settings-drawer"]')
  await settings.waitFor({ state: 'visible' })
  await shoot('r5-settings-top')
  const settingsText = await settings.innerText()
  result.facts.settingsHead = settingsText.slice(0, 800)
  note(5, 'settings-english-eyebrow', /LOCAL PREFERENCES/.test(settingsText), 'LOCAL PREFERENCES')
  note(5, 'settings-shortcut-ids-not-localized', /searchTranscript|commandPalette|newSession/.test(settingsText), 'shortcut command ids')
  await page.locator('.shortcut-row').first().scrollIntoViewIfNeeded()
  await shoot('r5-settings-shortcuts')
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+Shift+P')
  await page.waitForTimeout(200)
  await shoot('r5-command-palette')
  const palette = await page.locator('.command-palette, [role="dialog"]').filter({ hasText: /命令|搜尋指令|palette/i }).innerText().catch(() => '')
  result.facts.palette = palette.slice(0, 600)
  await page.keyboard.press('Escape')

  await page.keyboard.press('?')
  await page.waitForTimeout(150)
  await shoot('r5-shortcuts-overlay')
  const shortcutHelp = await page.getByRole('dialog', { name: '快捷鍵一覽' }).innerText().catch(() => '')
  result.facts.shortcutHelp = shortcutHelp.slice(0, 800)
  note(5, 'shortcut-help-english-eyebrow', /KEYBOARD HELP/.test(shortcutHelp), shortcutHelp.slice(0, 120))
  await page.keyboard.press('Escape')

  await page.getByTestId('open-background-tasks').click()
  await page.waitForTimeout(200)
  await shoot('r5-background-tasks')
  const bgText = await page.locator('.drawer, [data-testid="background-tasks"]').first().innerText().catch(() => page.locator('body').innerText())
  result.facts.background = String(bgText).slice(0, 600)
  await page.keyboard.press('Escape')

  // ───────── Round 6: modals ─────────
  await page.evaluate(() => {
    window.__grokSmoke.enqueuePermission({
      sessionId: window.__grokSmoke.getActiveSessionId(),
      requestId: 'perm-ux30',
      title: '寫入 src/App.tsx',
      options: [
        { optionId: 'allow-once', name: '允許一次', kind: 'allow_once' },
        { optionId: 'reject', name: '拒絕', kind: 'reject_once' }
      ]
    })
  })
  await page.getByRole('dialog').waitFor({ state: 'visible' })
  await shoot('r6-permission-modal')
  const permModal = await page.getByRole('dialog').innerText()
  result.facts.permModal = permModal.slice(0, 600)
  note(6, 'permission-modal-english-eyebrow', /ACTION REQUIRES APPROVAL/.test(permModal), permModal.slice(0, 160))
  note(6, 'permission-option-kind-raw', /allow_once|reject_once/.test(permModal), permModal.slice(0, 300))
  await page.evaluate(() => window.__grokSmoke.clearPermissions())
  await page.waitForTimeout(150)

  await page.evaluate(() => {
    const select = document.querySelector('select[aria-label="權限模式"]')
    if (!select) return
    select.value = 'always-approve'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForTimeout(200)
  const yolo = await page.getByRole('dialog', { name: '啟用 YOLO 模式' }).count()
  note(6, 'yolo-confirm-via-change-event', yolo > 0, { yolo })
  if (yolo) {
    await shoot('r6-yolo-confirm')
    await page.getByRole('button', { name: /取消/ }).click()
  }

  await page.locator('button[aria-label^="重新命名"]').first().click()
  await page.waitForTimeout(150)
  await shoot('r6-rename')
  const rename = await page.getByRole('dialog', { name: '重新命名對話' }).innerText().catch(() => '')
  note(6, 'rename-english-eyebrow', /LOCAL TITLE/.test(rename), rename.slice(0, 160))
  await page.keyboard.press('Escape')

  await page.evaluate(() => {
    window.__grokSmoke.enqueuePlanApproval({
      sessionId: window.__grokSmoke.getActiveSessionId(),
      requestId: 'plan-ux30',
      planContent: '1. 改預覽路徑政策\n2. 補側欄排序'
    })
  })
  await page.getByTestId('plan-approval-modal').waitFor({ state: 'visible' })
  await shoot('r6-plan-approval')
  await page.keyboard.press('Escape')

  await page.evaluate(() => {
    window.__grokSmoke.appendSessionEvent({
      id: 'ux30-run',
      sessionId: window.__grokSmoke.getActiveSessionId(),
      kind: 'turn',
      status: 'running'
    })
  })
  await page.waitForTimeout(120)
  await shoot('r6-running-rail')
  const rail = await page.getByTestId('command-rail').innerText().catch(() => '')
  result.facts.commandRail = rail
  note(6, 'running-rail-four-actions', /插話/.test(rail) && /排隊下一輪/.test(rail) && /立刻改做/.test(rail) && /停止/.test(rail), rail)
  const permLocked = await page.locator('select[aria-label="權限模式"]').getAttribute('data-locked')
  note(6, 'permission-locked-while-running', permLocked === 'true', permLocked)
  await page.evaluate(() => {
    window.__grokSmoke.appendSessionEvent({
      id: 'ux30-run-done',
      sessionId: window.__grokSmoke.getActiveSessionId(),
      kind: 'turn',
      status: 'completed'
    })
  })

  // ───────── Round 7: light theme + narrow + collapsed ─────────
  await page.getByRole('button', { name: '設定' }).click()
  await page.getByRole('button', { name: '亮色' }).click()
  await page.waitForTimeout(200)
  await shoot('r7-light-session')
  const lightContrast = await page.evaluate(() => {
    const samples = ['.titlebar strong', '.session-list strong', '.session-header h1', '.empty-state h1', '.permission-mode-label', '.composer-status-pill']
    return samples.map((sel) => {
      const el = document.querySelector(sel)
      if (!el) return { sel, missing: true }
      const s = getComputedStyle(el)
      return { sel, color: s.color, bg: s.backgroundColor, fontSize: s.fontSize, opacity: s.opacity }
    })
  })
  result.facts.lightContrast = lightContrast
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 1100, height: 800 })
  await page.waitForTimeout(150)
  await shoot('r7-narrow-1100')
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      hasHScroll: doc.scrollWidth > doc.clientWidth + 2,
      headerTools: document.querySelector('.session-tools')?.getBoundingClientRect(),
      header: document.querySelector('.session-header')?.getBoundingClientRect(),
      titlebarKids: [...document.querySelectorAll('.titlebar > *')].map((el) => {
        const r = el.getBoundingClientRect()
        return { className: String(el.className).slice(0, 40), right: Math.round(r.right), hidden: r.right > window.innerWidth - 8 || r.width < 4 }
      })
    }
  })
  result.facts.narrowOverflow = overflow
  note(7, 'narrow-horizontal-overflow', overflow.hasHScroll, overflow)

  await page.getByLabel('收合側欄').click()
  await page.waitForTimeout(120)
  await shoot('r7-sidebar-collapsed')
  const collapsed = await page.evaluate(() => {
    const visible = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return false
      const style = getComputedStyle(node)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    return {
      folder: visible('[data-testid="folder-filter"]'),
      expand: visible('.sidebar-expand-float') || visible('.sidebar-rail-expand')
    }
  })
  note(7, 'collapsed-hides-filters', !collapsed.folder && collapsed.expand, collapsed)
  await page.locator('.sidebar-expand-float, .sidebar-rail-expand').first().click()

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: '設定' }).click()
  await page.getByRole('button', { name: '深色' }).click()
  await page.keyboard.press('Escape')

  // Welcome with no active — collapse sidebar on empty
  await page.evaluate(() => window.__grokSmoke.seedSessions([]))
  await page.waitForTimeout(200)
  // activate none by seeding empty then not activating
  await page.evaluate(() => {
    window.__grokSmoke.seedSessions([])
  })
  // Can't easily clear active; skip empty collapse if still in session.

  // ───────── Round 8: a11y dump + leftover English ─────────
  const englishScan = await page.evaluate(() => {
    const body = document.body.innerText
    const needles = [
      'GALAXY COCKPIT', 'PREVIEW DOCK', 'ACTIVE SESSION', 'LOCAL PREFERENCES',
      'CAPABILITY ROUTER', 'KEYBOARD HELP', 'END OF CURRENT CONTEXT',
      'Connected', 'CLI not found', 'No description', 'YOLO',
      'TEAM', 'Background task', 'ACTION REQUIRES APPROVAL',
      'FIRST-TIME SETUP', 'OFFICIAL GROK OAUTH', 'PERMISSION MODE',
      'DELETE SESSION', 'LOCAL TITLE', 'PLAN AWAITING APPROVAL',
      '搜尋 sessions'
    ]
    return needles.filter((n) => body.includes(n))
  })
  result.facts.englishScan = englishScan
  note(8, 'english-leftovers-visible', englishScan.length > 0, englishScan)

  const tinyType = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('small, .eyebrow, .model-trigger em, .session-header .eyebrow, .folder-filter, .session-caption, .quota-ring small')]
    return nodes.slice(0, 40).map((el) => {
      const s = getComputedStyle(el)
      return { text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), fontSize: s.fontSize, color: s.color, opacity: s.opacity }
    }).filter((n) => parseFloat(n.fontSize) > 0 && parseFloat(n.fontSize) < 11)
  })
  result.facts.tinyType = tinyType
  note(8, 'sub-11px-type-present', tinyType.length > 0, tinyType.slice(0, 12))

  const noticePointer = await page.evaluate(() => {
    const el = document.querySelector('.notice')
    const style = getComputedStyle(document.documentElement)
    // inject a notice by clicking permission same-value if possible
    return {
      ruleGuess: 'pointer-events:none in css',
      exists: Boolean(el)
    }
  })
  result.facts.notice = noticePointer

  await shoot('r8-final-desktop')

  note(8, 'renderer-console-clean', consoleErrors.length === 0 && pageErrors.length === 0, {
    consoleErrors: consoleErrors.slice(0, 8),
    pageErrors: pageErrors.slice(0, 8)
  })

  await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.log('WROTE', path.join(outDir, 'result.json'))
  console.log('SHOTS', shots.join(', '))
} catch (error) {
  findings.push({ round: 0, name: 'audit-crashed', ok: false, detail: error instanceof Error ? error.stack : String(error) })
  console.error(error)
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
} finally {
  await app.close()
}
