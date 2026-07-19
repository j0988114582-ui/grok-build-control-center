/**
 * Wave B smoke: install path cloudflared → Quick Tunnel → mobile SPA pair + shell.
 * Temp-only process; no Electron, no real Grok prompts required for gate checks.
 */
import { chromium, type Page } from 'playwright'
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { RemoteController } from '../src/main/remote-controller'
import { RemoteServer } from '../src/main/remote-server'
import { RemoteTunnelManager } from '../src/main/remote-tunnel'
import type { AgentPermissionMode, SessionSummary } from '../src/shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const webRoot = path.join(root, 'resources', 'remote-web')
const output = path.join(root, 'outputs', 'wave-b-smoke')

const cloudflaredCandidates = [
  path.join(homedir(), '.cloudflared', 'cloudflared.exe'),
  path.join(homedir(), '.grok', 'bin', 'cloudflared.exe'),
  'cloudflared'
]

type Result = {
  cloudflaredPath: string | null
  cloudflaredVersion: string | null
  gate_b0_cloudflared: boolean
  gate_b1_tunnel_health: boolean
  gate_b2_mobile_pair_page: boolean
  gate_b3_pair_and_shell: boolean
  publicUrl: string | null
  pairUrl: string | null
  pin: string | null
  screenshots: string[]
  errors: string[]
  layoutNotes: string[]
  overall: boolean
}

const result: Result = {
  cloudflaredPath: null,
  cloudflaredVersion: null,
  gate_b0_cloudflared: false,
  gate_b1_tunnel_health: false,
  gate_b2_mobile_pair_page: false,
  gate_b3_pair_and_shell: false,
  publicUrl: null,
  pairUrl: null,
  pin: null,
  screenshots: [],
  errors: [],
  layoutNotes: [],
  overall: false
}

async function resolveCloudflared(): Promise<string | null> {
  for (const candidate of cloudflaredCandidates) {
    try {
      if (candidate === 'cloudflared') {
        // PATH probe via tunnel manager spawn later; skip access
        continue
      }
      await access(candidate)
      return candidate
    } catch {
      /* try next */
    }
  }
  return null
}

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(output, name)
  await page.screenshot({ path: file, fullPage: true })
  result.screenshots.push(file)
}

/** String body avoids tsx/esbuild injecting `__name` into page.evaluate callbacks. */
const COLLECT_LAYOUT_JS = `(() => {
  const notes = []
  const vw = window.innerWidth
  const vh = window.innerHeight
  const check = (el, label) => {
    if (!el) { notes.push('missing:' + label); return }
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) notes.push('zero-box:' + label)
    if (r.right > vw + 2) notes.push('overflow-x:' + label + ' right=' + r.right + '>' + vw)
    if (r.bottom > vh + 80) notes.push('below-fold:' + label + ' bottom=' + r.bottom + '>' + vh)
    if (el.tagName === 'BUTTON' && (r.width < 40 || r.height < 40)) {
      notes.push('small-touch:' + label + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
    }
  }
  check(document.getElementById('pair-panel'), 'pair-panel')
  check(document.getElementById('pin-pad'), 'pin-pad')
  check(document.getElementById('pair-btn'), 'pair-btn')
  check(document.getElementById('banner'), 'banner')
  const padButtons = document.querySelectorAll('#pin-pad button')
  if (padButtons.length < 10) notes.push('pin-pad-keys:' + padButtons.length)
  padButtons.forEach((btn, i) => check(btn, 'pin-key-' + i))
  document.querySelectorAll('header, footer, .topbar, .bottombar, [class*="fixed"]').forEach((el, i) => {
    const cs = getComputedStyle(el)
    if (cs.position === 'fixed' || cs.position === 'sticky') {
      const r = el.getBoundingClientRect()
      if (r.width > vw + 2) notes.push('fixed-overflow:' + i)
    }
  })
  return notes
})()`

function collectLayoutIssues(page: Page): Promise<string[]> {
  return page.evaluate(COLLECT_LAYOUT_JS) as Promise<string[]>
}

