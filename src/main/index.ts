import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import Store from 'electron-store'
import { GrokAcpClient } from './acp-client'
import { BillingCache } from './billing-cache'
import { AcpConnectionState, reportAsyncError } from './acp-connection-state'
import { parseGrokVersion } from './grok-cli'
import type { AgentPermissionMode } from '../shared/types'
import {
  createGrokInstallerEnvironment,
  installGrokCli,
  readConnectedCapabilities,
  reauthenticateGrok,
  runReauthenticationLifecycle,
  SingleLifecycleOperation,
  type ExecuteFile
} from './grok-lifecycle'
import { listLocalSessions, readSessionUsage } from './session-index'
import { createDefaultSettings, normalizeSettings } from '../shared/settings'
import { normalizeBilling } from '../shared/billing'
import {
  looksLikeImageBuffer,
  PASTE_IMAGE_DIR_NAME,
  PASTE_IMAGE_MAX_AGE_MS,
  PASTE_IMAGE_MAX_BYTES,
  preparePasteImagePayload,
  selectPasteFilesToDelete
} from '../shared/paste-image'
import type { AppSettings, CliStatus, PromptBlock } from '../shared/types'
import { assertRevealAllowed, ExportPathAllowlist } from '../shared/export-reveal'

const pasteImageDirectory = (): string => path.join(tmpdir(), PASTE_IMAGE_DIR_NAME)

/** Best-effort prune of aged paste files; never throws to callers. */
export async function cleanupPasteImageDirectory(
  directory = pasteImageDirectory(),
  nowMs = Date.now(),
  maxAgeMs = PASTE_IMAGE_MAX_AGE_MS
): Promise<number> {
  try {
    const names = await readdir(directory)
    const entries = await Promise.all(names.map(async (name) => {
      try {
        const info = await stat(path.join(directory, name))
        return { name, mtimeMs: info.mtimeMs }
      } catch {
        return null
      }
    }))
    const doomed = selectPasteFilesToDelete(entries.filter((item): item is { name: string; mtimeMs: number } => item !== null), nowMs, maxAgeMs)
    await Promise.all(doomed.map(async (name) => {
      try { await unlink(path.join(directory, name)) } catch { /* ignore single-file failures */ }
    }))
    return doomed.length
  } catch {
    return 0
  }
}

const execFileAsync = promisify(execFile)
const defaults = createDefaultSettings(homedir())
const settingsStore = new Store<AppSettings>({ name: 'settings', defaults, clearInvalidConfig: true })
let mainWindow: BrowserWindow | null = null
const acpConnection = new AcpConnectionState<GrokAcpClient>()
let connectedExecutable = ''
/** Always resets to `ask` when the process starts (not persisted). */
let agentPermissionMode: AgentPermissionMode = 'ask'
const billingCache = new BillingCache<unknown>()
const lifecycleOperation = new SingleLifecycleOperation()

const settings = (): AppSettings => normalizeSettings(settingsStore.store, homedir())
const grokHome = (): string => process.env.GROK_HOME?.trim() || path.join(homedir(), '.grok')
const send = (channel: string, payload: unknown): void => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

const SESSION_ID_PATTERN = /^[0-9a-f-]{8,64}$/i

const executeLifecycleFile: ExecuteFile = async (executable, args, options) => {
  const { stdout, stderr } = await execFileAsync(executable, args, { ...options, encoding: 'utf8' })
  return { stdout: String(stdout), stderr: String(stderr) }
}

function disconnectAcp(): void {
  const current = acpConnection.current
  const connecting = acpConnecting?.client
  acpConnection.begin()
  connectedExecutable = ''
  acpConnecting = null
  billingCache.clear()
  // Fire-and-forget during normal disconnect; quit path awaits stopAllAcpClients.
  void current?.stop()
  void connecting?.stop()
}

/** Await process-tree kill for every live / connecting client (quit path). */
async function stopAllAcpClients(): Promise<void> {
  const clients = [acpConnection.current, acpConnecting?.client].filter((client): client is GrokAcpClient => Boolean(client))
  acpConnection.begin()
  acpConnecting = null
  connectedExecutable = ''
  billingCache.clear()
  await Promise.all(clients.map(async (client) => {
    try { await client.stop() } catch { /* best-effort on quit */ }
  }))
}

