/**
 * Live ACP capability probe for Grok CLI 1.0.3: rewind points, subagent
 * extension methods, and whether `loop` is advertised.
 *
 * Speaks JSON-RPC NDJSON over `grok agent --no-leader stdio` WITHOUT the
 * @agentclientprotocol/sdk closed-union parse. Does not send a user prompt.
 * Does not call destructive methods (rewind/execute, subagent/cancel).
 *
 * Usage: node work/acp_103_capability_probe.mjs
 * Writes:
 *   work/_probe/acp-103-capability-probe.md          (sanitized, committable)
 *   work/_probe/acp-103-capability-probe.local.json  (raw; gitignored)
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outDir = path.join(__dirname, '_probe')
const grokHome = path.join(os.homedir(), '.grok')
const executable = process.env.GROK_EXECUTABLE || path.join(grokHome, 'bin', 'grok.exe')
const cwd = await mkdtemp(path.join(os.tmpdir(), 'grok-acp103-probe-'))

const REQUEST_TIMEOUT_MS = 20_000
const INIT_TIMEOUT_MS = 30_000
const DRAIN_MS = 1_500

const rawLines = []
const incomingMethods = []
const commandUpdates = []
const stderrChunks = []
let nextId = 1
const pending = new Map()

function redactText(text, sessionId) {
  if (text == null) return text
  let out = String(text)
  const replacements = [
    [os.homedir(), '<home>'],
    [os.tmpdir(), '<tmp>'],
    [cwd, '<probe-cwd>'],
    [grokHome, '<grok-home>'],
    [executable, '<grok-exe>']
  ]
  for (const [from, to] of replacements) {
    if (!from) continue
    out = out.split(from).join(to)
    out = out.split(from.replaceAll('\\', '\\\\')).join(to)
    out = out.split(from.replaceAll('\\', '/')).join(to)
  }
  out = out.replace(/[A-Za-z]:\\Users\\[^\\/"'\s]+/g, '<home>')
  out = out.replace(/\/Users\/[^/"'\s]+/g, '<home>')
  if (sessionId) out = out.split(sessionId).join('<sessionId>')
  return out
}

function redactValue(value, sessionId) {
  if (value == null) return value
  if (typeof value === 'string') return redactText(value, sessionId)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => redactValue(item, sessionId))
  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = key === 'sessionId' || key === 'session_id' ? '<sessionId>' : redactValue(item, sessionId)
    }
    return out
  }
  return String(value)
}

const CORE_COMMANDS = new Set([
  'compact', 'always-approve', 'context', 'session-info', 'plugins', 'reload-plugins',
  'feedback', 'deep-research', 'workflow', 'goal', 'loop'
])

function summarizeResult(result) {
  if (result == null) return { type: String(result) }
  if (Array.isArray(result)) return { type: 'array', length: result.length, keys: [] }
  if (typeof result !== 'object') return { type: typeof result }
  const inner = result.result && typeof result.result === 'object' && !Array.isArray(result.result)
    ? result.result
    : result
  const wrapped = inner !== result
  const keys = Object.keys(inner)
  const summary = { type: wrapped ? 'ext-method-result' : 'object', keys }
  if (wrapped) summary.wrap = 'result'
  for (const key of ['points', 'rewind_points', 'rewindPoints', 'running', 'subagents', 'items', 'snapshot', 'availableCommands', 'commands']) {
    const value = inner[key]
    if (Array.isArray(value)) summary[`${key}Count`] = value.length
    else if (value === null) summary[key] = null
  }
  return summary
}

function formatCommandList(names) {
  if (!names.length) return '_(none)_'
  const core = names.filter((name) => CORE_COMMANDS.has(name))
  const other = names.length - core.length
  const listed = core.map((name) => `\`${name}\``).join(', ')
  if (other > 0) {
    return `${listed || '_(no core names)_'}, ${other} other commands (local skills/plugins; names redacted)`
  }
  return listed
}

function classifyError(error) {
  const code = error && typeof error === 'object' ? error.code : undefined
  const message = redactText(error?.message || (typeof error === 'string' ? error : JSON.stringify(error)) || '', null)
  const short = message.slice(0, 180)
  if (code === -32601 || /method not found/i.test(message)) {
    return { classification: 'method-not-found', error: { code, message: short } }
  }
  if (code === -32602 || /invalid params/i.test(message)) {
    return { classification: 'invalid-params', error: { code, message: short } }
  }
  return { classification: 'other', error: { code, message: short } }
}

function commandNames(source) {
  if (!Array.isArray(source)) return []
  return source.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (item && typeof item === 'object' && typeof item.name === 'string') return [item.name]
    return []
  })
}

function send(child, method, params, timeoutMs = REQUEST_TIMEOUT_MS) {
  const id = nextId++
  const msg = { jsonrpc: '2.0', id, method, params }
  const line = JSON.stringify(msg)
  rawLines.push({ dir: 'out', line })
  child.stdin.write(line + '\n')
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({ classification: 'other', error: { code: null, message: `timeout waiting for ${method} (${timeoutMs}ms)` } })
    }, timeoutMs)
    pending.set(id, {
      settle(response) {
        clearTimeout(timer)
        if (response.error) resolve(classifyError(response.error))
        else resolve({ classification: 'ok', result: response.result })
      }
    })
  })
}

function handleIncoming(line) {
  rawLines.push({ dir: 'in', line })
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (typeof msg.method === 'string') {
    incomingMethods.push(msg.method)
    const update = msg.params?.update ?? msg.params
    const updateType = update?.sessionUpdate ?? update?.session_update
    if (msg.method === 'session/update' && (updateType === 'available_commands_update' || updateType === 'availableCommandsUpdate')) {
      const names = commandNames(update?.availableCommands ?? update?.commands)
      commandUpdates.push({ source: 'session/update', names })
    }
    if (msg.method === '_x.ai/session_notification') {
      const inner = msg.params?.update ?? msg.params
      const innerType = inner?.sessionUpdate ?? inner?.session_update
      if (innerType === 'available_commands_update' || innerType === 'availableCommandsUpdate') {
        commandUpdates.push({ source: '_x.ai/session_notification', names: commandNames(inner?.availableCommands ?? inner?.commands) })
      }
    }
  }
  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
    const waiter = pending.get(msg.id)
    if (waiter) {
      pending.delete(msg.id)
      waiter.settle(msg)
    }
  }
}

function runGrok(args, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      resolve({ code: null, stdout, stderr, error: `timeout after ${timeoutMs}ms` })
    }, timeoutMs)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr, error: String(error) })
    })
  })
}

function hasLoop(names) {
  return names.some((name) => name === 'loop' || name === '/loop')
}

async function main() {
  await mkdir(outDir, { recursive: true })

  const version = await runGrok(['--version'])
  const versionLine = redactText((version.stdout || version.stderr || '').trim().split(/\r?\n/)[0] || 'unknown', null)

  const child = spawn(executable, ['agent', '--no-leader', 'stdio'], {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GROK_CLIENT_VERSION: 'acp-103-capability-probe' }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => { stderrChunks.push(chunk) })

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
  rl.on('line', handleIncoming)

  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })

  const probes = []
  let sessionId
  let initResult
  let created
  let fatal
  let initCommandNames = []
  let sessionCommandNames = []
  let agentCapabilities
  let agentVersion
  let deleteNote = 'not attempted'

  const probe = async (method, params) => {
    const response = await send(child, method, params)
    const row = {
      method,
      classification: response.classification,
      error: response.error ?? null,
      resultSummary: response.classification === 'ok' ? summarizeResult(response.result) : null
    }
    probes.push(row)
    return { ...response, row }
  }

  try {
    initResult = await send(child, 'initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
        plan: {}
      },
      clientInfo: { name: 'acp-103-capability-probe', version: '0.0.1' }
    }, INIT_TIMEOUT_MS)
    if (initResult.classification !== 'ok') {
      throw new Error(`initialize failed: ${JSON.stringify(initResult.error)}`)
    }

    const init = initResult.result ?? {}
    agentCapabilities = init.agentCapabilities && typeof init.agentCapabilities === 'object'
      ? Object.keys(init.agentCapabilities)
      : []
    const meta = init._meta && typeof init._meta === 'object' ? init._meta : {}
    agentVersion = typeof meta.agentVersion === 'string' ? meta.agentVersion : null
    initCommandNames = commandNames(meta.availableCommands)

    created = await send(child, 'session/new', { cwd, mcpServers: [] }, INIT_TIMEOUT_MS)
    if (created.classification !== 'ok') {
      throw new Error(`session/new failed: ${JSON.stringify(created.error)}`)
    }
    sessionId = created.result?.sessionId
    sessionCommandNames = commandNames(
      created.result?.availableCommands
        ?? created.result?._meta?.availableCommands
        ?? created.result?.commands
    )

    await new Promise((resolve) => setTimeout(resolve, DRAIN_MS))

    await probe('x.ai/rewind/points', { sessionId })
    await probe('_x.ai/rewind/points', { sessionId })
    await probe('x.ai/subagent/list_running', { sessionId })
    await probe('_x.ai/subagent/list_running', { sessionId })
    await probe('x.ai/subagent/get', { subagentId: 'probe-fake-id' })
    await probe('_x.ai/subagent/get', { subagentId: 'probe-fake-id' })

    await new Promise((resolve) => setTimeout(resolve, 400))

    const deleteAttempt = await send(child, 'session/delete', { sessionId })
    if (deleteAttempt.classification === 'ok') {
      deleteNote = 'deleted via ACP session/delete'
    } else if (deleteAttempt.classification === 'method-not-found') {
      const cliDelete = await runGrok(['sessions', 'delete', sessionId])
      const combined = `${cliDelete.stdout}\n${cliDelete.stderr}`.trim()
      deleteNote = cliDelete.code === 0 || /deleted session/i.test(combined)
        ? 'deleted via CLI `grok sessions delete` (no ACP session/delete)'
        : `CLI delete unclear (exit ${cliDelete.code}): ${redactText(combined.slice(0, 200), sessionId)}`
    } else {
      deleteNote = `ACP session/delete ${deleteAttempt.classification}: ${deleteAttempt.error?.message ?? 'unknown'}; left a note, session may remain`
    }
  } catch (error) {
    fatal = redactText(String(error), sessionId)
  } finally {
    try { child.stdin.end() } catch { /* ignore */ }
    try { child.kill() } catch { /* ignore */ }
    await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 2000))])
  }

  const updateCommandNames = [...new Set(commandUpdates.flatMap((entry) => entry.names))]
  const loop = {
    initialize: hasLoop(initCommandNames),
    sessionNew: hasLoop(sessionCommandNames),
    availableCommandsUpdate: hasLoop(updateCommandNames),
    advertised: hasLoop(initCommandNames) || hasLoop(sessionCommandNames) || hasLoop(updateCommandNames)
  }

  const uniqueIncoming = [...new Set(incomingMethods)]
  const report = {
    date: new Date().toISOString(),
    cliVersion: versionLine,
    agentVersion,
    protocol: 'JSON-RPC NDJSON over grok agent --no-leader stdio (no SDK closed union)',
    spawned: ['agent', '--no-leader', 'stdio'],
    initializeClassification: initResult?.classification ?? 'n/a',
    agentCapabilityKeys: agentCapabilities ?? [],
    commands: {
      initialize: initCommandNames,
      sessionNew: sessionCommandNames,
      availableCommandsUpdate: updateCommandNames
    },
    loop,
    probes: probes.map((row) => ({
      method: row.method,
      classification: row.classification,
      error: row.error ? { code: row.error.code, message: redactText(row.error.message, sessionId) } : null,
      resultSummary: row.resultSummary
    })),
    notProbed: [
      { method: 'x.ai/rewind/execute', reason: 'destructive; points-only probe' },
      { method: 'x.ai/subagent/cancel', reason: 'could affect other sessions' }
    ],
    incomingMethods: uniqueIncoming,
    sessionDelete: deleteNote,
    fatal: fatal ?? null
  }

  const tableLines = report.probes.map((row) => {
    const detail = row.classification === 'ok'
      ? (row.resultSummary ? `\`${JSON.stringify(row.resultSummary)}\`` : 'ok')
      : `\`${row.error?.code ?? 'n/a'}\` ${row.error?.message ?? ''}`
    return `| \`${row.method}\` | ${row.classification} | ${detail} |`
  })

  const md = `# ACP 1.0.3 capability probe

**Date:** ${report.date}  
**CLI:** \`${report.cliVersion}\`  
**agentVersion:** \`${report.agentVersion ?? 'n/a'}\`  
**Transport:** ${report.protocol}  
**CWD:** \`<probe-cwd>\` (os.tmpdir mkdtemp)  
**SessionId:** redacted  
**Error:** ${report.fatal ?? 'none'}

## Method

1. Spawn \`grok agent --no-leader stdio\` (same as \`buildAgentArgs()\`; no \`--always-approve\`)
2. Speak JSON-RPC NDJSON **without** \`@agentclientprotocol/sdk\` closed-union parse
3. \`initialize\` → \`session/new\` (empty temp cwd, no prompt)
4. Probe rewind **points** and subagent **list_running / get** (official \`x.ai/…\` and GUI underscore forms)
5. **Not called:** \`x.ai/rewind/execute\`, \`x.ai/subagent/cancel\`
6. Best-effort session cleanup via ACP \`session/delete\` or CLI \`grok sessions delete\`

## Probe table

| Method | Result | Detail |
| --- | --- | --- |
${tableLines.join('\n')}
| \`x.ai/rewind/execute\` | not probed | destructive |
| \`x.ai/subagent/cancel\` | not probed | could affect other sessions |

## Loop advertised?

| Source | \`loop\` present | Command names |
| --- | --- | --- |
| \`initialize._meta.availableCommands\` | ${loop.initialize ? 'yes' : 'no'} | ${initCommandNames.length ? formatCommandList(initCommandNames) : '_(none)_'} |
| \`session/new\` response | ${loop.sessionNew ? 'yes' : 'no'} | ${sessionCommandNames.length ? formatCommandList(sessionCommandNames) : '_(none in response)_'} |
| \`available_commands_update\` | ${loop.availableCommandsUpdate ? 'yes' : 'no'} | ${updateCommandNames.length ? formatCommandList(updateCommandNames) : '_(no update observed)_'} |

**Advertised on this live session:** ${loop.advertised ? 'yes' : 'no'}

Incoming notification methods observed: ${uniqueIncoming.length ? uniqueIncoming.map((name) => `\`${name}\``).join(', ') : '_(none)_'}