async function main(): Promise<void> {
  await mkdir(output, { recursive: true })

  const cf = await resolveCloudflared()
  result.cloudflaredPath = cf
  if (!cf) {
    result.errors.push('cloudflared not found in known paths')
    await finish(1)
    return
  }
  result.gate_b0_cloudflared = true

  const sessions: SessionSummary[] = [
    { id: 's1', cwd: 'C:\\demo\\repo', title: 'Wave B Demo Session' },
    { id: 's2', cwd: 'C:\\demo\\other', title: 'Second Session Long Title For Overflow Check' }
  ]
  const ready = new Set<string>(['s1'])
  let mode: AgentPermissionMode = 'ask'
  const prompt = async (): Promise<void> => { /* no-op */ }

  const controller = new RemoteController({
    getPermissionMode: () => mode,
    listSessions: () => sessions,
    isSessionReady: (id) => ready.has(id),
    prompt,
    cancel: async () => { /* */ },
    respondPermission: () => { /* */ },
    loadSession: async (id) => { ready.add(id) },
    createSession: async (cwd) => {
      const id = `s${sessions.length + 1}`
      sessions.push({ id, cwd, title: 'Created' })
      ready.add(id)
      return { sessionId: id, cwd }
    },
    setModel: async () => { /* */ },
    setMode: async () => { /* */ },
    interject: async () => { /* */ },
    setPermissionMode: async (next) => {
      mode = next
      return next
    }
  })

  controller.enable({ experimentalTunnel: true })
  let allowedHosts: string[] = []
  const server = new RemoteServer({
    controller,
    getAllowedHosts: () => allowedHosts,
    webRoot,
    cookieSecure: () => Boolean(controller.getPublicBaseUrl()?.startsWith('https://'))
  })
  const { port, healthNonce } = await server.start()
  allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`]

  const tunnel = new RemoteTunnelManager()
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

  try {
    const started = await tunnel.startQuickTunnel({ cloudflaredPath: cf, port, timeoutMs: 45_000 })
    if (!started.ok) {
      result.errors.push(`tunnel start failed: ${started.reason}`)
      await finish(1)
      return
    }
    result.publicUrl = started.url
    result.cloudflaredVersion = 'see --version offline'
    const publicHost = new URL(started.url).host
    allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, publicHost]

    // Loopback health first (origin must work before blaming tunnel)
    const localHealth = await fetch(
      `http://127.0.0.1:${port}/api/health?nonce=${encodeURIComponent(healthNonce)}`,
      { signal: AbortSignal.timeout(5_000) }
    )
    const localJson = await localHealth.json() as { ok?: boolean; nonce?: string }
    if (!localHealth.ok || localJson.nonce !== healthNonce) {
      result.errors.push(`loopback health fail status=${localHealth.status} body=${JSON.stringify(localJson)}`)
    }

    // Public health: Quick Tunnel often needs a few seconds after URL print
    const healthUrl = `${started.url}/api/health?nonce=${encodeURIComponent(healthNonce)}`
    let healthOk = false
    let lastErr = ''
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      try {
        const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(15_000) })
        const healthJson = await healthRes.json() as { ok?: boolean; nonce?: string }
        if (healthRes.ok && healthJson.nonce === healthNonce) {
          healthOk = true
          result.layoutNotes.push(`public-health-ok-attempt-${attempt}`)
          break
        }
        lastErr = `status=${healthRes.status} body=${JSON.stringify(healthJson)}`
      } catch (error) {
        lastErr = error instanceof Error ? error.message : String(error)
      }
      await new Promise((r) => setTimeout(r, 2_000))
    }
    if (!healthOk) {
      result.errors.push(`public health fail after retries: ${lastErr}`)
    } else {
      result.gate_b1_tunnel_health = true
      controller.setPublicBaseUrl(started.url)
      controller.setBanner('url_verified')
    }

    const pairing = controller.regeneratePairing()
    if (!pairing) {
      result.errors.push('regeneratePairing failed')
      await finish(1)
      return
    }
    controller.setBanner('pairable')
    result.pin = pairing.pin
    result.pairUrl = `${started.url}/#/pair?t=${pairing.pairingSecret}`

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true
    })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)

    // --- Gate B2: open pair page via public tunnel ---
    await page.goto(result.pairUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(800)
    await shot(page, 'b2-pair-page.png')

    const pairVisible = await page.locator('#pair-panel').isVisible().catch(() => false)
    const pinPadVisible = await page.locator('#pin-pad button').count()
    const secretStripped = !(await page.evaluate(() => location.hash.includes('t=')))
    result.layoutNotes.push(...await collectLayoutIssues(page))
    if (pairVisible && pinPadVisible >= 10 && secretStripped) {
      result.gate_b2_mobile_pair_page = true
    } else {
      result.errors.push(
        `pair page issue visible=${pairVisible} keys=${pinPadVisible} secretStripped=${secretStripped} hash=${await page.evaluate(() => location.hash)}`
      )
    }

    // --- Gate B3: enter PIN and reach main shell ---
    const pin = pairing.pin
    for (const ch of pin) {
      await page.locator('#pin-pad button', { hasText: new RegExp(`^${ch}$`) }).click()
    }
    await page.locator('#pair-btn').click()
    await page.waitForTimeout(1_200)
    await shot(page, 'b3-after-pair.png')

    const mainVisible = await page.locator('#main-panel').isVisible().catch(() => false)
    const pairHidden = await page.locator('#pair-panel').evaluate((el) => el.classList.contains('hidden')).catch(() => false)
    // snapshot poll
    await page.waitForTimeout(2_500)
    await shot(page, 'b3-main-shell.png')
    result.layoutNotes.push(...(await collectLayoutIssues(page)).map((n) => `main:${n}`))

    // Try open session drawer / list if present
    const sessionToggle = page.locator('#session-drawer, [data-action="sessions"], button:has-text("對話"), button:has-text("Session")').first()
    if (await sessionToggle.count()) {
      await sessionToggle.click().catch(() => null)
      await page.waitForTimeout(400)
      await shot(page, 'b3-sessions.png')
    }

    // Focus first session if list items exist
    const sessionItem = page.locator('#session-list button, .session-item, [data-session-id]').first()
    if (await sessionItem.count()) {
      await sessionItem.click().catch(() => null)
      await page.waitForTimeout(600)
      await shot(page, 'b3-focused.png')
    }

    // Send a short prompt if composer exists
    const promptBox = page.locator('#prompt, textarea').first()
    if (mainVisible && await promptBox.count()) {
      await promptBox.fill('wave-b smoke ping')
      const send = page.locator('#send-btn, button:has-text("送出")').first()
      if (await send.count()) {
        await send.click().catch(() => null)
        await page.waitForTimeout(800)
        await shot(page, 'b3-after-send.png')
      }
    }

    result.gate_b3_pair_and_shell = Boolean(mainVisible && (pairHidden || !pairVisible))
    if (!result.gate_b3_pair_and_shell) {
      result.errors.push(`shell fail mainVisible=${mainVisible} pairHidden=${pairHidden}`)
    }

    await context.close()
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
  } finally {
    if (browser) await browser.close().catch(() => null)
    await tunnel.stop().catch(() => null)
    await server.stop().catch(() => null)
    controller.disable()
  }

  result.overall =
    result.gate_b0_cloudflared
    && result.gate_b1_tunnel_health
    && result.gate_b2_mobile_pair_page
    && result.gate_b3_pair_and_shell

  await finish(result.overall ? 0 : 1)
}

async function finish(code: number): Promise<void> {
  result.overall = code === 0 && result.overall
  // recompute if partial
  if (code === 0) {
    result.overall =
      result.gate_b0_cloudflared
      && result.gate_b1_tunnel_health
      && result.gate_b2_mobile_pair_page
      && result.gate_b3_pair_and_shell
  } else {
    result.overall = false
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.overall ? 0 : 1
}

main().catch(async (error) => {
  result.errors.push(error instanceof Error ? error.message : String(error))
  await finish(1)
})
