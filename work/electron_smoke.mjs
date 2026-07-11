import { _electron as electron } from 'playwright'

const app = await electron.launch(process.env.ELECTRON_EXE ? { executablePath: process.env.ELECTRON_EXE, args: [] } : { args: ['.'] })
try {
  const page = await app.firstWindow()
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)
  const diagnostic = { url: page.url(), body: (await page.locator('body').innerText()).slice(0, 500), html: (await page.content()).slice(0, 500) }
  console.log(JSON.stringify({ diagnostic, errors }))
  await page.getByText('GROK BUILD', { exact: true }).waitFor({ state: 'visible', timeout: 5000 })
  const bridge = await page.evaluate(() => typeof window.grokApi)
  const sessionCount = await page.locator('.session-list > button').count()
  await page.screenshot({ path: 'outputs/grok-build-gui-electron.png' })
  console.log(JSON.stringify({ bridge, sessionCount, errors, title: await page.title() }))
} finally {
  await app.close()
}
