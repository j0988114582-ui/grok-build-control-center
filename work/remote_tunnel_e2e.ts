/**
 * Remote v0.9.1 full E2E: real cloudflared Quick Tunnel + Playwright「模擬手機」
 * driving the actual SPA through the public URL. No Electron, no real Grok CLI —
 * ACP deps are an in-process fake that emulates the acp-client event contract
 * (turn:running at prompt call, resolve at turn end).
 *
 * Run: npx --yes tsx work/remote_tunnel_e2e.ts
 * Output: outputs/remote-e2e/result.json + screenshots
 */
import { chromium, type Page } from 'playwright'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RemoteController } from '../src/main/remote-controller'
import { RemoteServer } from '../src/main/remote-server'
import { RemoteTunnelManager } from '../src/main/remote-tunnel'
import type { AgentPermissionMode, SessionSummary, UiSessionEvent } from '../src/shared/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const webRoot = path.join(root, 'resources', 'remote-web')
const outDir = path.join(root, 'outputs', 'remote-e2e')

const SIM_TURN_MS = 8_000

type Check = { name: string; ok: boolean; detail?: string }
const checks: Check[] = []
const shots: string[] = []
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, ...(detail ? { detail } : {}) })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function shot(page: Page, name: string): Promise<void> {
  const file = path.join(outDir, name)
  await page.screenshot({ path: file, fullPage: true })
  shots.push(file)
}

/** #overflow-toggle is a toggle — clicking while open would close it. */
async function ensureOverflowOpen(page: Page): Promise<void> {
  const hidden = await page.evaluate("document.getElementById('overflow-panel').classList.contains('hidden')") as boolean
  if (hidden) {
    await page.locator('#overflow-toggle').click()
    await page.waitForSelector('#overflow-panel:not(.hidden)')
  }
}

