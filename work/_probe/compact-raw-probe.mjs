/**
 * Live ACP raw probe for /compact (and compact-related session/update).
 * Speaks JSON-RPC NDJSON over grok agent stdio WITHOUT @agentclientprotocol/sdk
 * closed-union parse, so custom sessionUpdate types are preserved on the wire.
 *
 * Usage: node work/_probe/compact-raw-probe.mjs
 * Writes: work/_probe/compact-raw-probe.md, work/_probe/compact-raw-lines.jsonl
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = __dirname
const grokHome = path.join(os.homedir(), '.grok')
const executable = process.env.GROK_EXECUTABLE || path.join(grokHome, 'bin', 'grok.exe')
const cwd = await (async () => {
  const { mkdtemp } = await import('node:fs/promises')
  return mkdtemp(path.join(os.tmpdir(), 'grok-compact-probe-'))
})()

const rawLines = []
const interesting = []
const sessionUpdates = []
const stderrChunks = []
let nextId = 1
const pending = new Map()

function note(kind, payload) {
  interesting.push({ t: new Date().toISOString(), kind, payload })
}

function lineInteresting(text) {
  return /compact|session\/update|sessionUpdate|token|usage|context/i.test(text)
}

async function findSessionDir(sessionId) {
  const sessionsRoot = path.join(grokHome, 'sessions')
  let groups
  try {
    groups = await readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    return null
  }
  for (const group of groups) {
    if (!group.isDirectory()) continue
    const candidate = path.join(sessionsRoot, group.name, sessionId)
    try {
      if ((await stat(candidate)).isDirectory()) return candidate
    } catch {
      /* continue */
    }
  }
  return null
}

async function readSignals(sessionId) {
  const dir = await findSessionDir(sessionId)
  if (!dir) return { path: null, data: null }
  const sigPath = path.join(dir, 'signals.json')
  try {
    return { path: sigPath, data: JSON.parse(await readFile(sigPath, 'utf8')) }
  } catch (error) {
    return { path: sigPath, data: null, error: String(error) }
  }
}

function send(child, method, params) {
  const id = nextId++
  const msg = { jsonrpc: '2.0', id, method, params }
  const line = JSON.stringify(msg)
  rawLines.push({ dir: 'out', line })
  if (lineInteresting(line)) note('client-send', msg)
  child.stdin.write(line + '\n')
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`timeout waiting for response to ${method} (id=${id})`))
    }, 120_000)
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      },
      method
    })
  })
}

function notify(child, method, params) {
  const msg = { jsonrpc: '2.0', method, params }
  const line = JSON.stringify(msg)
  rawLines.push({ dir: 'out', line })
  child.stdin.write(line + '\n')
}

