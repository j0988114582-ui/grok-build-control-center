import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CliStatusUpdate, GrokBridgeApi } from '../shared/bridge'
import type { PermissionRequest, UiSessionEvent } from '../shared/types'

const api: GrokBridgeApi = {
  getStatus: () => ipcRenderer.invoke('grok:status'),
  installCli: () => ipcRenderer.invoke('grok:install'),
  reauthenticate: () => ipcRenderer.invoke('grok:account:reauthenticate'),
  connect: () => ipcRenderer.invoke('grok:connect'),
  listSessions: () => ipcRenderer.invoke('grok:sessions'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  createSession: (cwd) => ipcRenderer.invoke('grok:session:create', cwd),
  loadSession: (sessionId, cwd) => ipcRenderer.invoke('grok:session:load', sessionId, cwd),
  deleteSession: (sessionId) => ipcRenderer.invoke('grok:session:delete', sessionId),
  getUsage: (sessionId) => ipcRenderer.invoke('grok:usage', sessionId),
  getBilling: () => ipcRenderer.invoke('grok:billing'),
  sendPrompt: (sessionId, blocks) => ipcRenderer.invoke('grok:prompt', sessionId, blocks),
  interject: (sessionId, text, options) => ipcRenderer.invoke('grok:interject', sessionId, text, options),
  cancel: (sessionId) => ipcRenderer.invoke('grok:cancel', sessionId),
  setMode: (sessionId, modeId) => ipcRenderer.invoke('grok:mode', sessionId, modeId),
  setModel: (sessionId, modelId, reasoningEffort) => ipcRenderer.invoke('grok:model', sessionId, modelId, reasoningEffort),
  setConfigOption: (sessionId, configId, value) => ipcRenderer.invoke('grok:config', sessionId, configId, value),
  respondPermission: (requestId, optionId) => ipcRenderer.invoke('grok:permission', requestId, optionId),
  getPermissionMode: () => ipcRenderer.invoke('grok:permission-mode:get'),
  setPermissionMode: (mode) => ipcRenderer.invoke('grok:permission-mode:set', mode),
  chooseDirectory: () => ipcRenderer.invoke('dialog:directory'),
  chooseFiles: () => ipcRenderer.invoke('dialog:files'),
  savePasteImage: (payload) => ipcRenderer.invoke('paste:save-image', payload),
  getPathForFile: (file) => {
    try {
      const resolved = webUtils.getPathForFile(file)
      return resolved && resolved.trim() ? resolved : null
    } catch {
      return null
    }
  },
  statLocalPath: (filePath) => ipcRenderer.invoke('fs:stat-local', filePath),
  exportSession: (sessionId) => ipcRenderer.invoke('grok:export', sessionId),
  revealExport: (filePath) => ipcRenderer.invoke('grok:export-reveal', filePath),
  openTui: (cwd) => ipcRenderer.invoke('grok:tui', cwd),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),
  notify: (payload) => ipcRenderer.invoke('app:notify', payload),
  previewStat: (filePath) => ipcRenderer.invoke('preview:stat', filePath),
  previewRegister: (filePath) => ipcRenderer.invoke('preview:register', filePath),
  previewReadText: (filePath) => ipcRenderer.invoke('preview:read-text', filePath),
  previewChooseFile: () => ipcRenderer.invoke('preview:choose-file'),
  revealPath: (filePath) => ipcRenderer.invoke('shell:reveal-path', filePath),
  openPath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),
  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: UiSessionEvent): void => callback(value)
    ipcRenderer.on('grok:event', listener)
    return () => ipcRenderer.removeListener('grok:event', listener)
  },
  onPermission: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: PermissionRequest): void => callback(value)
    ipcRenderer.on('grok:permission-request', listener)
    return () => ipcRenderer.removeListener('grok:permission-request', listener)
  },
  onPermissionResolved: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: { requestId: string }): void => callback(value)
    ipcRenderer.on('grok:permission-resolved', listener)
    return () => ipcRenderer.removeListener('grok:permission-resolved', listener)
  },
  onStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: CliStatusUpdate): void => callback(value)
    ipcRenderer.on('grok:status-update', listener)
    return () => ipcRenderer.removeListener('grok:status-update', listener)
  },
  remoteGetState: () => ipcRenderer.invoke('remote:get-state'),
  remoteEnable: (options) => ipcRenderer.invoke('remote:enable', options),
  remoteDisable: () => ipcRenderer.invoke('remote:disable'),
  remoteRegeneratePairing: () => ipcRenderer.invoke('remote:regenerate-pairing'),
  remoteSetFocus: (sessionId) => ipcRenderer.invoke('remote:set-focus', sessionId),
  remoteQueue: (text) => ipcRenderer.invoke('remote:queue', text),
  remoteQueueClear: () => ipcRenderer.invoke('remote:queue-clear'),
  onRemoteState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: import('../shared/bridge').RemoteDesktopState): void => callback(value)
    ipcRenderer.on('remote:state', listener)
    return () => ipcRenderer.removeListener('remote:state', listener)
  },
  onRemoteFocusChanged: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: import('../shared/bridge').RemoteFocusChangedPayload
    ): void => callback(value)
    ipcRenderer.on('remote:focus-changed', listener)
    return () => ipcRenderer.removeListener('remote:focus-changed', listener)
  }
}

contextBridge.exposeInMainWorld('grokApi', api)
