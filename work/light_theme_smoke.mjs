// Light-theme ("Dawn Nebula") liveness smoke — the phase 4 shader uniforms
// (u_revealBase / u_starAlpha / u_starRed + alpha-over star blending) had never
// run on a real GPU. Flips the app to light at runtime and asserts the engine
// keeps producing frames, plus samples on-screen luminance so a white-out or a
// black flash fails the gate.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-gui-light-'))
const output = path.resolve('outputs', 'ui-smoke')
await mkdir(output, { recursive: true })

const executablePath = process.env.GROK_GUI_EXE?.trim()
const app = await electron.launch(executablePath
  ? { executablePath: path.resolve(executablePath), args: [`--user-data-dir=${profile}`] }
  : { args: ['.', `--user-data-dir=${profile}`] })

const result = { darkRenderer: 'none', lightRenderer: 'none', lightFramesAdvancing: false, luminance: null, glErrors: [], shots: [], ok: false }
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(60_000)
  page.on('console', (message) => {
    const text = message.text()
    if (/shader|webgl|GL_|program/i.test(text) && message.type() === 'error') result.glErrors.push(text)
  })
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.starfield-canvas').waitFor()
  await page.waitForTimeout(2_200)
  result.darkRenderer = (await page.locator('.starfield-canvas').getAttribute('data-renderer')) ?? 'none'

  // Flip to light through the real settings path (persisted store + re-render).
  await page.evaluate(async () => {
    const settings = await window.grokApi.getSettings()
    await window.grokApi.saveSettings({ ...settings, theme: 'light' })
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.app[data-theme="light"]').waitFor()
  await page.locator('.starfield-canvas').waitFor()
  await page.waitForTimeout(2_500)
  result.lightRenderer = (await page.locator('.starfield-canvas').getAttribute('data-renderer')) ?? 'none'

  const samples = []
  for (let index = 0; index < 3; index += 1) {
    await page.waitForTimeout(1_800)
    samples.push(await page.evaluate(() => globalThis.__grokStarfieldHealth?.frames ?? 0))
  }
  result.lightFramesAdvancing = samples.length >= 2 && samples.at(-1) > samples[0]
  result.frames = samples

  const shot = path.join(output, 'light-theme.png')
  const shotBuffer = await page.screenshot({ path: shot })
  result.shots.push(shot)

  // Mean luminance of a background-only strip, sampled from the *composited*
  // screenshot (a live WebGL canvas has no readable buffer after compositing).
  // Dawn Nebula must sit in warm-mist range: no white-out, no dark flash.
  const dataUri = `data:image/png;base64,${shotBuffer.toString('base64')}`
  result.luminance = await page.evaluate(async (uri) => {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = uri
    })
    const probe = document.createElement('canvas')
    probe.width = image.width
    probe.height = image.height
    const context = probe.getContext('2d')
    context.drawImage(image, 0, 0)
    // Right-hand background band, below the titlebar and above the footer:
    // avoids sidebar, hero text and buttons so we measure the starfield itself.
    const x = Math.floor(image.width * 0.78)
    const y = Math.floor(image.height * 0.12)
    const w = Math.floor(image.width * 0.18)
    const h = Math.floor(image.height * 0.3)
    const { data } = context.getImageData(x, y, w, h)
    let sum = 0
    let min = 255
    let max = 0
    for (let index = 0; index < data.length; index += 4) {
      const value = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
      sum += value
      if (value < min) min = value
      if (value > max) max = value
    }
    return { mean: sum / (data.length / 4), min, max, region: { x, y, w, h } }
  }, dataUri)

  const { mean, max } = result.luminance ?? {}
  const inDawnRange = typeof mean === 'number' && mean > 180 && mean < 245 && max < 253
  result.ok = result.lightRenderer !== 'none' && result.lightFramesAdvancing && inDawnRange && result.glErrors.length === 0
} finally {
  await app.close().catch(() => null)
  await writeFile(path.join(output, 'light-theme-result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.ok ? 0 : 1
}
