import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import type {
  ContentBlock,
  LoadSessionResponse,
  NewSessionResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionConfigOption,
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
  options: PermissionOption[]
  resolve: (value: RequestPermissionResponse) => void
}

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

  constructor(private executable: string, private callbacks: AcpClientCallbacks) {}

  async start(): Promise<AgentCapabilities> {
    if (this.connection) return this.capabilities
    this.child = spawn(this.executable, buildAgentArgs(), { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk: string) => this.callbacks.onStderr(chunk))
    this.child.once('exit', (code, signal) => {
      this.rejectPermissions()
      this.connection = undefined
      this.context = undefined
      this.callbacks.onExit(`Grok ACP exited (${signal ?? code ?? 'unknown'})`)
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
    const initialized = await this.context.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, plan: {} },
      clientInfo: { name: 'Grok Build GUI', version: '0.2.0' }
    })
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
  }

  async createSession(cwd: string): Promise<NewSessionResponse & { models?: ModelState }> {
    const response = await this.requireContext().request(acp.methods.agent.session.new, { cwd, mcpServers: [] }) as NewSessionResponse & { models?: unknown }
    this.updateSessionFeatures(response)
    return { ...response, models: normalizeModelState(response.models) }
  }

  async loadSession(sessionId: string, cwd: string): Promise<LoadSessionResponse & { models?: ModelState }> {
    const response = await this.requireContext().request(acp.methods.agent.session.load, { sessionId, cwd, mcpServers: [] }) as LoadSessionResponse & { models?: unknown }
    this.updateSessionFeatures(response)
    return { ...response, models: normalizeModelState(response.models) }
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
      throw error
    }
  }

  async cancel(sessionId: string): Promise<void> {
    this.cancelPermissions()
    await this.requireContext().notify(acp.methods.agent.session.cancel, { sessionId })
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    await this.requireContext().request(acp.methods.agent.session.setMode, { sessionId, modeId })
  }

  async setModel(sessionId: string, modelId: string, reasoningEffort?: string): Promise<void> {
    await this.requireContext().request('session/set_model', { sessionId, modelId, ...(reasoningEffort ? { reasoningEffort } : {}) })
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
    this.permissions.delete(requestId)
    pending.resolve(selectPermissionOutcome(pending.options, optionId))
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
    return new Promise((resolve) => this.permissions.set(requestId, { options, resolve }))
  }

  private cancelPermissions(): void {
    for (const pending of this.permissions.values()) pending.resolve({ outcome: { outcome: 'cancelled' } })
    this.permissions.clear()
  }

  private rejectPermissions(): void {
    this.cancelPermissions()
  }

  private updateSessionFeatures(response: { modes?: SessionModeState | null; configOptions?: SessionConfigOption[] | null }): void {
    this.capabilities.modes = response.modes?.availableModes?.map((mode) => ({ id: mode.id, name: mode.name })) ?? []
  }
}
