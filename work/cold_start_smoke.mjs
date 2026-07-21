// Cold-start galaxy liveness smoke — the dark warp reveal must never freeze into a wash.
// Asserts: renderer active, frame counter keeps advancing (or 1 static frame under reduced motion).
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-gui-coldstart-'))
const output = path.resolve('outputs', 'ui-smoke')
await mkdir(output, { recursive: true })

const executablePath = process.env.GROK_GUI_EXE?.trim()
const app = await electron.launch(executablePath
  ? { executablePath: path.resolve(executablePath), args: [`--user-data-dir=${profile}`] }
  : { args: ['.', `--user-data-dir=${profile}`] })

const result = { renderer: 'none', static: false, samples: [], framesAdvancing: false, screenshots: [], ok: false }
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(60_000)
  await page.waitForLoadState('domcontentloaded')
  const canvas = page.locator('.starfield-canvas')
  await canvas.waitFor()
  const shot = async (name) => {
    const file = path.join(output, name)
    await page.screenshot({ path: file })
    result.screenshots.push(file)
  }
  await shot('coldstart-early.png') // during warp reveal — near-black is correct, wash is the bug
  for (let index = 0; index < 3; index += 1) {
    await page.waitForTimeout(2_200)
    const health = await page.evaluate(() => globalThis.__grokStarfieldHealth ?? null)
    result.samples.push(health)
  }
  await shot('coldstart-settled.png')
  result.renderer = (await canvas.getAttribute('data-renderer')) ?? 'none'
  result.static = (await canvas.getAttribute('data-static')) === 'true'
  const frames = result.samples.filter(Boolean).map((sample) => sample.frames)
  result.framesAdvancing = result.static
    ? frames.some((value) => value >= 1)
    : frames.length >= 2 && frames.at(-1) > frames[0]
  result.ok = result.renderer !== 'none' && result.framesAdvancing
} finally {
  await app.close().catch(() => null)
  await writeFile(path.join(output, 'coldstart-result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.ok ? 0 : 1
}