async function resolveCloudflared(): Promise<string | null> {
  const candidates = [
    path.join(homedir(), '.cloudflared', 'cloudflared.exe'),
    path.join(homedir(), '.grok', 'bin', 'cloudflared.exe')
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch { /* next */ }
  }
  return 'cloudflared' // PATH fallback; spawn will tell
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true })

  // ── Fake ACP world (emulates acp-client callbacks + capability cache sync) ──
  const sessions: SessionSummary[] = [
    { id: 's1', cwd: 'C:\\demo\\alpha-project', title: 'Alpha 專案' },
    { id: 's2', cwd: 'C:\\demo\\beta-project', title: 'Beta 專案（長標題溢位檢查用～～～～～～）' }
  ]
  const ready = new Set<string>(['s1'])
  let mode: AgentPermissionMode = 'ask'
  const caps = {
    modelState: {
      currentModelId: 'grok-4.5',
      availableModels: [
        {
          modelId: 'grok-4.5',
          name: 'Grok 4.5',
          currentReasoningEffort: 'high',
          reasoningEfforts: [
            { id: 'high', value: 'high', label: 'High' },
            { id: 'medium', value: 'medium', label: 'Medium' },
            { id: 'low', value: 'low', label: 'Low' }
          ]
        },
        { modelId: 'grok-composer-2.5-fast', name: 'Grok Composer', reasoningEfforts: [] }
      ]
    },
    modes: [{ id: 'build', name: 'Build' }, { id: 'chat', name: 'Chat' }],
    currentModeId: 'build'
  }
  const recorded = {
    setModel: [] as Array<{ modelId: string; effort?: string }>,
    setMode: [] as string[],
    permissionResponses: [] as Array<{ requestId: string; optionId: string }>
  }
  const holder: { c: RemoteController | null } = { c: null }
  const push = (event: UiSessionEvent): void => holder.c!.pushEvent(event)
  let turnSeq = 0

  const controller = new RemoteController({
    getPermissionMode: () => mode,
    listSessions: () => sessions,
    isSessionReady: (id) => ready.has(id),
    prompt: async (sessionId, text) => {
      const turn = ++turnSeq
      push({ id: `${sessionId}:turn:${turn}:running`, sessionId, kind: 'turn', status: 'running' })
      push({ id: `${sessionId}:u:${turn}`, sessionId, kind: 'message', role: 'user', text })
      await new Promise((resolve) => setTimeout(resolve, SIM_TURN_MS))
      push({ id: `${sessionId}:a:${turn}`, sessionId, kind: 'message', role: 'assistant', text: `模擬回覆（${text.length} 字收到）` })
      push({ id: `${sessionId}:turn:${turn}:stop`, sessionId, kind: 'turn', status: 'completed' })
    },
    cancel: async () => { /* no-op */ },
    respondPermission: (requestId, optionId) => {
      recorded.permissionResponses.push({ requestId, optionId })
    },
    loadSession: async (id) => { ready.add(id) },
    createSession: async (cwd) => {
      const id = `s${sessions.length + 1}`
      sessions.push({ id, cwd, title: '新對話' })
      ready.add(id)
      return { sessionId: id, cwd }
    },
    setModel: async (_sessionId, modelId, effort) => {
      recorded.setModel.push({ modelId, ...(effort ? { effort } : {}) })
      caps.modelState.currentModelId = modelId
    },
    setMode: async (_sessionId, modeId) => {
      recorded.setMode.push(modeId)
      caps.currentModeId = modeId
    },
    setPermissionMode: async (next) => {
      mode = next
      await holder.c!.restoreFocusAfterReconnect()
      return next
    },
    getCapabilities: () => caps
  })
  holder.c = controller

  controller.enable({ allowPhonePermissions: true, experimentalTunnel: true })
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
    const cf = await resolveCloudflared()
    check('cloudflared-found', cf !== null, cf ?? undefined)

    const started = await tunnel.startQuickTunnel({ cloudflaredPath: cf!, port, timeoutMs: 45_000 })
    if (!started.ok) {
      check('tunnel-started', false, started.reason)
      return
    }
    check('tunnel-started', true, started.url)
    const publicHost = new URL(started.url).host
    allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, publicHost]

    // Route proof via nonce health (same contract as main/index.ts)
    const healthUrl = `${started.url}/api/health?nonce=${encodeURIComponent(healthNonce)}`
    let healthOk = false
    let healthDetail = ''
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      try {
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(15_000) })
        const json = await res.json() as { nonce?: string }
        if (res.ok && json.nonce === healthNonce) {
          healthOk = true
          healthDetail = `attempt ${attempt}`
          break
        }
        healthDetail = `HTTP ${res.status}`
      } catch (error) {
        healthDetail = error instanceof Error ? error.message : String(error)
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
    check('public-health-nonce', healthOk, healthDetail)
    if (!healthOk) return
    controller.setPublicBaseUrl(started.url)
    controller.setBanner('url_verified')

    const status = await fetch(`${started.url}/api/status`, { signal: AbortSignal.timeout(15_000) })
    check('api-status-200', status.status === 200, `HTTP ${status.status}`)
    const unauth = await fetch(`${started.url}/api/snapshot`, { signal: AbortSignal.timeout(15_000) })
    check('api-snapshot-401-unauth', unauth.status === 401, `HTTP ${unauth.status}`)

    const pairing = controller.regeneratePairing()
    if (!pairing) {
      check('pairing-generated', false)
      return
    }
    controller.setBanner('pairable')
    const pairUrl = `${started.url}/#/pair?t=${pairing.pairingSecret}`

    // ── Simulated phone ──
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true,
      // The SPA CSP (script-src 'self') blocks waitForFunction string eval; CSP itself
      // is asserted by tests/remote-server.test.ts — the harness tests behavior, not CSP.
      bypassCSP: true
    })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)
    page.on('dialog', (dialog) => { void dialog.accept() })

    await page.goto(pairUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForSelector('#pin-pad button')
    const secretStripped = await page.evaluate("!location.hash.includes('t=')") as boolean
    const padKeys = await page.locator('#pin-pad button').count()
    await shot(page, '01-pair.png')
    check('pair-page-loaded', padKeys >= 12 && secretStripped, `keys=${padKeys} secretStripped=${secretStripped}`)

    for (const ch of pairing.pin) {
      await page.locator('#pin-pad button', { hasText: new RegExp(`^${ch}$`) }).first().click()
    }
    await page.locator('#pair-btn').click()
    await page.waitForSelector('#main-panel:not(.hidden)')
    check('paired-main-shell', true)

    await page.waitForFunction("document.getElementById('focus-status').textContent.includes('焦點就緒')", undefined, { timeout: 15_000 })
    check('auto-focus-ready', true)
    await shot(page, '02-main-autofocus.png')

    // Sessions drawer render
    await page.locator('#sessions-toggle').click()
    await page.waitForSelector('#session-drawer:not(.hidden)')
    const sessionButtons = await page.locator('#session-list button').count()
    check('session-list-rendered', sessionButtons === 2, `items=${sessionButtons}`)
    await shot(page, '03-sessions.png')
    await page.locator('#sessions-toggle').click()

    // Prompt #1: accepted-then-run semantics over the tunnel
    await page.fill('#prompt', '通道實測：這一輪要跑八秒')
    const t0 = Date.now()
    await page.locator('#send-btn').click()
    await page.waitForFunction("document.getElementById('notices').textContent.includes('已送出')", undefined, { timeout: 10_000 })
    const acceptedMs = Date.now() - t0
    check('prompt-accepted-fast', acceptedMs < 6_000, `${acceptedMs}ms (turn=${SIM_TURN_MS}ms)`)

    await page.waitForFunction("document.getElementById('send-btn').disabled && document.getElementById('send-btn').textContent.includes('執行中')", undefined, { timeout: 8_000 })
    check('send-disabled-while-running', true)
    await shot(page, '04-running.png')

    await page.waitForFunction("document.getElementById('tail').textContent.includes('模擬回覆')", undefined, { timeout: 25_000 })
    check('tail-shows-reply', true)
    await page.waitForFunction("!document.getElementById('send-btn').disabled", undefined, { timeout: 10_000 })
    check('send-reenabled-after-turn', true)
    await shot(page, '05-turn-complete.png')

    // Prompt #2: 12,000-char CJK body through the tunnel (BODY_LIMIT regression, live)
    await page.evaluate(`document.getElementById('prompt').value = '測'.repeat(12000)`)
    await page.locator('#send-btn').click()
    await page.waitForFunction("document.getElementById('notices').textContent.includes('已送出')", undefined, { timeout: 10_000 })
    const cjkError = await page.locator('#main-error').textContent()
    check('cjk-12k-accepted', !(cjkError || '').trim(), (cjkError || 'no error').slice(0, 80))
    await page.waitForFunction("document.getElementById('tail').textContent.includes('12000 字收到')", undefined, { timeout: 25_000 })
    check('cjk-12k-turn-completed', true)
    await page.waitForFunction("!document.getElementById('send-btn').disabled", undefined, { timeout: 10_000 })

    // Permission card round trip
    controller.onPermissionRequest({
      requestId: 'permission:e2e-1',
      sessionId: 's1',
      title: '執行 shell 指令（E2E 測試）',
      options: [
        { optionId: 'allow-once', name: '允許一次', kind: 'allow_once' },
        { optionId: 'reject-once', name: '拒絕', kind: 'reject_once' }
      ]
    })
    await page.waitForSelector('.perm-card', { timeout: 10_000 })
    await shot(page, '06-permission.png')
    await page.locator('.perm-card button', { hasText: '允許一次' }).click()
    await page.waitForFunction("!document.querySelector('.perm-card')", undefined, { timeout: 10_000 })
    const respondedOk = recorded.permissionResponses.some((r) => r.requestId === 'permission:e2e-1' && r.optionId === 'allow-once')
    check('permission-roundtrip', respondedOk, JSON.stringify(recorded.permissionResponses))

    // Model / mode pickers from capability snapshot
    await ensureOverflowOpen(page)
    await page.waitForFunction("!document.getElementById('model-select-wrap').classList.contains('hidden')", undefined, { timeout: 10_000 })
    const currentModel = await page.locator('#model-select').inputValue()
    check('model-picker-visible', currentModel === 'grok-4.5', `selected=${currentModel}`)
    await shot(page, '07-pickers.png')
    await page.selectOption('#model-select', 'grok-composer-2.5-fast')
    await page.locator('#set-model-btn').click()
    await page.waitForFunction("document.getElementById('notices').textContent.includes('已切換模型')", undefined, { timeout: 10_000 })
    check('model-apply', recorded.setModel.some((m) => m.modelId === 'grok-composer-2.5-fast'), JSON.stringify(recorded.setModel))

    await page.selectOption('#mode-select', 'chat')
    await page.locator('#set-mode-btn').click()
    await page.waitForFunction("document.getElementById('notices').textContent.includes('已切換工作模式')", undefined, { timeout: 10_000 })
    check('mode-apply', recorded.setMode.includes('chat'), JSON.stringify(recorded.setMode))

    // YOLO guard: refused while running, allowed when idle
    await page.fill('#prompt', 'YOLO 防護測試回合')
    await page.locator('#send-btn').click()
    await page.waitForFunction("document.getElementById('notices').textContent.includes('已送出')", undefined, { timeout: 10_000 })
    await ensureOverflowOpen(page)
    await page.locator('#yolo-on-btn').click() // step 1: reveal PIN
    await page.fill('#yolo-pin', pairing.pin)
    await page.locator('#yolo-on-btn').click() // step 2: submit while turn is running
    await page.waitForFunction("document.getElementById('main-error').textContent.includes('有回合執行中')", undefined, { timeout: 10_000 })
    check('yolo-blocked-while-running', true)
    await shot(page, '08-yolo-blocked.png')

    await page.waitForFunction("!document.getElementById('send-btn').disabled", undefined, { timeout: 25_000 })
    await page.locator('#yolo-on-btn').click() // PIN field already filled
    await page.waitForFunction("document.getElementById('yolo-badge').textContent === 'YOLO' && !document.getElementById('yolo-badge').classList.contains('hidden')", undefined, { timeout: 10_000 })
    check('yolo-enable-after-idle', mode === 'always-approve', `mode=${mode}`)
    await shot(page, '09-yolo-on.png')

    // Logout: double confirm; desktop banner must flip to expired
    await page.locator('#logout-btn').click()
    await page.waitForSelector('#pair-panel:not(.hidden)', { timeout: 15_000 })
    const bannerText = await page.locator('#banner').textContent()
    check('logout-back-to-pair', (bannerText || '').includes('已切斷'), bannerText ?? '')
    check('desktop-banner-expired', controller.getDesktopPairingView().banner === 'expired', controller.getDesktopPairingView().banner)
    await shot(page, '10-logout.png')

    await context.close()
  } catch (error) {
    check('unhandled-error', false, error instanceof Error ? `${error.message}` : String(error))
  } finally {
    if (browser) await browser.close().catch(() => null)
    await tunnel.stop().catch(() => null)
    await server.stop().catch(() => null)
    controller.disable()
  }
}

main()
  .catch((error) => {
    check('fatal', false, error instanceof Error ? error.message : String(error))
  })
  .finally(async () => {
    const overall = checks.length > 0 && checks.every((c) => c.ok)
    const result = { overall, checks, screenshots: shots, finishedAt: new Date().toISOString() }
    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
    console.log(`\nOVERALL: ${overall ? 'PASS' : 'FAIL'} (${checks.filter((c) => c.ok).length}/${checks.length})`)
    process.exitCode = overall ? 0 : 1
  })
