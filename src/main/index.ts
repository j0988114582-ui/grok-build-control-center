import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import Store from 'electron-store'
import { GrokAcpClient } from './acp-client'
import { parseGrokVersion } from './grok-cli'
import { listLocalSessions } from './session-index'
import { createDefaultSettings, normalizeSettings } from '../shared/settings'
import type { AppSettings, CliStatus, PromptBlock } from '../shared/types'

const execFileAsync = promisify(execFile)
const defaults = createDefaultSettings(homedir())
const settingsStore = new Store<AppSettings>({ name: 'settings', defaults })
let mainWindow: BrowserWindow | null = null
let acpClient: GrokAcpClient | null = null
let connectedExecutable = ''

const settings = (): AppSettings => normalizeSettings(settingsStore.store, homedir())
const send = (channel: string, payload: unknown): void => { mainWindow?.webContents.send(channel, payload) }

async function cliStatus(): Promise<CliStatus> {
  const executable = settings().grokExecutable
  try {
    await access(executable)
    const { stdout } = await execFileAsync(executable, ['--version'], { windowsHide: true, timeout: 10_000 })
    const parsed = parseGrokVersion(stdout)
    return { executable, found: true, version: parsed?.version, revision: parsed?.revision, connected: acpClient !== null && connectedExecutable === executable }
  } catch (error) {
    return { executable, found: false, connected: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function connectAcp(): Promise<GrokAcpClient> {
  const executable = settings().grokExecutable
  if (acpClient && connectedExecutable === executable) return acpClient
  acpClient?.stop()
  const client = new GrokAcpClient(executable, {
    onEvent: (event) => send('grok:event', event),
    onPermission: (request) => send('grok:permission-request', request),
    onStderr: (text) => send('grok:status-update', { message: text.trim().slice(0, 500) }),
    onExit: (message) => { if (acpClient === client) acpClient = null; send('grok:status-update', { connected: false, message }) }
  })
  await client.start()
  acpClient = client
  connectedExecutable = executable
  send('grok:status-update', { connected: true })
  return client
}

const mimeFor = (file: string): string | undefined => ({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp'
} as Record<string, string>)[path.extname(file).toLowerCase()]

function registerIpc(): void {
  ipcMain.handle('grok:status', cliStatus)
  ipcMain.handle('grok:connect', async () => (await connectAcp()).start())
  ipcMain.handle('grok:sessions', () => listLocalSessions(path.join(homedir(), '.grok')))
  ipcMain.handle('settings:get', () => settings())
  ipcMain.handle('settings:save', (_event, value: AppSettings) => {
    const next = normalizeSettings(value, homedir())
    settingsStore.store = next
    if (connectedExecutable && connectedExecutable !== next.grokExecutable) { acpClient?.stop(); acpClient = null }
    return next
  })
  ipcMain.handle('grok:session:create', async (_event, cwd: string) => (await connectAcp()).createSession(cwd))
  ipcMain.handle('grok:session:load', async (_event, sessionId: string, cwd: string) => (await connectAcp()).loadSession(sessionId, cwd))
  ipcMain.handle('grok:prompt', async (_event, sessionId: string, blocks: PromptBlock[]) => (await connectAcp()).prompt(sessionId, blocks))
  ipcMain.handle('grok:cancel', async (_event, sessionId: string) => (await connectAcp()).cancel(sessionId))
  ipcMain.handle('grok:mode', async (_event, sessionId: string, modeId: string) => (await connectAcp()).setMode(sessionId, modeId))
  ipcMain.handle('grok:model', async (_event, sessionId: string, modelId: string, reasoningEffort?: string) => (await connectAcp()).setModel(sessionId, modelId, reasoningEffort))
  ipcMain.handle('grok:config', async (_event, sessionId: string, configId: string, value: string | boolean) => (await connectAcp()).setConfigOption(sessionId, configId, value))
  ipcMain.handle('grok:permission', (_event, requestId: string, optionId: string) => acpClient?.respondPermission(requestId, optionId))
  ipcMain.handle('dialog:directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('dialog:files', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    return Promise.all(result.filePaths.map(async (file) => {
      const mimeType = mimeFor(file)
      const data = mimeType ? (await readFile(file)).toString('base64') : undefined
      return { path: file, name: path.basename(file), mimeType, data }
    }))
  })
  ipcMain.handle('grok:export', async (_event, sessionId: string) => {
    const chosen = await dialog.showSaveDialog(mainWindow!, { defaultPath: `grok-${sessionId}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (chosen.canceled || !chosen.filePath) return null
    await execFileAsync(settings().grokExecutable, ['export', sessionId, chosen.filePath], { windowsHide: true, timeout: 30_000 })
    return chosen.filePath
  })
  ipcMain.handle('grok:tui', async (_event, cwd: string) => {
    const child = spawn('wt.exe', ['new-tab', '--startingDirectory', cwd, settings().grokExecutable, '--cwd', cwd], { detached: true, stdio: 'ignore', windowsHide: false, shell: false })
    child.unref()
  })
  ipcMain.handle('shell:external', async (_event, url: string) => {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) links are allowed')
    await shell.openExternal(parsed.toString())
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1040, minHeight: 680, backgroundColor: '#151613',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#151613', symbolColor: '#e8e4d9', height: 38 },
    webPreferences: { preload: path.join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => { registerIpc(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() }) })
app.on('window-all-closed', () => { acpClient?.stop(); if (process.platform !== 'darwin') app.quit() })
