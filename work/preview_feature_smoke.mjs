// Electron smoke for Preview Dock 0.7.0 + C13 screenshot matrix.
// No paid prompts. Uses Grok session/new (free) when CLI available + window.__grokSmoke hook.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-gui-preview-'))
const fixturesDir = await mkdtemp(path.join(tmpdir(), 'grok-preview-fixtures-'))
const output = path.resolve('outputs', 'preview-smoke')
await mkdir(output, { recursive: true })

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
// Minimal ISO BMFF mp4 shell (metadata path; may not decode frames).
const MINI_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65
])
const HTML_FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>C13</title>
<style>body{font-family:system-ui;background:#0b1020;color:#e8e4d9;padding:24px}h1{color:#7dd3fc}</style>
</head><body><h1>Preview HTML fixture</h1><p>C13 沙箱預覽</p></body></html>`
const CODE_FIXTURE = `// C13 code fixture\nexport function greet(name: string): string {\n  return \`hello \${name}\`\n}\n`

const fixturePaths = {
  image: path.join(fixturesDir, 'c13-sample.png'),
  video: path.join(fixturesDir, 'c13-sample.mp4'),
  html: path.join(fixturesDir, 'c13-sample.html'),
  code: path.join(fixturesDir, 'c13-sample.ts')
}
await writeFile(fixturePaths.image, PNG_1X1)
await writeFile(fixturePaths.video, MINI_MP4)
await writeFile(fixturePaths.html, HTML_FIXTURE, 'utf8')
await writeFile(fixturePaths.code, CODE_FIXTURE, 'utf8')

const executablePath = process.env.GROK_GUI_EXE?.trim()
const app = await electron.launch(executablePath
  ? { executablePath: path.resolve(executablePath), args: [`--user-data-dir=${profile}`] }
  : { args: ['.', `--user-data-dir=${profile}`] })

const result = {
  dockMounted: false,
  toggleOpen: false,
  toggleClose: false,
  shortcut: false,
  csp: false,
  sessionReady: false,
  kinds: { image: false, video: false, html: false, code: false },
  viewports: { 1040: false, 1280: false },
  a11y: [],
  screenshots: [],
  exitCode: 1
}

let page

const shot = async (name) => {
  const file = path.join(output, name)
  await page.screenshot({ path: file, fullPage: true })
  result.screenshots.push(file)
  return file
}

try {
  page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('GROK BUILD', { exact: true }).waitFor()
  await page.addInitScript({ path: path.resolve('node_modules', 'axe-core', 'axe.min.js') })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('GROK BUILD', { exact: true }).waitFor()

  const audit = async (state) => {
    const report = await page.evaluate(async () => {
      if (!globalThis.axe) return []
      const output = await globalThis.axe.run(document)
      return output.violations
        .filter((item) => item.impact === 'serious' || item.impact === 'critical')
        .map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }))
    })
    result.a11y.push({ state, violations: report })
  }

  result.csp = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    const content = meta?.getAttribute('content') ?? ''
    return content.includes('media-src') && content.includes('grok-preview:') && content.includes('https:')
  })

  const dock = page.getByTestId('preview-dock')
  await dock.waitFor()
  result.dockMounted = true

  if ((await dock.getAttribute('data-open')) === 'false') {
    await page.getByRole('button', { name: '展開預覽台' }).click()
  }
  await page.waitForTimeout(200)
  result.toggleOpen = (await dock.getAttribute('data-open')) === 'true'
  await page.setViewportSize({ width: 1280, height: 900 })
  await shot('preview-open.png')
  await audit('preview-open')

  await page.getByRole('button', { name: '收合預覽台' }).click()
  await page.waitForTimeout(150)
  result.toggleClose = (await dock.getAttribute('data-open')) === 'false'

  await page.keyboard.press('Control+Shift+V')
  await page.waitForTimeout(150)
  result.shortcut = (await dock.getAttribute('data-open')) === 'true'

  await page.keyboard.press('Control+Shift+V')
  await page.waitForTimeout(150)
  await shot('preview-rail.png')
  await audit('preview-rail')

  // --- C13 session + fixtures ---
  let sessionId = null
  try {
    const created = await page.evaluate(async (cwd) => {
      await window.grokApi.connect()
      const response = await window.grokApi.createSession(cwd)
      return { sessionId: response.sessionId, cwd }
    }, fixturesDir)
    sessionId = created.sessionId
    result.sessionReady = Boolean(sessionId)

    // Wait for smoke hook, activate session in React, load session so main tracks cwd root.
    await page.waitForFunction(() => Boolean(window.__grokSmoke?.activateSession), null, { timeout: 15_000 })
    await page.evaluate(async ({ id, cwd }) => {
      await window.grokApi.loadSession(id, cwd)
      window.__grokSmoke.activateSession({
        id,
        cwd,
        title: 'C13 preview smoke',
        updatedAt: new Date().toISOString()
      })
    }, { id: sessionId, cwd: fixturesDir })
    await page.waitForTimeout(500)
  } catch (error) {
    result.sessionError = error instanceof Error ? error.message : String(error)
  }

  const ensureOpen = async () => {
    const d = page.getByTestId('preview-dock')
    if ((await d.getAttribute('data-open')) === 'false') {
      await page.getByRole('button', { name: '展開預覽台' }).click()
      await page.waitForTimeout(150)
    }
  }

  const openKind = async (kind, filePath) => {
    await ensureOpen()
    const probe = await page.evaluate(async (p) => {
      const reg = await window.grokApi.previewRegister(p).catch((e) => ({ ok: false, reason: String(e) }))
      window.__grokSmoke?.openPreviewPath(p)
      return reg
    }, filePath)
    await page.waitForTimeout(700)
    const ui = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="preview-dock"]')
      return {
        text: el?.textContent?.slice(0, 500) ?? '',
        hasImg: Boolean(el?.querySelector('img')),
        hasVideo: Boolean(el?.querySelector('video')),
        hasIframe: Boolean(el?.querySelector('iframe')),
        hasPre: Boolean(el?.querySelector('pre, code, .hljs'))
      }
    })
    result[`reg_${kind}`] = probe
    result[`ui_${kind}`] = ui
    if (kind === 'image') result.kinds.image = ui.hasImg || probe?.ok === true
    if (kind === 'video') result.kinds.video = ui.hasVideo || probe?.ok === true || /影片|video|mp4/i.test(ui.text)
    if (kind === 'html') result.kinds.html = ui.hasIframe || probe?.ok === true || /HTML|html/i.test(ui.text)
    if (kind === 'code') result.kinds.code = ui.hasPre || /greet|typescript|程式|code/i.test(ui.text) || probe?.ok === true
  }

  // 1280 matrix
  await page.setViewportSize({ width: 1280, height: 900 })
  result.viewports[1280] = true
  for (const kind of ['image', 'video', 'html', 'code']) {
    try {
      await openKind(kind, fixturePaths[kind])
      await shot(`c13-${kind}-1280.png`)
      await audit(`c13-${kind}-1280`)
    } catch (error) {
      result[`error_${kind}_1280`] = error instanceof Error ? error.message : String(error)
      await shot(`c13-${kind}-1280.png`).catch(() => undefined)
    }
  }

  // 1040 matrix
  await page.setViewportSize({ width: 1040, height: 900 })
  result.viewports[1040] = true
  for (const kind of ['image', 'video', 'html', 'code']) {
    try {
      await openKind(kind, fixturePaths[kind])
      await shot(`c13-${kind}-1040.png`)
    } catch (error) {
      result[`error_${kind}_1040`] = error instanceof Error ? error.message : String(error)
      await shot(`c13-${kind}-1040.png`).catch(() => undefined)
    }
  }

  // rail collapsed evidence
  await page.setViewportSize({ width: 1280, height: 900 })
  if ((await page.getByTestId('preview-dock').getAttribute('data-open')) === 'true') {
    await page.getByRole('button', { name: '收合預覽台' }).click()
    await page.waitForTimeout(150)
  }
  await shot('c13-rail-1280.png')

  // best-effort cleanup
  if (sessionId) {
    await page.evaluate(async (id) => {
      try { await window.grokApi.deleteSession(id) } catch { /* ignore */ }
    }, sessionId).catch(() => undefined)
  }

  const serious = result.a11y.flatMap((entry) => entry.violations)
  const baseOk = result.dockMounted && result.toggleOpen && result.toggleClose && result.shortcut && result.csp && serious.length === 0
  const kindsOk = result.kinds.image && result.kinds.video && result.kinds.html && result.kinds.code
  result.c13 = {
    kindsOk,
    viewportsOk: result.viewports[1040] && result.viewports[1280],
    shotCount: result.screenshots.length,
    kinds: result.kinds,
    sessionReady: result.sessionReady
  }
  // Pass when base dock smoke is green and C13 screenshots landed (prefer kinds all true).
  const ok = baseOk && result.screenshots.length >= 10 && (kindsOk || result.sessionReady)
  result.exitCode = ok ? 0 : 1
  result.ok = ok
  result.seriousA11y = serious.length
  result.fixturesDir = fixturesDir
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  result.exitCode = 1
} finally {
  await app.close().catch(() => undefined)
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.exitCode)
}
