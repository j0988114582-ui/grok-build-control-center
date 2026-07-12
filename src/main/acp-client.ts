import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import type {
  ContentBlock,
  LoadSessionResponse,
  NewSessionResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionModeState,
  SetSessionConfigOptionResponse
} from '@agentclientprotocol/sdk'
import type { AgentCapabilities, ModelState, PermissionOption, PermissionRequest, PromptBlock, UiSessionEvent } from '../shared/types'
import { normalizeAcpUpdate } from '../shared/event-adapter'
import { buildAgentArgs } from './grok-cli'
import { selectPermissionOutcome } from './permissions'

type RawCapabilities = {
  loadSession?: boolean
  promptCapabilities?: Record<string, unknown>
  sessionCapabilities?: Record<string, unknown>
}

export function normalizeCapabilities(value: RawCapabilities | undefined): AgentCapabilities {
  return {
    loadSession: value?.loadSession === true,
    promptCapabilities: value?.promptCapabilities ?? {},
    sessionCapabilities: value?.sessionCapabilities ?? {},
    modes: [],
    commands: []
  }
}

export function normalizeModelState(value: unknown): ModelState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  if (typeof source.currentModelId !== 'string' || !Array.isArray(source.availableModels)) return undefined
  const availableModels = source.availableModels.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const model = item as Record<string, unknown>
    if (typeof model.modelId !== 'string' || typeof model.name !== 'string') return []
    const meta = model._meta && typeof model._meta === 'object' ? model._meta as Record<string, unknown> : {}
    const reasoningEfforts = Array.isArray(meta.reasoningEfforts) ? meta.reasoningEfforts.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const effort = entry as Record<string, unknown>
      if (typeof effort.id !== 'string' || typeof effort.value !== 'string' || typeof effort.label !== 'string') return []
      return [{ id: effort.id, value: effort.value, label: effort.label, ...(typeof effort.description === 'string' ? { description: effort.description } : {}), ...(typeof effort.default === 'boolean' ? { default: effort.default } : {}) }]
    }) : []
    return [{ modelId: model.modelId, name: model.name, ...(typeof model.description === 'string' ? { description: model.description } : {}), ...(typeof meta.reasoningEffort === 'string' ? { currentReasoningEffort: meta.reasoningEffort } : {}), ...(typeof meta.totalContextTokens === 'number' ? { totalContextTokens: meta.totalContextTokens } : {}), reasoningEfforts }]
  })
  return { currentModelId: source.currentModelId, availableModels }
}

type PendingPermission = {
  sessionId: string
  options: PermissionOption[]
  resolve: (value: RequestPermissionResponse) => void
}

const START_TIMEOUT_MS = 15_000

export type AcpClientCallbacks = {
  onEvent: (event: UiSessionEvent) => void
  onPermission: (request: PermissionRequest) => void
  onStderr: (text: string) => void
  onExit: (message: string) => void
}

export class GrokAcpClient {
  private child?: ChildProcessWithoutNullStreams
  private connection?: acp.ClientConnection
  private context?: acp.ClientContext
  private capabilities: AgentCapabilities = normalizeCapabilities(undefined)
  private permissions = new Map<string, PendingPermission>()
  private requestSequence = 0
  private lastStderr = ''
  private exitNotified = false
  private startupReject?: (error: Error) => void

  constructor(private executable: string, private callbacks: AcpClientCallbacks, private clientVersion = '0.0.0') {}

