// Wave A desktop hard gates: starfield cold start + pin flex rail (no title overlay).
// Temporary profile; no Grok install / no prompts.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profile = await mkdtemp(path.join(tmpdir(), 'grok-gui-wave-a-'))
const output = path.resolve('outputs', 'wave-a-smoke')
await mkdir(output, { recursive: true })

const result = {
  gate1_starfield: false,
  gate2_pin_rail: false,
  renderer: 'none',
  canvasSize: null,
  pinLayout: null,
  screenshots: [],
  errors: []
}

const executablePath = process.env.GROK_GUI_EXE?.trim()
const app = await electron.launch(executablePath
  ? { executablePath: path.resolve(executablePath), args: [`--user-data-dir=${profile}`] }
  : { args: ['.', `--user-data-dir=${profile}`] })

try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(90_000)
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('GROK BUILD', { exact: true }).waitFor()

  // --- Gate 1: cold start starfield (no theme toggle) ---
  await page.waitForTimeout(2_200)
  const starfield = page.getByTestId('starfield-canvas')
  const hasCanvas = await starfield.count()
  if (!hasCanvas) {
    result.errors.push('starfield canvas missing (theme/galaxy may be off or light theme)')
  } else {
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="starfield-canvas"]')
      if (!el) return false
      const r = el.getAttribute('data-renderer')
      return r === 'webgl' || r === 'canvas2d'
    }, null, { timeout: 8_000 }).catch(() => null)

    result.renderer = (await starfield.getAttribute('data-renderer')) ?? 'none'
    result.canvasSize = await starfield.evaluate((el) => ({
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      bufferWidth: el.width,
      bufferHeight: el.height
    }))
    const coldPath = path.join(output, 'gate1-cold-starfield.png')
    await page.screenshot({ path: coldPath, fullPage: true })
    result.screenshots.push(coldPath)
    const canvasShot = path.join(output, 'gate1-canvas.png')
    await starfield.screenshot({ path: canvasShot }).catch(() => null)
    if (await starfield.count()) result.screenshots.push(canvasShot)

    const sized =
      result.canvasSize
      && result.canvasSize.clientWidth >= 200
      && result.canvasSize.clientHeight >= 200
      && result.canvasSize.bufferWidth >= 200
      && result.canvasSize.bufferHeight >= 200
    result.gate1_starfield = (result.renderer === 'webgl' || result.renderer === 'canvas2d') && sized
    if (!result.gate1_starfield) {
      result.errors.push(`gate1 fail renderer=${result.renderer} size=${JSON.stringify(result.canvasSize)}`)
    }
  }

  // --- Gate 2: pin flex rail (seed settings with pin + long title via evaluate if possible) ---
  // Prefer live DOM: pin first visible session, measure geometry.
  const sessionRow = page.locator('.session-row').first()
  const hasSession = await sessionRow.count() > 0
  if (!hasSession) {
    // Empty profile: inject a synthetic row via evaluate is hard; mark layout CSS contract via static check.
    const cssOk = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'session-row'
      probe.innerHTML = `
        <button class="session-open"><span class="session-dot"></span>
          <div class="session-meta"><strong>Very Long Title That Should Ellipsis And Not Be Covered By Pin Icon Overlay Bug</strong>
          <small>C:\\\\Users\\\\demo\\\\long\\\\path</small><time>now</time></div></button>
        <div class="session-actions" data-testid="session-actions">
          <button class="session-pin pinned" aria-label="取消釘選 demo">P</button>
          <button class="session-rename">R</button>
          <button class="session-delete">D</button>
        </div>`
      probe.style.width = '280px'
      document.body.appendChild(probe)
      const title = probe.querySelector('strong')
      const pin = probe.querySelector('.session-pin')
      const actions = probe.querySelector('.session-actions')
      const tr = title.getBoundingClientRect()
      const pr = pin.getBoundingClientRect()
      const ar = actions.getBoundingClientRect()
      const openStyle = getComputedStyle(probe.querySelector('.session-open'))
      const pinStyle = getComputedStyle(pin)
      const actionsStyle = getComputedStyle(actions)
      const overlapX = Math.max(0, Math.min(tr.right, pr.right) - Math.max(tr.left, pr.left))
      const overlapY = Math.max(0, Math.min(tr.bottom, pr.bottom) - Math.max(tr.top, pr.top))
      const out = {
        positionPin: pinStyle.position,
        displayActions: actionsStyle.display,
        openPaddingRight: openStyle.paddingRight,
        titleRight: tr.right,
        pinLeft: pr.left,
        actionsLeft: ar.left,
        overlapArea: overlapX * overlapY,
        pinAfterTitle: pr.left >= tr.right - 1
      }
      probe.remove()
      return out
    })
    result.pinLayout = { mode: 'synthetic', ...cssOk }
    result.gate2_pin_rail =
      cssOk.positionPin === 'static'
      && cssOk.displayActions === 'flex'
      && cssOk.overlapArea < 4
      && cssOk.pinAfterTitle
    const synthPath = path.join(output, 'gate2-synthetic-note.txt')
    await writeFile(synthPath, JSON.stringify(cssOk, null, 2), 'utf8')
    result.screenshots.push(synthPath)
    if (!result.gate2_pin_rail) result.errors.push(`gate2 synthetic fail ${JSON.stringify(cssOk)}`)
  } else {
    const pinBtn = sessionRow.locator('.session-pin').first()
    if (await pinBtn.count()) {
      // Ensure pinned so opacity is 1
      const label = await pinBtn.getAttribute('aria-label')
      if (label && label.includes('釘選') && !label.includes('取消')) {
        await pinBtn.click()
      }
    }
    await page.waitForTimeout(200)
    const pinPath = path.join(output, 'gate2-session-row.png')
    await sessionRow.screenshot({ path: pinPath })
    result.screenshots.push(pinPath)

    const geom = await sessionRow.evaluate((row) => {
      const title = row.querySelector('strong')
      const pin = row.querySelector('.session-pin')
      const actions = row.querySelector('.session-actions')
      if (!title || !pin || !actions) return { error: 'missing nodes' }
      const tr = title.getBoundingClientRect()
      const pr = pin.getBoundingClientRect()
      const pinStyle = getComputedStyle(pin)
      const actionsStyle = getComputedStyle(actions)
      const overlapX = Math.max(0, Math.min(tr.right, pr.right) - Math.max(tr.left, pr.left))
      const overlapY = Math.max(0, Math.min(tr.bottom, pr.bottom) - Math.max(tr.top, pr.top))
      return {
        positionPin: pinStyle.position,
        displayActions: actionsStyle.display,
        titleRight: tr.right,
        pinLeft: pr.left,
        overlapArea: overlapX * overlapY,
        pinAfterTitle: pr.left >= tr.right - 2
      }
    })
    result.pinLayout = { mode: 'live', ...geom }
    result.gate2_pin_rail =
      !geom.error
      && geom.positionPin === 'static'
      && geom.displayActions === 'flex'
      && geom.overlapArea < 4
      && geom.pinAfterTitle
    if (!result.gate2_pin_rail) result.errors.push(`gate2 live fail ${JSON.stringify(geom)}`)

    // Resize window and re-check pin still after title
    const win = page
    await win.setViewportSize({ width: 1100, height: 800 }).catch(() => null)
    await page.waitForTimeout(300)
    const geom2 = await sessionRow.evaluate((row) => {
      const title = row.querySelector('strong')
      const pin = row.querySelector('.session-pin')
      if (!title || !pin) return null
      const tr = title.getBoundingClientRect()
      const pr = pin.getBoundingClientRect()
      const overlapX = Math.max(0, Math.min(tr.right, pr.right) - Math.max(tr.left, pr.left))
      const overlapY = Math.max(0, Math.min(tr.bottom, pr.bottom) - Math.max(tr.top, pr.top))
      return { pinAfterTitle: pr.left >= tr.right - 2, overlapArea: overlapX * overlapY }
    })
    if (geom2 && (geom2.overlapArea >= 4 || !geom2.pinAfterTitle)) {
      result.gate2_pin_rail = false
      result.errors.push(`gate2 after resize fail ${JSON.stringify(geom2)}`)
    }
    const resizePath = path.join(output, 'gate2-after-resize.png')
    await page.screenshot({ path: resizePath })
    result.screenshots.push(resizePath)
  }

  result.overall = result.gate1_starfield && result.gate2_pin_rail
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  if (!result.overall) process.exitCode = 1
} catch (error) {
  result.errors.push(error instanceof Error ? error.message : String(error))
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.error(error)
  process.exitCode = 1
} finally {
  await app.close()
}
