import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RemoteController } from '../src/main/remote-controller'
import { RemoteServer } from '../src/main/remote-server'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources/remote-web')

async function withServer(run: (base: string, controller: RemoteController, server: RemoteServer) => Promise<void>): Promise<void> {
  const controller = new RemoteController({
    getPermissionMode: () => 'ask',
    listSessions: () => [{ id: 's1', cwd: 'C:\\repo', title: 'Alpha' }],
    isSessionReady: () => true,
    prompt: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    respondPermission: vi.fn(),
    now: () => 1_000
  })
  controller.enable()
  controller.setFocusSession('s1')

  let allowedHost = '127.0.0.1:0'
  const server = new RemoteServer({
    controller,
    getAllowedHosts: () => [allowedHost, 'localhost:' + allowedHost.split(':')[1]],
    webRoot,
    cookieSecure: false,
    now: () => 1_000
  })
  const started = await server.start()
  allowedHost = `127.0.0.1:${started.port}`
  const base = `http://127.0.0.1:${started.port}`
  try {
    await run(base, controller, server)
  } finally {
    await server.stop()
    controller.disable()
  }
}

describe('remote-server negative security', () => {
  it('status works on loopback host', async () => {
    await withServer(async (base) => {
      const ok = await fetch(`${base}/api/status`)
      expect(ok.status).toBe(200)
      const data = await ok.json() as { pairable?: boolean }
      expect(typeof data.pairable).toBe('boolean')
    })
  })

  it('rejects mutation without X-Grok-Remote and non-json content-type', async () => {
    await withServer(async (base, controller) => {
      const opened = controller.regeneratePairing()
      expect(opened).toBeTruthy()
      const noHeader = await fetch(`${base}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingSecret: opened!.pairingSecret, pin: opened!.pin })
      })
      expect(noHeader.status).toBe(403)

      const badType = await fetch(`${base}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'X-Grok-Remote': '1' },
        body: 'x'
      })
      expect(badType.status).toBe(415)
    })
  })

  it('snapshot requires cookie session', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/snapshot`)
      expect(res.status).toBe(401)
    })
  })

  it('pairs via POST body secret and sets cookie; forges permission fail', async () => {
    await withServer(async (base, controller) => {
      const opened = controller.regeneratePairing()!
      controller.setBanner('pairable')
      const pair = await fetch(`${base}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Grok-Remote': '1' },
        body: JSON.stringify({ pairingSecret: opened.pairingSecret, pin: opened.pin })
      })
      expect(pair.status).toBe(200)
      const setCookie = pair.headers.get('set-cookie') || ''
      expect(setCookie).toMatch(/HttpOnly/i)
      expect(setCookie).toMatch(/SameSite=Strict/i)
      const body = await pair.json() as { ok?: boolean; sessionToken?: string }
      expect(body.sessionToken).toBeUndefined()

      const cookie = setCookie.split(';')[0]
      const snap = await fetch(`${base}/api/snapshot`, { headers: { cookie } })
      expect(snap.status).toBe(200)

      const forged = await fetch(`${base}/api/permission/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Grok-Remote': '1',
          cookie
        },
        body: JSON.stringify({ requestId: 'permission:nope', optionId: 'once' })
      })
      expect([400, 403]).toContain(forged.status)
    })
  })

  it('serves SPA index with CSP', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-security-policy') || '').toMatch(/default-src 'self'/)
      const html = await res.text()
      expect(html).toMatch(/Grok Build 遙控/)
    })
  })
})