  async start(): Promise<AgentCapabilities> {
    if (this.connection) return this.capabilities
    this.exitNotified = false
    this.child = spawn(this.executable, buildAgentArgs(), { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk: string) => {
      const trimmed = chunk.trim()
      if (trimmed) this.lastStderr = trimmed.slice(0, 300)
      this.callbacks.onStderr(chunk)
    })
    this.child.on('error', (error) => {
      this.startupReject?.(new Error(`無法啟動 Grok CLI(${this.executable}):${error.message}`))
      this.teardown(`Grok ACP process error (${error.message})`)
    })
    this.child.once('exit', (code, signal) => {
      const detail = `${signal ?? code ?? 'unknown'}${this.lastStderr ? `: ${this.lastStderr}` : ''}`
      this.startupReject?.(new Error(`Grok CLI 啟動後立即結束(${detail})`))
      this.teardown(`Grok ACP exited (${detail})`)
    })

    const app = acp.client({ name: 'Grok Build GUI' })
      .onRequest(acp.methods.client.session.requestPermission, ({ params }) => this.queuePermission(params))
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        this.callbacks.onEvent(normalizeAcpUpdate(params.sessionId, params.update as unknown as Record<string, unknown>))
      })

    const stream = acp.ndJsonStream(
      Writable.toWeb(this.child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(this.child.stdout) as ReadableStream<Uint8Array>
    )
    this.connection = app.connect(stream)
    this.context = this.connection.agent
    const startupFailure = new Promise<never>((_resolve, reject) => { this.startupReject = reject })
    let startTimer: NodeJS.Timeout | undefined
    const startTimeout = new Promise<never>((_resolve, reject) => {
      startTimer = setTimeout(() => reject(new Error(`Grok ACP initialize 逾時(${START_TIMEOUT_MS / 1000} 秒),請確認執行檔路徑與版本`)), START_TIMEOUT_MS)
    })
    try {
      const initialized = await Promise.race([
        this.context.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, plan: {} },
          clientInfo: { name: 'Grok Build GUI', version: this.clientVersion }
        }),
        startupFailure,
        startTimeout
      ])
      this.capabilities = normalizeCapabilities(initialized.agentCapabilities as RawCapabilities | undefined)
      const meta = initialized._meta && typeof initialized._meta === 'object' ? initialized._meta as Record<string, unknown> : {}
      const modelState = normalizeModelState(meta.modelState)
      if (modelState) this.capabilities.modelState = modelState
      if (Array.isArray(meta.availableCommands)) {
        this.capabilities.commands = meta.availableCommands.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const command = item as Record<string, unknown>
          if (typeof command.name !== 'string') return []
          return [{ name: command.name, ...(typeof command.description === 'string' ? { description: command.description } : {}) }]
        })
      }
      return this.capabilities
    } catch (error) {
      this.stop()
      throw error
    } finally {
      clearTimeout(startTimer)
      this.startupReject = undefined
    }
  }

  async createSession(cwd: string): Promise<NewSessionResponse & { models?: ModelState }> {
    const response = await this.requireContext().request(acp.methods.agent.session.new, { cwd, mcpServers: [] }) as NewSessionResponse & { models?: unknown }
    this.updateSessionFeatures(response)
    return { ...response, models: this.updateModelState(normalizeModelState(response.models)) }
  }

  async loadSession(sessionId: string, cwd: string): Promise<LoadSessionResponse & { models?: ModelState }> {
    const response = await this.requireContext().request(acp.methods.agent.session.load, { sessionId, cwd, mcpServers: [] }) as LoadSessionResponse & { models?: unknown }
    this.updateSessionFeatures(response)
    return { ...response, models: this.updateModelState(normalizeModelState(response.models)) }
  }

  async prompt(sessionId: string, blocks: PromptBlock[]): Promise<void> {
    this.callbacks.onEvent({ id: `${sessionId}:turn:running`, sessionId, kind: 'turn', status: 'running' })
    const prompt = blocks.map((block): ContentBlock => block.type === 'text'
      ? { type: 'text', text: block.text }
      : { type: 'image', data: block.data, mimeType: block.mimeType })
    try {
      const response = await this.requireContext().request(acp.methods.agent.session.prompt, { sessionId, prompt })
      this.callbacks.onEvent({ id: `${sessionId}:turn:stop`, sessionId, kind: 'turn', status: response.stopReason === 'cancelled' ? 'cancelled' : 'completed', stopReason: response.stopReason })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.callbacks.onEvent({ id: `${sessionId}:turn:error`, sessionId, kind: 'error', message })
      this.callbacks.onEvent({ id: `${sessionId}:turn:stop`, sessionId, kind: 'turn', status: 'error', stopReason: message })
      throw error
    }
  }

  async cancel(sessionId: string): Promise<void> {
    this.cancelPermissions(sessionId)
    await this.requireContext().notify(acp.methods.agent.session.cancel, { sessionId })
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    await this.requireContext().request(acp.methods.agent.session.setMode, { sessionId, modeId })
    this.capabilities.currentModeId = modeId
  }

  async setModel(sessionId: string, modelId: string, reasoningEffort?: string): Promise<void> {
    await this.requireContext().request('session/set_model', { sessionId, modelId, ...(reasoningEffort ? { reasoningEffort } : {}) })
    const state = this.capabilities.modelState
    if (!state) return
    this.capabilities.modelState = {
      currentModelId: modelId,
      availableModels: reasoningEffort
        ? state.availableModels.map((model) => model.modelId === modelId ? { ...model, currentReasoningEffort: reasoningEffort } : model)
        : state.availableModels
    }
  }

  async setConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<SetSessionConfigOptionResponse> {
    const request = typeof value === 'boolean' ? { sessionId, configId, value, type: 'boolean' as const } : { sessionId, configId, value }
    return this.requireContext().request(acp.methods.agent.session.setConfigOption, request)
  }

  async getBilling(): Promise<unknown> {
    return this.requireContext().request('_x.ai/billing', {})
  }

  respondPermission(requestId: string, optionId: string): void {
    const pending = this.permissions.get(requestId)
    if (!pending) throw new Error('Permission request is no longer active')
    const outcome = selectPermissionOutcome(pending.options, optionId)
    this.permissions.delete(requestId)
    pending.resolve(outcome)
  }

  stop(): void {
    this.cancelPermissions()
    this.connection?.close()
    this.child?.kill()
    this.connection = undefined
    this.context = undefined
  }

  private requireContext(): acp.ClientContext {
    if (!this.context) throw new Error('Grok ACP is not connected')
    return this.context
  }

  private queuePermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const requestId = `permission:${++this.requestSequence}`
    const options = params.options.map((option) => ({ optionId: option.optionId, name: option.name, kind: option.kind }))
    this.callbacks.onPermission({ requestId, sessionId: params.sessionId, title: params.toolCall.title ?? 'Grok requests permission', options })
    return new Promise((resolve) => this.permissions.set(requestId, { sessionId: params.sessionId, options, resolve }))
  }

  private cancelPermissions(sessionId?: string): void {
    for (const [requestId, pending] of this.permissions) {
      if (sessionId !== undefined && pending.sessionId !== sessionId) continue
      pending.resolve({ outcome: { outcome: 'cancelled' } })
      this.permissions.delete(requestId)
    }
  }

  private teardown(message: string): void {
    this.cancelPermissions()
    this.connection = undefined
    this.context = undefined
    if (this.exitNotified) return
    this.exitNotified = true
    this.callbacks.onExit(message)
  }

  // Keeps cached capabilities aligned with the latest session so an idempotent
  // start() on a live connection never hands the renderer stale mode/model state.
  private updateSessionFeatures(response: { modes?: SessionModeState | null }): void {
    this.capabilities.modes = response.modes?.availableModes?.map((mode) => ({ id: mode.id, name: mode.name })) ?? []
    if (response.modes?.currentModeId) this.capabilities.currentModeId = response.modes.currentModeId
    else delete this.capabilities.currentModeId
  }

  private updateModelState(models: ModelState | undefined): ModelState | undefined {
    if (models) this.capabilities.modelState = models
    return models
  }
}
