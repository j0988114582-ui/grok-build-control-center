/**
 * Plan-mode ACP probe.
 *
 * Question: when the agent asks for plan approval, WHICH client method does it
 * call, and can a client shaped exactly like Grok Build GUI answer it?
 *
 * The GUI registers exactly one client-side request handler
 * (`session/request_permission`) and declares
 * `{ fs: {...}, terminal: false, plan: {} }`. This probe reproduces that surface
 * verbatim, drives the agent into plan mode, and records every inbound request.
 * Anything the GUI would not handle is answered -32601, exactly like the SDK.
 *
 * Sends ONE short prompt. Creates a session in a temp dir and deletes it after.
 *
 * Usage: node work/plan_mode_acp_probe.mjs
 *        PLAN_PROBE_ANSWER='{"approved":true,"abandoned":false}' node work/plan_mode_acp_probe.mjs
 * Writes: work/_probe/plan-mode-probe.run.md  +  .local.json (gitignored)
 * Findings are written up in work/_probe/gui-cli-disconnect-investigation.md
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '_probe')
const grokHome = path.join(os.homedir(), '.grok')
const executable = process.env.GROK_EXECUTABLE || path.join(grokHome, 'bin', 'grok.exe')
const cwd = await mkdtemp(path.join(os.tmpdir(), 'grok-planmode-probe-'))
await mkdir(outDir, { recursive: true })

const INIT_TIMEOUT_MS = 30_000
const PROMPT_TIMEOUT_MS = 240_000

// Verbatim copy of GrokAcpClient.start() -> initialize params.
const GUI_CLIENT_CAPABILITIES = { fs: { readTextFile: false, writeTextFile: false }, terminal: false, plan: {} }
// Verbatim copy of the only .onRequest() the GUI registers.
const GUI_HANDLED_REQUESTS = new Set(['session/request_permission'])

const inboundRequests = []
const planUpdates = []
const agentComplaints = []
const stderrChunks = []
const rawLines = []
let nextId = 1
const pending = new Map()

const redact = (value, sessionId) => {
  if (value == null) return value
  if (typeof value === 'string') {
    let out = value
    for (const [from, to] of [[os.homedir(), '<home>'], [os.tmpdir(), '<tmp>'], [cwd, '<probe-cwd>'], [executable, '<grok-exe>']]) {
      if (!from) continue
      out = out.split(from).join(to).split(from.replaceAll('\\', '\\\\')).join(to).split(from.replaceAll('\\', '/')).join(to)
    }
    out = out.replace(/[A-Za-z]:\\Users\\[^\\/"'\s]+/g, '<home>')
    if (sessionId) out = out.split(sessionId).join('<sessionId>')
    return out
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, sessionId))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) =>
      [k, k === 'sessionId' || k === 'session_id' ? '<sessionId>' : redact(v, sessionId)]))
  }
  return value
}

const child = spawn(executable, ['agent', '--no-leader', 'stdio'], {
  shell: false,
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, GROK_CLIENT_VERSION: 'plan-mode-probe' }
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => { stderrChunks.push(chunk) })

const write = (msg) => {
  const line = JSON.stringify(msg)
  rawLines.push({ dir: 'out', line })
  child.stdin.write(line + '\n')
}

const request = (method, params, timeoutMs) => {
  const id = nextId++
  write({ jsonrpc: '2.0', id, method, params })
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, timeout: true, method }) }, timeoutMs)
    pending.set(id, (response) => {
      clearTimeout(timer)
      resolve(response.error ? { ok: false, error: response.error } : { ok: true, result: response.result })
    })
  })
}

/**
 * PLAN_PROBE_ANSWER=<json> answers `_x.ai/exit_plan_mode` with that result instead
 * of -32601, so the response contract can be discovered from the agent's own
 * parse error. Unset = baseline GUI shape (method not found).
 */
const PLAN_ANSWER = process.env.PLAN_PROBE_ANSWER ? JSON.parse(process.env.PLAN_PROBE_ANSWER) : null
const EXIT_PLAN_MODE = '_x.ai/exit_plan_mode'

/** Answer like the GUI: only session/request_permission is implemented. */
function answerInbound(msg) {
  const handled = GUI_HANDLED_REQUESTS.has(msg.method)
  inboundRequests.push({ method: msg.method, handled, params: msg.params })
  if (msg.method === EXIT_PLAN_MODE && PLAN_ANSWER) {
    write({ jsonrpc: '2.0', id: msg.id, result: PLAN_ANSWER })
    return
  }
  if (!handled) {
    // Exactly what @agentclientprotocol/sdk does for an unregistered method.
    write({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `"Method not found": ${msg.method}` } })
    return
  }
  const options = msg.params?.options ?? []
  const pick = options.find((o) => o.kind === 'allow_always')
    ?? options.find((o) => o.kind === 'allow_once')
    ?? options[0]
  write({ jsonrpc: '2.0', id: msg.id, result: { outcome: { outcome: 'selected', optionId: pick?.optionId } } })
}