function handleIncoming(child, line) {
  rawLines.push({ dir: 'in', line })
  if (lineInteresting(line)) note('raw-interesting', line)

  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    note('parse-error', line.slice(0, 500))
    return
  }

  if (msg.method === 'session/update') {
    const update = msg.params?.update ?? msg.params
    const updateType = update?.sessionUpdate ?? update?.session_update ?? '(missing)'
    sessionUpdates.push({
      t: new Date().toISOString(),
      sessionUpdate: updateType,
      params: msg.params
    })
    note('session-update', { sessionUpdate: updateType, params: msg.params })
    if (/compact/i.test(String(updateType)) || /compact/i.test(line)) {
      note('COMPACT-EVENT', msg)
    }
  }

  if (msg.method === 'session/request_permission') {
    // Auto-allow once for tools so /compact (if tool-based) can proceed.
    const options = msg.params?.options ?? []
    const allow =
      options.find((o) => String(o.kind || '').includes('allow_once')) ??
      options.find((o) => !String(o.kind || '').includes('reject'))
    if (msg.id !== undefined && allow) {
      const response = {
        jsonrpc: '2.0',
        id: msg.id,
        result: { outcome: { outcome: 'selected', optionId: allow.optionId } }
      }
      const out = JSON.stringify(response)
      rawLines.push({ dir: 'out', line: out })
      child.stdin.write(out + '\n')
      note('permission-auto', { optionId: allow.optionId, title: msg.params?.toolCall?.title })
    }
  }

  if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
    const p = pending.get(msg.id)
    if (p) {
      pending.delete(msg.id)
      if (msg.error) p.reject(Object.assign(new Error(msg.error.message || JSON.stringify(msg.error)), { rpc: msg.error }))
      else p.resolve(msg.result)
    }
  }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  note('start', { executable, cwd, grokHome })

  const child = spawn(executable, ['agent', '--always-approve', '--no-leader', 'stdio'], {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GROK_CLIENT_VERSION: 'compact-raw-probe' }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderrChunks.push(chunk)
    if (lineInteresting(chunk)) note('stderr-interesting', chunk.slice(0, 1000))
  })

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
  rl.on('line', (line) => handleIncoming(child, line))

  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })

  let sessionId
  let signalsBefore
  let signalsAfter
  let compactResult
  let seedResult
  let versionLine = ''
  const updateTypes = new Set()
  let error

  try {
    // Initialize
    const init = await send(child, 'initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
        plan: {}
      },
      clientInfo: { name: 'compact-raw-probe', version: '0.0.1' }
    })
    note('initialize-result', {
      protocolVersion: init?.protocolVersion,
      agentCapabilities: init?.agentCapabilities,
      commands: (init?._meta?.availableCommands ?? []).map((c) => c.name || c).filter((n) => /compact|context/i.test(String(n)))
    })
    const allCommands = (init?._meta?.availableCommands ?? []).map((c) => ({
      name: c.name,
      description: c.description,
      inputHint: c.inputHint
    }))
    note('available-commands', allCommands)

    // session/new
    const created = await send(child, 'session/new', { cwd, mcpServers: [] })
    sessionId = created.sessionId
    note('session-new', { sessionId, models: created.models?.currentModelId ?? created.models })

    // Seed a tiny turn so compact has something (cheap). Prefer no tools.
    try {
      seedResult = await send(child, 'session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'Reply with exactly PROBE_OK and nothing else. Do not use tools.' }]
      })
      note('seed-prompt-result', seedResult)
    } catch (e) {
      note('seed-prompt-error', String(e))
    }

    // Wait briefly for session files
    await new Promise((r) => setTimeout(r, 1500))
    signalsBefore = await readSignals(sessionId)
    note('signals-before', {
      path: signalsBefore.path,
      compactionCount: signalsBefore.data?.compactionCount,
      contextTokensUsed: signalsBefore.data?.contextTokensUsed,
      contextWindowUsage: signalsBefore.data?.contextWindowUsage,
      totalTokensBeforeCompaction: signalsBefore.data?.totalTokensBeforeCompaction,
      keys: signalsBefore.data ? Object.keys(signalsBefore.data).filter((k) => /compact|token|context|usage/i.test(k)) : []
    })

    const updatesBeforeCompact = sessionUpdates.length

    // Trigger /compact as a user prompt (slash command)
    try {
      compactResult = await send(child, 'session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: '/compact' }]
      })
      note('compact-prompt-result', compactResult)
    } catch (e) {
      note('compact-prompt-error', String(e))
      compactResult = { error: String(e) }
    }

    // Drain a bit more notifications
    await new Promise((r) => setTimeout(r, 3000))

    for (const u of sessionUpdates) updateTypes.add(u.sessionUpdate)

    signalsAfter = await readSignals(sessionId)
    note('signals-after', {
      path: signalsAfter.path,
      compactionCount: signalsAfter.data?.compactionCount,
      contextTokensUsed: signalsAfter.data?.contextTokensUsed,
      contextWindowUsage: signalsAfter.data?.contextWindowUsage,
      totalTokensBeforeCompaction: signalsAfter.data?.totalTokensBeforeCompaction,
      deltaCompactionCount:
        (signalsAfter.data?.compactionCount ?? 0) - (signalsBefore.data?.compactionCount ?? 0),
      deltaTokens:
        signalsBefore.data?.contextTokensUsed != null && signalsAfter.data?.contextTokensUsed != null
          ? signalsAfter.data.contextTokensUsed - signalsBefore.data.contextTokensUsed
          : null
    })

    const compactRelatedUpdates = sessionUpdates.slice(updatesBeforeCompact).filter((u) => {
      const s = JSON.stringify(u)
      return /compact/i.test(s) || /token/i.test(String(u.sessionUpdate))
    })
    note('compact-related-updates-after-slash', compactRelatedUpdates)

    // Optional: try availableCommands compact description only — already logged

    // Best-effort delete session via CLI so we don't litter
    try {
      const del = spawn(executable, ['sessions', 'delete', sessionId], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let delOut = ''
      del.stdout.on('data', (c) => {
        delOut += c
      })
      del.stderr.on('data', (c) => {
        delOut += c
      })
      await new Promise((resolve) => del.once('exit', resolve))
      note('session-delete', delOut.trim())
    } catch (e) {
      note('session-delete-error', String(e))
    }
  } catch (e) {
    error = e
    note('fatal', { message: String(e), stack: e?.stack })
  } finally {
    try {
      child.stdin.end()
    } catch {
      /* ignore */
    }
    // kill process tree-ish
    try {
      child.kill()
    } catch {
      /* ignore */
    }
    await Promise.race([exitPromise, new Promise((r) => setTimeout(r, 2000))])
  }

  // Write raw jsonl
  const jsonlPath = path.join(outDir, 'compact-raw-lines.jsonl')
  await writeFile(
    jsonlPath,
    rawLines.map((row) => JSON.stringify(row)).join('\n') + '\n',
    'utf8'
  )

  const compactOnWire = interesting.some((i) => i.kind === 'COMPACT-EVENT')
  const compactInUpdateTypes = [...updateTypes].filter((t) => /compact/i.test(String(t)))
  const allUpdateTypes = [...updateTypes].sort()

  const answers = {
    q1_emits_auto_compact_completed: compactOnWire || compactInUpdateTypes.length > 0,
    q1_detail: compactOnWire
      ? 'Saw compact-related session/update on raw wire'
      : compactInUpdateTypes.length
        ? `Update types matching compact: ${compactInUpdateTypes.join(', ')}`
        : 'No compact-named sessionUpdate observed on wire during /compact probe',
    q2_json_shape: compactOnWire
      ? interesting.filter((i) => i.kind === 'COMPACT-EVENT').map((i) => i.payload)
      : null,
    q3_compact_notification:
      compactOnWire || compactInUpdateTypes.length > 0
        ? 'yes-notification'
        : signalsAfter?.data &&
            (signalsAfter.data.compactionCount ?? 0) > (signalsBefore?.data?.compactionCount ?? 0)
          ? 'signals-only'
          : 'unclear-or-none',
    q4_recommendation: null
  }

  // Recommendation
  if (answers.q1_emits_auto_compact_completed) {
    answers.q4_recommendation =
      'A+C: A primary (raw intercept) because SDK drops non-union types; C still useful if auto-compact sometimes only updates disk'
  } else if (answers.q3_compact_notification === 'signals-only') {
    answers.q4_recommendation =
      'A+C required: wire may not emit auto_compact_completed for /compact; implement A for when it appears + C signals drop fallback'
  } else {
    answers.q4_recommendation =
      'A+C required: A for future/unknown wire events (fixture + intercept path); C for observable signals.json drops. Live probe did not prove a compact notification.'
  }

  const md = `# Compact raw ACP probe report

**Date:** ${new Date().toISOString()}  
**CLI:** \`${executable}\`  
**CWD (temp):** \`${cwd}\`  
**SessionId:** \`${sessionId ?? 'n/a'}\`  
**Error:** ${error ? String(error) : 'none'}

## Method

1. Spawn \`grok agent --always-approve --no-leader stdio\`
2. Speak JSON-RPC NDJSON **without** \`@agentclientprotocol/sdk\` closed-union parse
3. \`initialize\` → \`session/new\` → seed prompt → read \`signals.json\` → prompt \`/compact\` → re-read signals
4. Log all raw lines + session/update types

## Answers (mission 1–4)

### 1. Does Grok emit \`auto_compact_completed\` (or equivalent) on wire?

**${answers.q1_emits_auto_compact_completed ? 'YES (see detail)' : 'NO (not observed in this probe)'}**

${answers.q1_detail}

All \`sessionUpdate\` types observed:

\`\`\`
${allUpdateTypes.length ? allUpdateTypes.join('\n') : '(none)'}
\`\`\`

### 2. Exact JSON shape / field names

${
  answers.q2_json_shape
    ? '```json\n' + JSON.stringify(answers.q2_json_shape, null, 2) + '\n```'
    : '_No compact-named notification captured. event-adapter already expects:_'

}
${!answers.q2_json_shape ? `
\`\`\`json
{
  "sessionUpdate": "auto_compact_completed",
  "tokens_before": 900,
  "tokens_after": 300,
  "summary_preview": "..."
}
\`\`\`
(Adapter fields from product code; **not confirmed live** in this run.)
` : ''}

