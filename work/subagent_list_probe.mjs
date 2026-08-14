/**
 * Live probe for `_x.ai/subagent/list_running` and `_x.ai/subagent/get`.
 *
 * The wave-3 capability probe proved both methods exist, but with zero running
 * children it only ever saw `{ subagents: [] }` / `{ snapshot: null }`. This one
 * actually spawns a subagent and polls while it runs, so the real entry shape is
 * recorded instead of guessed.
 *
 * Read-only: never calls `_x.ai/subagent/cancel`.
 *
 * Usage: node work/subagent_list_probe.mjs
 * Writes: work/_probe/subagent-list-probe.md + .local.json (gitignored)
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
const cwd = await mkdtemp(path.join(os.tmpdir(), 'grok-subagent-probe-'))
await mkdir(outDir, { recursive: true })

const LIST_RUNNING = '_x.ai/subagent/list_running'
const SUBAGENT_GET = '_x.ai/subagent/get'
const POLL_MS = 1_500
const PROMPT_TIMEOUT_MS = 300_000

const samples = []          // every non-empty list_running response
const snapshots = []        // _x.ai/subagent/get results
const inboundMethods = new Set()
const notificationKinds = new Set()
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
    return sessionId ? out.split(sessionId).join('<sessionId>') : out
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, sessionId))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, sessionId)]))
  }
  return value
}

const child = spawn(executable, ['agent', '--no-leader', 'stdio'], {
  shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, GROK_CLIENT_VERSION: 'subagent-list-probe' }
})
const stderrChunks = []
child.stderr.setEncoding('utf8')
child.stderr.on('data', (c) => stderrChunks.push(c))

const write = (msg) => child.stdin.write(JSON.stringify(msg) + '\n')
const request = (method, params, timeoutMs = 20_000) => {
  const id = nextId++
  write({ jsonrpc: '2.0', id, method, params })
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, timeout: true }) }, timeoutMs)
    pending.set(id, (res) => { clearTimeout(timer); resolve(res.error ? { ok: false, error: res.error } : { ok: true, result: res.result }) })
  })
}

const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try { msg = JSON.parse(line) } catch { return }
  if (typeof msg.method === 'string') {
    inboundMethods.add(msg.method)
    if (msg.id !== undefined) {
      // Approve anything so the subagent actually gets to run.
      const options = msg.params?.options ?? []
      const pick = options.find((o) => o.kind === 'allow_always') ?? options.find((o) => o.kind === 'allow_once') ?? options[0]
      if (pick) write({ jsonrpc: '2.0', id: msg.id, result: { outcome: { outcome: 'selected', optionId: pick.optionId } } })
      else write({ jsonrpc: '2.0', id: msg.id, result: { approved: true, abandoned: false } })
      return
    }
    const update = msg.params?.update ?? msg.params
    const kind = update?.sessionUpdate ?? update?.session_update
    if (typeof kind === 'string') notificationKinds.add(kind)
    return
  }
  if (msg.id !== undefined) {
    const waiter = pending.get(msg.id)
    if (waiter) { pending.delete(msg.id); waiter(msg) }
  }
})

/** Unwrap the `{ result: { … } }` envelope the x.ai ext methods use. */
const unwrap = (result) => (result && typeof result === 'object' && result.result && typeof result.result === 'object')
  ? result.result
  : result

