// Live smoke for model picker fallback, context usage, weekly billing, and session delete.
// Connects to the real Grok CLI but never sends a prompt, so it costs no credits.
import { _electron as electron } from 'playwright'
import { writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const workdir = await mkdtemp(path.join(tmpdir(), 'grok-gui-smoke-'))
const app = await electron.launch({ args: ['.'] })
let result
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  page.setDefaultTimeout(90_000)
  result = await page.evaluate(async (cwd) => {
    const out = {}
    const capabilities = await window.grokApi.connect()
    out.modelStateFromConnect = capabilities.modelState ?? null
    out.commandCount = capabilities.commands.length
    out.billing = await window.grokApi.getBilling()
    const created = await window.grokApi.createSession(cwd)
    out.sessionId = created.sessionId
    out.modelsFromSession = created.models ?? null
    out.usage = await window.grokApi.getUsage(created.sessionId)
    out.usageForFreshSession = out.usage !== null
    out.setModel = await window.grokApi.setModel(created.sessionId, 'grok-composer-2.5-fast').then(() => 'ok').catch(String)
    out.setModelBack = await window.grokApi.setModel(created.sessionId, 'grok-4.5', 'high').then(() => 'ok').catch(String)
    out.deleted = await window.grokApi.deleteSession(created.sessionId).catch(String)
    const after = await window.grokApi.listSessions()
    out.sessionGoneFromIndex = !after.some((session) => session.id === created.sessionId)
    return out
  }, workdir)
  console.log(JSON.stringify(result, null, 2))
  await writeFile('work/live-feature-smoke-result.json', JSON.stringify(result, null, 2), 'utf8')
} finally {
  await app.close()
}

const models = result?.modelsFromSession?.availableModels ?? result?.modelStateFromConnect?.availableModels ?? []
const billingEnd = result?.billing?.billingPeriodEnd
const validBilling = typeof result?.billing?.creditUsagePercent === 'number' && typeof billingEnd === 'string' && Number.isFinite(Date.parse(billingEnd))
if (models.length < 2 || !validBilling || result.setModel !== 'ok' || result.setModelBack !== 'ok' || result.deleted !== true || !result.sessionGoneFromIndex) process.exitCode = 1
