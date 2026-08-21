// Final-wave GUI checks for the 2026-08-21 UX convenience waves.
// Run from work/_upstream: node work/ux_wave_verify.mjs
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'ux-wave-verify')
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-ux-wave-'))
const projectA = await mkdtemp(path.join(tmpdir(), 'ux-wave-proj-a-'))
const projectB = await mkdtemp(path.join(tmpdir(), 'ux-wave-proj-b-'))
await mkdir(outDir, { recursive: true })

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAQCAIAAAD6B1YFAAAAHElEQVR4nGP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const fileA = path.join(projectA, 'inside-a.png')
const fileB = path.join(projectB, 'inside-b.png')
await writeFile(fileA, PNG)
await writeFile(fileB, PNG)

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

const result = {
  profileDir,
  projectA,
  projectB,
  fileA,
  fileB,
  shots: [],
  checks,
  facts: {}
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

  const shoot = async (name) => {
    const file = `${name}.png`
    await page.screenshot({ path: path.join(outDir, file) })
    result.shots.push(file)
    return file
  }

  const appRegion = async (selector) => page.evaluate((sel) => {
    const node = document.querySelector(sel)
    if (!node) return { missing: true }
    const style = getComputedStyle(node)
    const chain = []
    let cur = node
    while (cur && cur !== document.documentElement) {
      const cs = getComputedStyle(cur)
      chain.push({
        tag: cur.tagName.toLowerCase(),
        className: String(cur.className || '').slice(0, 80),
        appRegion: cs.webkitAppRegion || cs.getPropertyValue('-webkit-app-region') || cs.getPropertyValue('app-region')
      })
      cur = cur.parentElement
    }
    return {
      appRegion: style.webkitAppRegion || style.getPropertyValue('-webkit-app-region') || style.getPropertyValue('app-region'),
      chain
    }
  }, selector)

  // ── Welcome / 選資料夾開始 / 未就緒誠實 ──
  await page.getByText('GROK BUILD', { exact: true }).waitFor()
  await shoot('01-welcome')

  const welcome = await page.evaluate(() => {
    const empty = document.querySelector('.empty-state')
    const emptyText = empty?.innerText ?? ''
    const sidebarBtn = document.querySelector('[data-testid="new-session-pick-folder"]')
    const emptyPrimary = document.querySelector('.empty-actions .primary')
    const pill = document.querySelector('.composer-status-pill')
    return {
      emptyText: emptyText.slice(0, 800),
      hasEmpty: Boolean(empty),
      sidebar: (sidebarBtn?.textContent || '').replace(/\s+/g, ' ').trim(),
      emptyPrimary: (emptyPrimary?.textContent || '').replace(/\s+/g, ' ').trim(),
      composerReady: Boolean(pill?.classList.contains('is-ready')),
      composerText: (pill?.innerText || '').replace(/\s+/g, ' ').trim(),
      chooseProject: emptyText.includes('選擇專案開始'),
      pickFolder: emptyText.includes('選資料夾開始')
    }
  })
  result.facts.welcome = welcome
  const pickFolderOk = welcome.sidebar.includes('選資料夾開始')
    && welcome.emptyPrimary.includes('選資料夾開始')
    && welcome.pickFolder
    && !welcome.chooseProject
  check('pick-folder-copy', pickFolderOk, {
    sidebar: welcome.sidebar,
    emptyPrimary: welcome.emptyPrimary,
    hasPickFolder: welcome.pickFolder,
    hasChooseProject: welcome.chooseProject
  })

  const unreadinessOk = !welcome.composerReady && !/就緒/.test(welcome.composerText)
  check('unreadiness-not-ready', unreadinessOk, {
    composerReady: welcome.composerReady,
    composerText: welcome.composerText
  })

  // ── 權限控制 no-drag ──
  const permLabel = await appRegion('[data-testid="permission-mode"]')
  const permToggle = await appRegion('.permission-mode-toggle')
  const permAsk = await appRegion('.permission-mode-toggle button')
  result.facts.permissionRegion = { permLabel, permToggle, permAsk }
  const noDrag = (info) => !info?.missing && info.appRegion === 'no-drag'
  check('permission-no-drag', noDrag(permLabel) && noDrag(permToggle) && noDrag(permAsk), {
    label: permLabel.appRegion,
    toggle: permToggle.appRegion,
    button: permAsk.appRegion
  })
  await shoot('02-permission-nodrag')

  // ── 搜尋 placeholder ──
  const searchPlaceholder = await page.locator('.searchbox input').getAttribute('placeholder')
  result.facts.searchPlaceholder = searchPlaceholder
  check('search-placeholder-no-sessions', Boolean(searchPlaceholder) && !/sessions/i.test(searchPlaceholder), searchPlaceholder)

  // ── 側欄排序 ──
  const sort = page.getByTestId('sidebar-sort')
  const sortCount = await sort.count()
  const sortText = sortCount ? await sort.innerText() : ''
  const sortOptions = sortCount ? await sort.locator('select option').allInnerTexts() : []
  result.facts.sort = { sortCount, sortText, sortOptions }
  check('sidebar-sort-control', sortCount > 0 && /排序/.test(sortText) && sortOptions.includes('最近更新'), {
    sortText,
    sortOptions
  })
  await shoot('03-sidebar-sort')

  // ── 兩個已列專案 + 預覽 ──
  const now = Date.now()
  await page.evaluate(({ now, projectA, projectB }) => {
    window.__grokSmoke.seedSessions([
      { id: 'ux-wave-a', cwd: projectA, title: '專案 A 對話', updatedAt: new Date(now).toISOString() },
      { id: 'ux-wave-b', cwd: projectB, title: '專案 B 對話', updatedAt: new Date(now - 3600_000).toISOString() }
    ])
    window.__grokSmoke.activateSession({
      id: 'ux-wave-a',
      cwd: projectA,
      title: '專案 A 對話',
      updatedAt: new Date(now).toISOString()
    })
    window.__grokSmoke.appendSessionEvent({
      id: 'ux-wave-a:user',
      sessionId: 'ux-wave-a',
      kind: 'message',
      role: 'user',
      text: '請預覽跨專案圖片'
    })
    window.__grokSmoke.appendSessionEvent({
      id: 'ux-wave-a:asst',
      sessionId: 'ux-wave-a',
      kind: 'message',
      role: 'assistant',
      text: '已寫入圖片'
    })
  }, { now, projectA, projectB })
  await page.waitForSelector('[data-testid="main-composer"] textarea')
  await page.waitForTimeout(200)

  const listed = await page.locator('.session-open strong').allInnerTexts()
  result.facts.listedSessions = listed

  const honesty = await page.evaluate(() => {
    const pill = document.querySelector('.composer-status-pill')
    const ta = document.querySelector('[data-testid="main-composer"] textarea')
    const text = (pill?.innerText || '').replace(/\s+/g, ' ').trim()
    const ready = Boolean(pill?.classList.contains('is-ready'))
    const disabled = Boolean(ta && 'disabled' in ta ? ta.disabled : true)
    return { text, ready, disabled }
  })
  result.facts.composerHonesty = honesty
  check('ready-matches-composer', honesty.ready ? !honesty.disabled && /就緒/.test(honesty.text) : !/就緒/.test(honesty.text), honesty)

  const dock = page.getByTestId('preview-dock')
  if ((await dock.getAttribute('data-open')) === 'false') {
    await page.getByRole('button', { name: '展開預覽台' }).click().catch(() => {})
  }
  await page.waitForTimeout(150)

  const regA = await page.evaluate(async (p) => window.grokApi.previewRegister(p).catch((e) => ({ ok: false, reason: String(e) })), fileA)
  const regB = await page.evaluate(async (p) => window.grokApi.previewRegister(p).catch((e) => ({ ok: false, reason: String(e) })), fileB)
  result.facts.previewRegister = { regA, regB }

  let allowFolderVisible = false
  let previewError = ''
  if (!(regB && regB.ok === true)) {
    await page.evaluate((p) => window.__grokSmoke.openPreviewPath(p), fileB)
    await page.waitForTimeout(600)
    previewError = await page.getByTestId('preview-error').innerText().catch(() => '')
    allowFolderVisible = (await page.getByTestId('preview-allow-folder').count()) > 0
      || /允許這個資料夾/.test(previewError)
      || (await page.getByRole('button', { name: /允許這個資料夾/ }).count()) > 0
  }
  result.facts.previewUi = { allowFolderVisible, previewError }
  await shoot('04-preview-other-project')
  check('preview-other-project-or-allow-folder',
    (regB && regB.ok === true) || allowFolderVisible,
    { regA, regB, allowFolderVisible, previewError: previewError.slice(0, 240), listed }
  )

  // ── 權限盒無 allow_once ──
  await page.evaluate(() => {
    window.__grokSmoke.enqueuePermission({
      sessionId: window.__grokSmoke.getActiveSessionId(),
      requestId: 'perm-ux-wave',
      title: '寫入示範檔',
      options: [
        { optionId: 'allow-once', name: '允許一次', kind: 'allow_once' },
        { optionId: 'reject', name: '拒絕', kind: 'reject_once' }
      ]
    })
  })
  await page.getByRole('dialog').waitFor({ state: 'visible' })
  const permModal = await page.getByRole('dialog').innerText()
  result.facts.permModal = permModal.slice(0, 600)
  await shoot('05-permission-modal')
  check('permission-modal-no-allow_once', !/allow_once|reject_once|allow_always|reject_always/.test(permModal), permModal.slice(0, 300))
  await page.evaluate(() => window.__grokSmoke.clearPermissions())
  await page.waitForTimeout(150)

  // ── 1100px header 不蓋 transcript ──
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.waitForTimeout(200)
  await shoot('06-header-1100')
  const layout = await page.evaluate(() => {
    const header = document.querySelector('.session-header')
    const transcript = document.querySelector('.transcript')
    const tools = document.querySelector('.session-tools')
    const more = document.querySelector('[data-testid="session-tools-more"]')
    if (!header || !transcript) return { missing: true }
    const hr = header.getBoundingClientRect()
    const tr = transcript.getBoundingClientRect()
    const toolsR = tools?.getBoundingClientRect()
    const moreStyle = more ? getComputedStyle(more) : null
    const moreVisible = Boolean(more) && moreStyle?.display !== 'none' && moreStyle?.visibility !== 'hidden'
    return {
      header: { top: Math.round(hr.top), bottom: Math.round(hr.bottom), height: Math.round(hr.height) },
      transcript: { top: Math.round(tr.top), bottom: Math.round(tr.bottom) },
      toolsBottom: toolsR ? Math.round(toolsR.bottom) : null,
      overlapPx: Math.round(hr.bottom - tr.top),
      toolsOverlapPx: toolsR ? Math.round(toolsR.bottom - tr.top) : null,
      moreVisible,
      innerWidth: window.innerWidth
    }
  })
  result.facts.layout1100 = layout
  const headerClear = !layout.missing
    && layout.overlapPx <= 2
    && (layout.toolsOverlapPx == null || layout.toolsOverlapPx <= 2)
  check('header-not-covering-transcript-1100', headerClear, layout)

  await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.log('WROTE', path.join(outDir, 'result.json'))
  console.log('SHOTS', result.shots.join(', '))
} catch (error) {
  check('audit-crashed', false, error instanceof Error ? error.stack : String(error))
  console.error(error)
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
} finally {
  await app.close().catch(() => {})
}

const failed = checks.filter((item) => !item.ok)
console.log(`\n${checks.filter((item) => item.ok).length} passed / ${failed.length} failed — ${outDir}`)
if (failed.length) process.exit(1)
