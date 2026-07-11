import { _electron as electron } from 'playwright'
import { writeFile } from 'node:fs/promises'

const cwd = process.cwd()
const app = await electron.launch({ args: ['.'] })
let result
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  page.setDefaultTimeout(90_000)
  result = await page.evaluate(async (workdir) => {
    const events = []
    const permissions = []
    const statusMessages = []
    window.grokApi.onEvent((event) => events.push(event))
    window.grokApi.onPermission((request) => {
      permissions.push(request)
      const allow = request.options.find((option) => option.kind.includes('allow_once'))
      const fallback = request.options.find((option) => !option.kind.includes('reject'))
      const selected = allow ?? fallback
      if (selected) void window.grokApi.respondPermission(request.requestId, selected.optionId)
    })
    window.grokApi.onStatus((status) => { if (status.message) statusMessages.push(status.message) })

    const settings = await window.grokApi.getSettings()
    await window.grokApi.saveSettings(settings)
    const capabilities = await window.grokApi.connect()
    const sessionsBefore = await window.grokApi.listSessions()
    const created = await window.grokApi.createSession(workdir)
    const sessionId = created.sessionId
    if (!sessionId) throw new Error('session/new did not return an id')

    await window.grokApi.sendPrompt(sessionId, [{ type: 'text', text: 'Reply with exactly GROK_GUI_LIVE_OK and do not use tools.' }])
    const firstText = events.filter((event) => event.kind === 'message' && event.role === 'assistant').map((event) => event.text).join('')
    const beforeTool = events.length
    await window.grokApi.sendPrompt(sessionId, [{ type: 'text', text: 'Use the shell tool to execute the read-only command `cmd /c echo GROK_GUI_TOOL_OK`, then reply exactly GROK_GUI_TOOL_DONE. Do not edit any file.' }])
    const toolEvents = events.slice(beforeTool).filter((event) => event.kind === 'tool')
    const toolText = events.slice(beforeTool).filter((event) => event.kind === 'message' && event.role === 'assistant').map((event) => event.text).join('')

    const beforeCancel = events.length
    const cancelTurn = window.grokApi.sendPrompt(sessionId, [{ type: 'text', text: 'Use the shell tool to execute `powershell.exe -NoProfile -Command Start-Sleep -Seconds 20`, then reply GROK_GUI_CANCEL_FAILED. Do not edit files.' }]).then(() => 'resolved').catch((error) => `rejected:${String(error)}`)
    const deadline = Date.now() + 12_000
    while (Date.now() < deadline && !events.slice(beforeCancel).some((event) => event.kind === 'tool')) await new Promise((resolve) => setTimeout(resolve, 100))
    await window.grokApi.cancel(sessionId)
    const cancelPromiseState = await cancelTurn
    const cancelEvents = events.slice(beforeCancel)
    const cancellationObserved = cancelEvents.some((event) => event.kind === 'turn' && event.status === 'cancelled')

    const modes = created.modes && typeof created.modes === 'object' && 'availableModes' in created.modes ? created.modes.availableModes : []
    const currentModeId = created.modes && typeof created.modes === 'object' && 'currentModeId' in created.modes ? created.modes.currentModeId : undefined
    if (currentModeId) await window.grokApi.setMode(sessionId, currentModeId)

    const replayStart = events.length
    await window.grokApi.loadSession(sessionId, workdir)
    const replayEvents = events.slice(replayStart)

    return {
      cliStatus: await window.grokApi.getStatus(),
      capabilities,
      sessionsBefore: sessionsBefore.length,
      sessionId,
      pureReplyExact: firstText.trim() === 'GROK_GUI_LIVE_OK',
      pureReplyText: firstText.trim(),
      toolEventCount: toolEvents.length,
      toolStatuses: toolEvents.map((event) => event.status),
      toolReplyContainsToken: toolText.includes('GROK_GUI_TOOL_DONE'),
      permissionRequestCount: permissions.length,
      cancellationObserved,
      cancelPromiseState,
      cancelEventKinds: cancelEvents.map((event) => event.kind),
      availableModeCount: Array.isArray(modes) ? modes.length : 0,
      currentModeId,
      replayEventCount: replayEvents.length,
      replayKinds: [...new Set(replayEvents.map((event) => event.kind))],
      statusMessages
    }
  }, cwd)
  console.log(JSON.stringify(result))
  await writeFile('work/live-acp-smoke-result.json', JSON.stringify(result, null, 2), 'utf8')
} finally {
  await app.close()
}

if (!result?.pureReplyExact || result.toolEventCount < 1 || !result.toolReplyContainsToken || !result.cancellationObserved || result.replayEventCount < 1) process.exitCode = 1