Initialize \`agentCapabilities\` keys: ${agentCapabilities?.length ? agentCapabilities.map((name) => `\`${name}\``).join(', ') : '_(none)_'}

## Session cleanup

${deleteNote}

## Honesty implications (evidence only)

- Rewind UI / execute was **not** implemented from this probe. Classification of \`*/rewind/points\` is the only rewind reachability signal.
- Subagent ACP console / cancel was **not** implemented. \`list_running\` / \`get\` classification is the only control-method signal; spawn/finish cards remain a separate notification path.
- \`loop\` is a slash command advertisement, not an ACP method. This probe did not invent or call a loop RPC.

## Artifacts

- Sanitized report: \`work/_probe/acp-103-capability-probe.md\`
- Raw dump (gitignored, may contain session ids / local paths): \`work/_probe/acp-103-capability-probe.local.json\`
`

  await writeFile(path.join(outDir, 'acp-103-capability-probe.md'), md, 'utf8')
  await writeFile(
    path.join(outDir, 'acp-103-capability-probe.local.json'),
    JSON.stringify({
      ...report,
      rawLineCount: rawLines.length,
      stderrTail: redactText(stderrChunks.join('').slice(-2000), sessionId),
      rawLines: rawLines.map((row) => ({ dir: row.dir, line: redactText(row.line, sessionId) }))
    }, null, 2),
    'utf8'
  )

  console.log(JSON.stringify({
    ok: !fatal,
    cliVersion: versionLine,
    agentVersion,
    loop,
    probes: report.probes.map((row) => ({ method: row.method, classification: row.classification, error: row.error })),
    sessionDelete: deleteNote,
    reportPath: path.relative(repoRoot, path.join(outDir, 'acp-103-capability-probe.md')).replaceAll('\\', '/'),
    rawPath: path.relative(repoRoot, path.join(outDir, 'acp-103-capability-probe.local.json')).replaceAll('\\', '/')
  }, null, 2))
  if (fatal) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
