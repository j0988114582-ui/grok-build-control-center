// Wave 3b GUI audit: verify the PACKAGED build, not the dev build.
//
// electron-vite dev and an asar-packed NSIS build can diverge (missing files,
// bad asar unpack, stripped assets). This launches the real packaged exe from
// outputs/installer/win-unpacked and checks that every wave actually shipped.
//
// Uses a throwaway --user-data-dir so it never touches the operator's real
// settings.json, pinned sessions or drafts. Does not install anything.
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const outDir = path.resolve('output', 'playwright', 'wave-installer')
const unpacked = path.resolve('outputs', 'installer', 'win-unpacked', 'Grok Build Control Center.exe')
const profileDir = await mkdtemp(path.join(tmpdir(), 'grok-gui-packaged-profile-'))
await mkdir(outDir, { recursive: true })

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}

await access(unpacked).catch(() => {
  console.error(`packaged app not found: ${unpacked}\nrun: npm run package`)
  process.exit(1)
})

const result = { executable: unpacked, screenshots: [] }
const app = await electron.launch({ executablePath: unpacked, args: [`--user-data-dir=${profileDir}`] })
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(60_000)
  await page.waitForLoadState('domcontentloaded')
  await page.setViewportSize({ width: 1440, height: 960 })

  // If asar packing broke the renderer bundle this is where it shows up.
  await page.waitForFunction(() => Boolean(window.grokApi), null, { timeout: 60_000 })
  await page.waitForSelector('.sidebar', { timeout: 60_000 })
  check('packaged-renderer-boots', true, 'renderer + preload bridge alive inside asar')

  const version = await app.evaluate(async ({ app: electronApp }) => electronApp.getVersion())
  result.version = version
  check('version-is-0.13.1', version === '0.13.1', `app.getVersion() = ${version}`)

  // Wave 1 — sidebar active-only filter.
  await page.waitForSelector('[data-testid="session-list"] .session-row', { timeout: 60_000 })
  const toggle = page.locator('[data-testid="active-only-toggle"]')
  const caption = () => page.locator('[data-testid="session-caption-count"]').innerText()
  const before = (await caption()).trim()
  check('wave1-filter-present-and-off', (await toggle.count()) === 1 && !(await toggle.isChecked()),
    `caption "${before}"`)
  await toggle.click()
  await page.waitForFunction((prev) => document.querySelector('[data-testid="session-caption-count"]')?.textContent !== prev, before)
  const after = (await caption()).trim()
  check('wave1-filter-works', /^\d+ · 活躍 4 天$/.test(after) && after !== before, `${before} → ${after}`)
  await page.screenshot({ path: path.join(outDir, '01-packaged-sidebar-filter.png') })
  result.screenshots.push('01-packaged-sidebar-filter.png')
  await toggle.click()

  // Wave 1 — settings section.
  await page.locator('.sidebar-footer button', { hasText: '設定' }).click()
  await page.waitForSelector('[data-testid="sidebar-sessions-settings"]')
  await page.locator('[data-testid="sidebar-sessions-fine-print"]').scrollIntoViewIfNeeded()
  const finePrint = await page.locator('[data-testid="sidebar-sessions-fine-print"]').innerText()
  check('wave1-settings-section-present', /不會刪除任何對話/.test(finePrint) && /10 天規則/.test(finePrint),
    finePrint.replace(/\s+/g, ' ').slice(0, 120))
  await page.screenshot({ path: path.join(outDir, '02-packaged-settings.png') })
  result.screenshots.push('02-packaged-settings.png')
  await page.keyboard.press('Escape')

  // The plan-approval fix and the subagent roster are main-process/bridge wiring;
  // their presence in the packaged preload is what packaging can break.
  const bridge = await page.evaluate(() => ({
    respondPlanApproval: typeof window.grokApi.respondPlanApproval,
    onPlanApproval: typeof window.grokApi.onPlanApproval,
    listRunningSubagents: typeof window.grokApi.listRunningSubagents
  }))
  check('plan-approval-bridge-shipped', bridge.respondPlanApproval === 'function' && bridge.onPlanApproval === 'function', bridge)
  check('subagent-roster-bridge-shipped', bridge.listRunningSubagents === 'function', bridge)

  // And the roster IPC must actually round-trip in the packaged main process.
  const rosterProbe = await page.evaluate(async () => {
    try { return { ok: true, value: await window.grokApi.listRunningSubagents('not-a-real-session') } }
    catch (error) { return { ok: false, error: String(error).slice(0, 200) } }
  })
  check('roster-ipc-round-trips', rosterProbe.ok === true, rosterProbe)
} catch (error) {
  check('installer-audit-script', false, String(error?.stack ?? error).slice(0, 600))
} finally {
  await app.close().catch(() => {})
}

result.checks = checks
result.passed = checks.filter((item) => item.ok).length
result.failed = checks.filter((item) => !item.ok).length
await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8')
console.log(`\n${result.passed} passed / ${result.failed} failed — screenshots in ${outDir}`)
if (result.failed) process.exitCode = 1