### 3. Does \`/compact\` emit a notification? Or only disk/signals change?

**Classification:** \`${answers.q3_compact_notification}\`

- Seed prompt stopReason: \`${JSON.stringify(seedResult?.stopReason ?? seedResult)}\`
- /compact prompt result: \`${JSON.stringify(compactResult)}\`
- signals before: compactionCount=${signalsBefore?.data?.compactionCount ?? 'n/a'}, contextTokensUsed=${signalsBefore?.data?.contextTokensUsed ?? 'n/a'}, contextWindowUsage=${signalsBefore?.data?.contextWindowUsage ?? 'n/a'}
- signals after: compactionCount=${signalsAfter?.data?.compactionCount ?? 'n/a'}, contextTokensUsed=${signalsAfter?.data?.contextTokensUsed ?? 'n/a'}, contextWindowUsage=${signalsAfter?.data?.contextWindowUsage ?? 'n/a'}
- signals path: \`${signalsAfter?.path ?? signalsBefore?.path ?? 'n/a'}\`

### 4. Recommendation: A-only vs A+C required

**${answers.q4_recommendation}**

## Session updates timeline (compact window)

\`\`\`json
${JSON.stringify(
  sessionUpdates.map((u) => ({ t: u.t, sessionUpdate: u.sessionUpdate })),
  null,
  2
)}
\`\`\`

## Interesting log (truncated)

\`\`\`json
${JSON.stringify(interesting.slice(0, 80), null, 2)}
\`\`\`

## Artifacts

- Raw NDJSON tee: \`work/_probe/compact-raw-lines.jsonl\` (${rawLines.length} lines)
- This report: \`work/_probe/compact-raw-probe.md\`
- Stderr (last 2k): 

\`\`\`
${stderrChunks.join('').slice(-2000)}
\`\`\`
`

  const reportPath = path.join(outDir, 'compact-raw-probe.md')
  await writeFile(reportPath, md, 'utf8')
  await writeFile(path.join(outDir, 'compact-raw-probe-meta.json'), JSON.stringify({ answers, sessionId, allUpdateTypes, interestingCount: interesting.length }, null, 2), 'utf8')

  console.log(JSON.stringify({ ok: !error, sessionId, answers, updateTypes: allUpdateTypes, reportPath, jsonlPath, rawLineCount: rawLines.length }, null, 2))
  if (error) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
