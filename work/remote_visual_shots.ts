// Loopback visual QA for the mobile remote SPA — pair / running / drawer / picker states.
// Same fake-ACP pattern as remote_tunnel_e2e.ts but no tunnel; screenshots only.
// Run: npx --yes tsx work/remote_visual_shots.ts
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RemoteController } from '../src/main/remote-controller'
import { RemoteServer } from '../src/main/remote-server'
import type { AgentPermissionMode, SessionSummary, UiSessionEvent } from '../src/shared/types'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outDir = path.join(root, 'outputs', 'remote-visual')
await mkdir(outDir, { recursive: true })

const sessions: SessionSummary[] = [
  { id: 's1', cwd: 'C:\\demo\\alpha-project', title: 'Alpha 專案' },
  { id: 's2', cwd: 'C:\\demo\\beta-project', title: 'Beta 專案（長標題溢位檢查）' }
]
const ready = new Set<string>(['s1'])
let mode: AgentPermissionMode = 'ask'
const holder: { c: RemoteController | null } = { c: null }
const push = (event: UiSessionEvent): void => holder.c!.pushEvent(event)
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
          { id: 'low', value: 'low', label: 'Low' }
        ]
      },
      { modelId: 'grok-composer-2.5-fast', name: 'Grok Composer', reasoningEfforts: [] }
    ]
  },
  modes: [{ id: 'build', name: 'Build' }, { id: 'chat', name: 'Chat' }],
  currentModeId: 'build'
}

const controller = new RemoteController({
  getPermissionMode: () => mode,
  listSessions: () => sessions,
  isSessionReady: (id) => ready.has(id),
  prompt: async (sessionId, text) => {
    push({ id: 't-run', sessionId, kind: 'turn', status: 'running' })
    push({ id: 'm-u', sessionId, kind: 'message', role: 'user', text })
    await new Promise((resolve) => setTimeout(resolve, 6_000))
    push({ id: 'm-a', sessionId, kind: 'message', role: 'assistant', text: `模擬回覆（${text.length} 字收到）` })
    push({ id: 't-stop', sessionId, kind: 'turn', status: 'completed' })
  },
  cancel: async () => { /* noop */ },
  respondPermission: () => { /* noop */ },
  loadSession: async (id) => { ready.add(id) },
  createSession: async (cwd) => ({ sessionId: 's3', cwd }),
  setModel: async () => { /* noop */ },
  setMode: async () => { /* noop */ },
  setPermissionMode: async (next) => { mode = next; return next },
  getCapabilities: () => caps
})
holder.c = controller
controller.enable({ allowPhonePermissions: true })
let allowedHosts: string[] = []
const server = new RemoteServer({
  controller,
  getAllowedHosts: () => allowedHosts,
  webRoot: path.join(root, 'resources', 'remote-web'),
  cookieSecure: false
})
const { port } = await server.start()
allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`]
controller.setPublicBaseUrl(`http://127.0.0.1:${port}`)
const pairing = controller.regeneratePairing()!
controller.setBanner('pairable')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, bypassCSP: true })
const shots: string[] = []
const shot = async (name: string): Promise<void> => {
  const file = path.join(outDir, name)
  await page.screenshot({ path: file, fullPage: true })
  shots.push(file)
}
try {
  await page.goto(`http://127.0.0.1:${port}/#/pair?t=${pairing.pairingSecret}`)
  await page.waitForSelector('#pin-pad button')
  await shot('01-pair.png')
  for (const ch of pairing.pin) {
    await page.locator('#pin-pad button', { hasText: new RegExp(`^${ch}$`) }).first().click()
  }
  await page.locator('#pair-btn').click()
  await page.waitForSelector('#main-panel:not(.hidden)')
  await page.waitForFunction("document.getElementById('focus-status').textContent.includes('焦點就緒')", undefined, { timeout: 15_000 })
  controller.onPermissionRequest({
    requestId: 'permission:v1',
    sessionId: 's1',
    title: '執行 shell 指令（視覺）',
    options: [
      { optionId: 'a', name: '允許一次', kind: 'allow_once' },
      { optionId: 'r', name: '拒絕', kind: 'reject_once' }
    ]
  })
  await page.fill('#prompt', '視覺驗收：這輪跑六秒')
  await page.locator('#send-btn').click()
  await page.waitForFunction("document.getElementById('send-btn').disabled", undefined, { timeout: 8_000 })
  await page.waitForSelector('.perm-card', { timeout: 8_000 })
  await shot('02-running-permission.png')
  await page.waitForFunction("document.getElementById('tail').textContent.includes('模擬回覆')", undefined, { timeout: 20_000 })
  await shot('03-turn-complete.png')
  await page.locator('#sessions-toggle').click()
  await page.waitForSelector('#session-drawer:not(.hidden)')
  await shot('04-sessions-drawer.png')
  await page.locator('#sessions-toggle').click()
  await page.locator('#overflow-toggle').click()
  await page.waitForSelector('#overflow-panel:not(.hidden)')
  await shot('05-overflow-pickers.png')
} finally {
  await browser.close().catch(() => null)
  await server.stop().catch(() => null)
  controller.disable()
  await writeFile(path.join(outDir, 'shots.json'), JSON.stringify(shots, null, 2))
  process.stdout.write(shots.join('\n') + '\n')
}