const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
rl.on('line', (line) => {
  if (!line.trim()) return
  rawLines.push({ dir: 'in', line })
  let msg
  try { msg = JSON.parse(line) } catch { return }
  if (typeof msg.method === 'string' && msg.id !== undefined) { answerInbound(msg); return }
  if (typeof msg.method === 'string') {
    const update = msg.params?.update ?? msg.params
    const kind = update?.sessionUpdate ?? update?.session_update
    if (typeof kind === 'string' && /plan|mode/i.test(kind)) planUpdates.push({ method: msg.method, kind, update })
    // Agent-side complaints about our response land in normal text/error updates.
    const blob = JSON.stringify(msg.params ?? {})
    if (/ExitPlanModeExt|Invalid exit_plan_mode|missing field|unknown variant|client disconnected/i.test(blob)) {
      agentComplaints.push(blob.slice(0, 600))
    }
    return
  }
  if (msg.id !== undefined) {
    const waiter = pending.get(msg.id)
    if (waiter) { pending.delete(msg.id); waiter(msg) }
  }
})

const report = { executable: '<grok-exe>', startedAt: new Date().toISOString() }
let sessionId = null
try {
  const init = await request('initialize', {
    protocolVersion: 1,
    clientCapabilities: GUI_CLIENT_CAPABILITIES,
    clientInfo: { name: 'Grok Build GUI', version: 'plan-mode-probe' }
  }, INIT_TIMEOUT_MS)
  report.initialize = init.ok ? 'ok' : JSON.stringify(init).slice(0, 300)
  if (!init.ok) throw new Error('initialize failed')

  const created = await request('session/new', { cwd, mcpServers: [] }, INIT_TIMEOUT_MS)
  if (!created.ok) throw new Error(`session/new failed: ${JSON.stringify(created).slice(0, 200)}`)
  sessionId = created.result?.sessionId
  report.sessionCreated = Boolean(sessionId)

  const promptText = [
    '請先呼叫 enter_plan_mode 進入規劃模式。',
    '然後用兩三句話規劃「在這個空資料夾建立一個 hello.txt」這件小事。',
    '接著呼叫 exit_plan_mode 請求我核准這個計畫。',
    '過程中不要真的建立或修改任何檔案，也不要執行終端指令。'
  ].join('')
  const turn = await request('session/prompt', {
    sessionId,
    prompt: [{ type: 'text', text: promptText }]
  }, PROMPT_TIMEOUT_MS)
  report.turn = turn.ok ? { stopReason: turn.result?.stopReason } : JSON.stringify(turn).slice(0, 400)
} catch (error) {
  report.error = String(error?.message ?? error)
} finally {
  report.inboundRequestMethods = inboundRequests.map((r) => ({ method: r.method, handledByGuiShape: r.handled }))
  report.unhandledByGuiShape = [...new Set(inboundRequests.filter((r) => !r.handled).map((r) => r.method))]
  report.planUpdateKinds = [...new Set(planUpdates.map((p) => p.kind))]
  report.planAnswerSent = PLAN_ANSWER
  report.agentComplaints = agentComplaints.slice(0, 5)
  report.stderr = redact(stderrChunks.join('').trim().slice(0, 800), sessionId)
  try { child.stdin.end() } catch { /* ignore */ }
  try { child.kill() } catch { /* ignore */ }
  await rm(cwd, { recursive: true, force: true }).catch(() => {})
}

const local = { ...report, inboundRequests: redact(inboundRequests, sessionId), planUpdates: redact(planUpdates, sessionId), rawLines: rawLines.length }
await writeFile(path.join(outDir, 'plan-mode-probe.local.json'), JSON.stringify(local, null, 2), 'utf8')

const lines = [
  '# Plan-mode ACP probe',
  '',
  `**Date:** ${report.startedAt}`,
  '**Client shape:** verbatim Grok Build GUI — `clientCapabilities: { fs, terminal: false, plan: {} }`,',
  'only `session/request_permission` registered; everything else answered `-32601`.',
  '',
  '## Result',
  '',
  `- initialize: ${report.initialize}`,
  `- session/prompt: ${typeof report.turn === 'object' ? `stopReason=${report.turn.stopReason}` : report.turn}`,
  `- plan-related session updates seen: ${report.planUpdateKinds.length ? report.planUpdateKinds.map((k) => `\`${k}\``).join(', ') : '_(none)_'}`,
  '',
  '## Inbound client requests during plan mode',
  '',
  '| Method | Handled by the GUI-shaped client? |',
  '| --- | --- |',
  ...(report.inboundRequestMethods.length
    ? report.inboundRequestMethods.map((r) => `| \`${r.method}\` | ${r.handledByGuiShape ? 'yes' : '**NO → -32601**'} |`)
    : ['| _(none)_ | — |']),
  '',
  `**Methods the GUI could not answer:** ${report.unhandledByGuiShape.length ? report.unhandledByGuiShape.map((m) => `\`${m}\``).join(', ') : '_none_'}`,
  '',
  report.error ? `**Probe error:** ${report.error}` : '',
  report.stderr ? `\n<details><summary>stderr</summary>\n\n\`\`\`\n${report.stderr}\n\`\`\`\n</details>` : ''
]
await writeFile(path.join(outDir, 'plan-mode-probe.run.md'), lines.filter(Boolean).join('\n') + '\n', 'utf8')
console.log(lines.filter(Boolean).join('\n'))