async function cliStatus(): Promise<CliStatus> {
  const executable = settings().grokExecutable
  try {
    await access(executable)
    const { stdout } = await execFileAsync(executable, ['--version'], { windowsHide: true, timeout: 10_000 })
    const parsed = parseGrokVersion(stdout)
    return { executable, found: true, version: parsed?.version, revision: parsed?.revision, connected: acpConnection.current !== null && connectedExecutable === executable }
  } catch (error) {
    return { executable, found: false, connected: false, error: error instanceof Error ? error.message : String(error) }
  }
}

let acpConnecting: { executable: string; client: GrokAcpClient; promise: Promise<GrokAcpClient> } | null = null

async function connectAcp(): Promise<GrokAcpClient> {
  const executable = settings().grokExecutable
  if (acpConnection.current && connectedExecutable === executable) return acpConnection.current
  if (acpConnecting?.executable === executable) return acpConnecting.promise
  void acpConnecting?.client.stop()
  const previous = acpConnection.current
  const generation = acpConnection.begin()
  void previous?.stop()
  const client = new GrokAcpClient(executable, {
    onEvent: (event) => send('grok:event', event),
    onPermission: (request) => send('grok:permission-request', request),
    onStderr: (text) => send('grok:status-update', { stderr: text.trim().slice(0, 500) }),
    onExit: (message) => {
      if (!acpConnection.release(client)) return
      connectedExecutable = ''
      send('grok:status-update', { connected: false, message })
    }
  }, app.getVersion(), agentPermissionMode === 'always-approve')
  const promise = (async (): Promise<GrokAcpClient> => {
    await client.start()
    if (settings().grokExecutable !== executable || !acpConnection.commit(generation, client)) {
      void client.stop()
      throw new Error('Grok 執行檔設定已變更,請重新連線')
    }
    connectedExecutable = executable
    send('grok:status-update', { connected: true })
    return client
  })()
  acpConnecting = { executable, client, promise }
  try {
    return await promise
  } finally {
    if (acpConnecting?.promise === promise) acpConnecting = null
  }
}

const mimeFor = (file: string): string | undefined => ({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp'
} as Record<string, string>)[path.extname(file).toLowerCase()]

