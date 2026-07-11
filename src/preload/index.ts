import { contextBridge, ipcRenderer } from 'electron'
import type { GrokBridgeApi } from '../shared/bridge'
import type { PermissionRequest, UiSessionEvent } from '../shared/types'

const api: GrokBridgeApi = {
  getStatus: () => ipcRenderer.invoke('grok:status'),
  connect: () => ipcRenderer.invoke('grok:connect'),
  listSessions: () => ipcRenderer.invoke('grok:sessions'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  createSession: (cwd) => ipcRenderer.invoke('grok:session:create', cwd),
  loadSession: (sessionId, cwd) => ipcRenderer.invoke('grok:session:load', sessionId, cwd),
  sendPrompt: (sessionId, blocks) => ipcRenderer.invoke('grok:prompt', sessionId, blocks),
  cancel: (sessionId) => ipcRenderer.invoke('grok:cancel', sessionId),
  setMode: (sessionId, modeId) => ipcRenderer.invoke('grok:mode', sessionId, modeId),
  setConfigOption: (sessionId, configId, value) => ipcRenderer.invoke('grok:config', sessionId, configId, value),
  respondPermission: (requestId, optionId) => ipcRenderer.invoke('grok:permission', requestId, optionId),
  chooseDirectory: () => ipcRenderer.invoke('dialog:directory'),
  chooseFiles: () => ipcRenderer.invoke('dialog:files'),
  exportSession: (sessionId) => ipcRenderer.invoke('grok:export', sessionId),
  openTui: (cwd) => ipcRenderer.invoke('grok:tui', cwd),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),
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
  onStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: { message?: string }): void => callback(value)
    ipcRenderer.on('grok:status-update', listener)
    return () => ipcRenderer.removeListener('grok:status-update', listener)
  }
}

contextBridge.exposeInMainWorld('grokApi', api)
