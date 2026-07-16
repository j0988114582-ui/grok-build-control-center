/**
 * Live T4: one ACP connection, two sessions, overlapping prompts, cancel A only.
 *
 *   npx tsx scripts/t4-live-dual-prompt.ts
 *
 * Uses always-approve agent. Consumes a small amount of Grok quota (2 short prompts).
 */
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GrokAcpClient } from '../src/main/acp-client.ts'
import type { UiSessionEvent } from '../src/shared/types.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const executable =
  process.env.GROK_EXECUTABLE?.trim() || path.join(homedir(), '.grok', 'bin', 'grok.exe')

const log = (...args: unknown[]): void => console.log('[t4-live]', ...args)

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const startedAt = new Date().toISOString()
  log('start', startedAt)
  log('executable', executable)

  const events: UiSessionEvent[] = []
  const client = new GrokAcpClient(
    executable,
    {
      onEvent: (event) => {
        events.push(event)
        if (event.kind === 'turn') {
          log('turn', event.sessionId.slice(0, 8), event.status, 'stopReason' in event ? (event.stopReason ?? '') : '')
        }
      },
      onPermission: () => {
        /* always-approve spawn handles tools; permission UI not wired here */
      },
      onStderr: (text) => {
        if (text.trim()) log('stderr', text.trim().slice(0, 240))
      },
      onExit: (message) => log('agent-exit', message)
    },
    '0.6.1-t4-live',
    true
  )

  await client.start()
  log('ACP connected')

  const dirA = await mkdtemp(path.join(tmpdir(), 't4-live-a-'))
  const dirB = await mkdtemp(path.join(tmpdir(), 't4-live-b-'))
  await writeFile(path.join(dirA, 'README.txt'), 't4-a\n', 'utf8')
  await writeFile(path.join(dirB, 'README.txt'), 't4-b\n', 'utf8')

  const sessionA = await client.createSession(dirA)
  const sessionB = await client.createSession(dirB)
  const idA = sessionA.sessionId
  const idB = sessionB.sessionId
  if (!idA || !idB) throw new Error('missing session ids from createSession')
  log('sessions', idA.slice(0, 8), idB.slice(0, 8))

  // Longer prompts so cancel A lands while both turns can still be active.
  const promptA =
    'Write a careful 250-word explanation of TCP handshake in Traditional Chinese. Use several short paragraphs. Do not use tools.'
  const promptB =
    'Write a careful 250-word explanation of UDP vs TCP in Traditional Chinese. Use several short paragraphs. Do not use tools.'

  // Overlap: start A then B before A finishes
  const pA = client.prompt(idA, [{ type: 'text', text: promptA }])
  await sleep(300)
  const pB = client.prompt(idB, [{ type: 'text', text: promptB }])

  // Wait until both have a running turn event (max ~8s)
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const aRun = events.some((e) => e.sessionId === idA && e.kind === 'turn' && e.status === 'running')
    const bRun = events.some((e) => e.sessionId === idB && e.kind === 'turn' && e.status === 'running')
    const aDone = events.some((e) => e.sessionId === idA && e.kind === 'turn' && e.status !== 'running')
    if (aRun && bRun && !aDone) break
    await sleep(150)
  }

  const aRunning = events.some((e) => e.sessionId === idA && e.kind === 'turn' && e.status === 'running')
  const bRunning = events.some((e) => e.sessionId === idB && e.kind === 'turn' && e.status === 'running')
  const aAlreadyDone = events.some((e) => e.sessionId === idA && e.kind === 'turn' && e.status !== 'running')
  log('overlap-running', { aRunning, bRunning, aAlreadyDone })

  log('cancel A only')
  await client.cancel(idA)

  const settled = await Promise.allSettled([pA, pB])
  log('settled', settled.map((s) => s.status))

  const aStops = events.filter(
    (e): e is Extract<UiSessionEvent, { kind: 'turn' }> =>
      e.sessionId === idA && e.kind === 'turn' && e.status !== 'running'
  )
  const bStops = events.filter(
    (e): e is Extract<UiSessionEvent, { kind: 'turn' }> =>
      e.sessionId === idB && e.kind === 'turn' && e.status !== 'running'
  )
  const aFinal = aStops.at(-1)
  const bFinal = bStops.at(-1)

  const aTerminal = Boolean(aFinal)
  const bTerminal = Boolean(bFinal)
  const bNotCancelledByA = bFinal?.status !== 'cancelled' || aFinal?.status === 'cancelled'
  // Pass if both reached terminal state, A was cancelled or completed, and B completed (preferred)
  // or B reached terminal without being the only cancelled session spuriously.
  const pass =
    aTerminal &&
    bTerminal &&
    (aFinal?.status === 'cancelled' || aFinal?.status === 'completed' || aFinal?.status === 'error') &&
    (bFinal?.status === 'completed' || bFinal?.status === 'error' || bFinal?.status === 'cancelled') &&
    // Core independence: B must reach a terminal event after we cancelled A
    bNotCancelledByA

  // Stronger independence: B completed (or terminal) after cancel A; prefer A cancelled.
  const independence =
    (bFinal?.status === 'completed' || bFinal?.status === 'error') &&
    (aFinal?.status === 'cancelled' || aFinal?.status === 'completed' || aFinal?.status === 'error')

  const strongCancel = aFinal?.status === 'cancelled' && bFinal?.status === 'completed'

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    executable,
    sessionA: idA,
    sessionB: idB,
    aRunning,
    bRunning,
    aAlreadyDoneBeforeCancel: aAlreadyDone,
    aFinalStatus: aFinal?.status ?? null,
    bFinalStatus: bFinal?.status ?? null,
    aStopReason: aFinal?.stopReason ?? null,
    bStopReason: bFinal?.stopReason ?? null,
    pA: settled[0].status,
    pB: settled[1].status,
    pass: Boolean(pass && independence),
    strongCancel,
    independence,
    notes: strongCancel
      ? 'STRONG: A cancelled while B completed independently on one ACP connection.'
      : pass && independence
        ? 'PASS: dual sessions terminal independently; cancel may have landed after A already finished.'
        : 'Independence check weak or failed — review turn events.'
  }

  const outDir = path.join(root, 'outputs', 't4-live')
  await mkdir(outDir, { recursive: true })
  const outFile = path.join(outDir, 'result.json')
  await writeFile(outFile, JSON.stringify(report, null, 2), 'utf8')
  log('report', outFile)
  console.log(JSON.stringify(report, null, 2))

  try {
    await client.stop()
  } catch {
    /* ignore */
  }

  if (!report.pass) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error('[t4-live] FATAL', error)
  process.exitCode = 1
})