const report = { startedAt: new Date().toISOString(), pollMs: POLL_MS }
let sessionId = null
try {
  const init = await request('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, plan: {} },
    clientInfo: { name: 'Grok Build GUI', version: 'subagent-list-probe' }
  }, 30_000)
  if (!init.ok) throw new Error('initialize failed')

  const created = await request('session/new', { cwd, mcpServers: [] }, 30_000)
  if (!created.ok) throw new Error('session/new failed')
  sessionId = created.result?.sessionId

  const baseline = await request(LIST_RUNNING, { sessionId })
  report.baseline = baseline.ok ? unwrap(baseline.result) : baseline

  let polling = true
  const poll = (async () => {
    while (polling) {
      const res = await request(LIST_RUNNING, { sessionId }, 10_000)
      if (res.ok) {
        const body = unwrap(res.result)
        const list = Array.isArray(body?.subagents) ? body.subagents : []
        if (list.length) {
          samples.push({ at: new Date().toISOString(), count: list.length, subagents: list })
          const id = list[0]?.id ?? list[0]?.subagent_id ?? list[0]?.subagentId ?? list[0]?.child_session_id
          if (id && snapshots.length < 2) {
            const got = await request(SUBAGENT_GET, { sessionId, subagent_id: id, subagentId: id }, 10_000)
            snapshots.push(got.ok ? unwrap(got.result) : got)
          }
        }
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  })()

  const promptText = [
    '請用 spawn_subagent 派出一個 general-purpose 子代理，',
    '任務是：寫一段約 150 字的繁體中文短文，說明「什麼是版本控制」，寫完直接回報內容。',
    '你自己在等待期間不要做別的事，也不要建立或修改任何檔案。'
  ].join('')
  const turn = await request('session/prompt', { sessionId, prompt: [{ type: 'text', text: promptText }] }, PROMPT_TIMEOUT_MS)
  polling = false
  await poll
  report.turn = turn.ok ? { stopReason: turn.result?.stopReason } : JSON.stringify(turn).slice(0, 300)
} catch (error) {
  report.error = String(error?.message ?? error)
} finally {
  try { child.stdin.end() } catch { /* ignore */ }
  try { child.kill() } catch { /* ignore */ }
  await rm(cwd, { recursive: true, force: true }).catch(() => {})
}

const first = samples[0]?.subagents?.[0]
report.sampleCount = samples.length
report.peakConcurrent = samples.reduce((max, s) => Math.max(max, s.count), 0)
report.entryKeys = first ? Object.keys(first) : []
report.entryTypes = first ? Object.fromEntries(Object.entries(first).map(([k, v]) => [k, Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v])) : {}
report.snapshotKeys = snapshots[0] && typeof snapshots[0] === 'object' ? Object.keys(snapshots[0]) : []
report.notificationKinds = [...notificationKinds]
report.stderr = redact(stderrChunks.join('').trim().slice(0, 500), sessionId)

await writeFile(path.join(outDir, 'subagent-list-probe.local.json'),
  JSON.stringify(redact({ ...report, samples, snapshots }, sessionId), null, 2), 'utf8')

const lines = [
  '# `_x.ai/subagent/list_running` shape probe',
  '',
  `**Date:** ${report.startedAt}  •  **poll:** every ${POLL_MS}ms`,
  '',
  `- baseline (before the turn): \`${JSON.stringify(report.baseline)}\``,
  `- non-empty samples: **${report.sampleCount}**, peak concurrent: **${report.peakConcurrent}**`,
  `- turn: ${typeof report.turn === 'object' ? `stopReason=${report.turn.stopReason}` : report.turn}`,
  '',
  '## Entry fields',
  '',
  report.entryKeys.length
    ? ['| field | type |', '| --- | --- |', ...Object.entries(report.entryTypes).map(([k, t]) => `| \`${k}\` | ${t} |`)].join('\n')
    : '_no running subagent was ever observed_',
  '',
  `**\`_x.ai/subagent/get\` snapshot keys:** ${report.snapshotKeys.length ? report.snapshotKeys.map((k) => `\`${k}\``).join(', ') : '_(none)_'}`,
  '',
  `**Session update kinds seen:** ${report.notificationKinds.map((k) => `\`${k}\``).join(', ') || '_(none)_'}`,
  '',
  report.error ? `**Probe error:** ${report.error}` : ''
]
await writeFile(path.join(outDir, 'subagent-list-probe.md'), lines.filter(Boolean).join('\n') + '\n', 'utf8')
console.log(lines.filter(Boolean).join('\n'))
if (first) console.log('\nfirst entry (redacted):\n' + JSON.stringify(redact(first, sessionId), null, 2).slice(0, 1500))