function registerIpc(): void {
  ipcMain.handle('grok:status', cliStatus)
  ipcMain.handle('grok:install', async () => lifecycleOperation.run('安裝 Grok CLI', async () => {
    send('grok:status-update', { connected: false, message: '正在從 x.ai 下載 Grok CLI…' })
    const installed = await installGrokCli(homedir(), {
      downloadText: async (url) => {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`下載 Grok CLI 失敗（HTTP ${response.status}）`)
        return response.text()
      },
      makeTempDirectory: () => mkdtemp(path.join(tmpdir(), 'grok-build-gui-')),
      writeTextFile: (file, value) => writeFile(file, value, 'utf8'),
      removeDirectory: (directory) => rm(directory, { recursive: true, force: true }),
      assertFileExists: (file) => access(file),
      executeFile: executeLifecycleFile,
      environment: createGrokInstallerEnvironment(process.env)
    })
    disconnectAcp()
    settingsStore.store = normalizeSettings({ ...settings(), grokExecutable: installed.executable }, homedir())
    const next = await cliStatus()
    send('grok:status-update', { ...next, message: `Grok CLI ${installed.version} 安裝完成` })
    return next
  }))
  ipcMain.handle('grok:account:reauthenticate', async () => lifecycleOperation.run('切換帳號', async () => {
    const executable = settings().grokExecutable
    await access(executable)
    send('grok:status-update', { connected: false, message: '瀏覽器即將開啟，請登入要使用的 Grok 帳號…' })
    const capabilities = await runReauthenticationLifecycle({
      disconnect: disconnectAcp,
      login: () => reauthenticateGrok(executable, executeLifecycleFile),
      connect: () => readConnectedCapabilities(connectAcp)
    })
    send('grok:status-update', { connected: true, message: 'Grok 帳號已重新登入' })
    return capabilities
  }))
  ipcMain.handle('grok:connect', async () => lifecycleOperation.runShared('Grok 連線', async () => (await connectAcp()).start()))
  ipcMain.handle('grok:sessions', () => listLocalSessions(grokHome()))
  ipcMain.handle('grok:usage', (_event, sessionId: string) => {
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) return null
    return readSessionUsage(grokHome(), sessionId)
  })
  ipcMain.handle('grok:billing', async () => {
    try {
      return await lifecycleOperation.runShared('Grok 額度讀取', async () =>
        normalizeBilling(await billingCache.get(async () => (await connectAcp()).getBilling())))
    } catch {
      return null
    }
  })
  ipcMain.handle('grok:session:delete', async (_event, sessionId: string) => {
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) throw new Error('Invalid session id')
    return lifecycleOperation.runShared('Grok 對話操作', async () => {
      await execFileAsync(settings().grokExecutable, ['sessions', 'delete', sessionId], { windowsHide: true, timeout: 30_000 })
      return true
    })
  })
  ipcMain.handle('settings:get', () => settings())
  ipcMain.handle('settings:save', (_event, value: AppSettings) => {
    const next = normalizeSettings(value, homedir())
    settingsStore.store = next
    if ((connectedExecutable && connectedExecutable !== next.grokExecutable) || (acpConnecting && acpConnecting.executable !== next.grokExecutable)) {
      disconnectAcp()
      send('grok:status-update', { connected: false, message: 'Grok 執行檔已更換，請重新連線' })
    }
    return next
  })
  ipcMain.handle('grok:session:create', async (_event, cwd: string) => lifecycleOperation.runShared('Grok 對話操作', async () => (await connectAcp()).createSession(cwd)))
  ipcMain.handle('grok:session:load', async (_event, sessionId: string, cwd: string) => lifecycleOperation.runShared('Grok 對話操作', async () => (await connectAcp()).loadSession(sessionId, cwd)))
  ipcMain.handle('grok:prompt', async (_event, sessionId: string, blocks: PromptBlock[]) => lifecycleOperation.runShared('Grok 工作', async () => (await connectAcp()).prompt(sessionId, blocks)))
  // Interject must share the lifecycle pool so it can run while a prompt is in-flight; it never cancels.
  ipcMain.handle('grok:interject', async (_event, sessionId: string, text: string, options?: { interjectionId?: string; content?: unknown[] }) =>
    lifecycleOperation.runShared('Grok 工作', async () => (await connectAcp()).interject(sessionId, text, options)))
  ipcMain.handle('grok:cancel', async (_event, sessionId: string) => lifecycleOperation.runShared('Grok 工作', async () => (await connectAcp()).cancel(sessionId)))
  ipcMain.handle('grok:mode', async (_event, sessionId: string, modeId: string) => lifecycleOperation.runShared('Grok 設定', async () => (await connectAcp()).setMode(sessionId, modeId)))
  ipcMain.handle('grok:model', async (_event, sessionId: string, modelId: string, reasoningEffort?: string) => lifecycleOperation.runShared('Grok 設定', async () => (await connectAcp()).setModel(sessionId, modelId, reasoningEffort)))
  ipcMain.handle('grok:config', async (_event, sessionId: string, configId: string, value: string | boolean) => lifecycleOperation.runShared('Grok 設定', async () => (await connectAcp()).setConfigOption(sessionId, configId, value)))
  ipcMain.handle('grok:permission', (_event, requestId: string, optionId: string) => lifecycleOperation.runShared('Grok 權限回覆', async () => acpConnection.current?.respondPermission(requestId, optionId)))
  ipcMain.handle('grok:permission-mode:get', () => agentPermissionMode)
  ipcMain.handle('grok:permission-mode:set', async (_event, mode: AgentPermissionMode) => {
    if (mode !== 'ask' && mode !== 'always-approve') throw new Error('Invalid permission mode')
    if (agentPermissionMode === mode) return agentPermissionMode
    agentPermissionMode = mode
    const wasConnected = acpConnection.current !== null || acpConnecting !== null
    disconnectAcp()
    send('grok:status-update', {
      connected: false,
      message: mode === 'always-approve'
        ? '已切換為一律核准（YOLO），需重新連線後生效'
        : '已切換為每次詢問，需重新連線後生效'
    })
    if (wasConnected) {
      try {
        await connectAcp()
        send('grok:status-update', {
          connected: true,
          message: mode === 'always-approve' ? 'YOLO 模式已啟用（高風險）' : '權限模式：每次詢問'
        })
      } catch (error) {
        send('grok:status-update', {
          connected: false,
          message: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return agentPermissionMode
  })
  ipcMain.handle('dialog:directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('dialog:files', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    return Promise.all(result.filePaths.map(async (file) => {
      const mimeType = mimeFor(file)
      let data: string | undefined
      if (mimeType) {
        const info = await stat(file)
        if (info.size <= PASTE_IMAGE_MAX_BYTES) data = (await readFile(file)).toString('base64')
      }
      return { path: file, name: path.basename(file), mimeType: data ? mimeType : undefined, data }
    }))
  })
  ipcMain.handle('paste:save-image', async (_event, payload: { mimeType?: unknown; data?: unknown }) => {
    if (!payload || typeof payload.mimeType !== 'string' || typeof payload.data !== 'string') {
      throw new Error('無效的貼圖資料')
    }
    // Pre-decode size gate lives in preparePasteImagePayload (no huge Buffer.from for oversize pastes).
    const prepared = preparePasteImagePayload(payload.mimeType, payload.data, PASTE_IMAGE_MAX_BYTES)
    let buffer: Buffer
    try {
      buffer = Buffer.from(prepared.rawBase64, 'base64')
    } catch {
      throw new Error('貼圖資料解碼失敗')
    }
    if (!buffer.length) throw new Error('貼圖資料為空')
    if (buffer.length > PASTE_IMAGE_MAX_BYTES) throw new Error('貼圖超過 20MB 上限')
    if (!looksLikeImageBuffer(buffer, prepared.ext)) throw new Error('貼圖內容與宣告格式不符')
    const directory = pasteImageDirectory()
    await mkdir(directory, { recursive: true })
    // Opportunistic cleanup of aged pastes (does not block on failure).
    void cleanupPasteImageDirectory(directory)
    const filePath = path.join(directory, `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${prepared.ext}`)
    await writeFile(filePath, buffer)
    return { path: filePath }
  })
  const exportAllowlist = new ExportPathAllowlist()
  ipcMain.handle('grok:export', async (_event, sessionId: string) => {
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) throw new Error('Invalid session id')
    const chosen = await dialog.showSaveDialog(mainWindow!, { defaultPath: `grok-${sessionId}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (chosen.canceled || !chosen.filePath) return null
    return lifecycleOperation.runShared('Grok 對話匯出', async () => {
      await execFileAsync(settings().grokExecutable, ['export', sessionId, chosen.filePath!], { windowsHide: true, timeout: 30_000 })
      // F1: only paths from successful export may later be revealed.
      return exportAllowlist.register(chosen.filePath!)
    })
  })
  ipcMain.handle('grok:export-reveal', async (_event, filePath: string) => {
    const allowed = assertRevealAllowed(exportAllowlist, filePath)
    shell.showItemInFolder(allowed)
    return true
  })
  ipcMain.handle('grok:tui', async (_event, cwd: string) => {
    const child = spawn('wt.exe', ['new-tab', '--startingDirectory', cwd, settings().grokExecutable, '--cwd', cwd], { detached: true, stdio: 'ignore', windowsHide: false, shell: false })
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve())
      child.once('error', (error) => reject(new Error(`無法開啟 Windows Terminal(wt.exe):${error.message}`)))
    })
    child.unref()
  })
  ipcMain.handle('shell:external', async (_event, url: string) => {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) links are allowed')
    await shell.openExternal(parsed.toString())
  })
  /** F-UX-1: OS notification when a turn completes and the window is not focused. */
  ipcMain.handle('app:notify', (_event, payload: { title?: unknown; body?: unknown }) => {
    if (!payload || typeof payload.title !== 'string' || !payload.title.trim()) return false
    if (!Notification.isSupported()) return false
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) return false
    const body = typeof payload.body === 'string' ? payload.body : ''
    try {
      new Notification({ title: payload.title.trim(), body, silent: false }).show()
      return true
    } catch {
      return false
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1040, minHeight: 680, backgroundColor: '#151613',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#151613', symbolColor: '#e8e4d9', height: 38 },
    webPreferences: { preload: path.join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) reportAsyncError(shell.openExternal(url), (message) => send('grok:status-update', { message: `無法開啟外部連結:${message}` }))
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })
  mainWindow.on('closed', () => { mainWindow = null })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

let isQuitting = false

app.whenReady().then(() => {
  registerIpc()
  void cleanupPasteImageDirectory()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

// Await process-tree kill before process exit so grok children are less likely to orphan.
app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  void stopAllAcpClients().finally(() => {
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
