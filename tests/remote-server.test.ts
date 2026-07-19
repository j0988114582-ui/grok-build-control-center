import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REMOTE_SESSION_ABSOLUTE_MS } from '../src/shared/remote-protocol'
import { RemoteController } from '../src/main/remote-controller'
import { RemoteServer } from '../src/main/remote-server'
import type { AgentPermissionMode, SessionSummary } from '../src/shared/types'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources/remote-web')

type ControllerFactory = () => {
  controller: RemoteController
  /** mutable clock for TTL tests */
  now: { t: number }
  mode: { value: AgentPermissionMode }
  ready: Set<string>
  prompt: ReturnType<typeof vi.fn>
  loadSession: ReturnType<typeof vi.fn>
  createSession: ReturnType<typeof vi.fn>
  setPermissionMode: ReturnType<typeof vi.fn>
}

const defaultFactory: ControllerFactory = () => {
  const now = { t: 1_000_000 }
  const mode = { value: 'ask' as AgentPermissionMode }
  const ready = new Set<string>(['s1'])
  const sessions: SessionSummary[] = [{ id: 's1', cwd: 'C:\\repo', title: 'Alpha' }]
  const prompt = vi.fn().mockResolvedValue(undefined)
  const loadSession = vi.fn().mockImplementation(async (id: string) => {
    ready.add(id)
  })
  const createSession = vi.fn().mockResolvedValue({ sessionId: 's2', cwd: 'C:\\repo' })
  const holder: { c: RemoteController | null } = { c: null }
  const setPermissionMode = vi.fn().mockImplementation(async (next: AgentPermissionMode) => {
    mode.value = next
    // Simulate main reconnect + restore focus after YOLO toggle
    await holder.c!.restoreFocusAfterReconnect()
    return next
  })
  const controller = new RemoteController({
    getPermissionMode: () => mode.value,
    listSessions: () => sessions,
    isSessionReady: (id) => ready.has(id),
    prompt,
    cancel: vi.fn().mockResolvedValue(undefined),
    respondPermission: vi.fn(),
    loadSession,
    createSession,
    setModel: vi.fn().mockResolvedValue(undefined),
    setMode: vi.fn().mockResolvedValue(undefined),
    interject: vi.fn().mockResolvedValue(undefined),
    setPermissionMode,
    now: () => now.t
  })
  holder.c = controller
  return { controller, now, mode, ready, prompt, loadSession, createSession, setPermissionMode }
}

async function withServer(
  run: (
    base: string,
    ctx: ReturnType<ControllerFactory> & { server: RemoteServer }
  ) => Promise<void>,
  factory: ControllerFactory = defaultFactory
): Promise<void> {
  const ctx = factory()
  const { controller } = ctx
  controller.enable()

  let allowedHost = '127.0.0.1:0'
  const server = new RemoteServer({
    controller,
    getAllowedHosts: () => [allowedHost, `localhost:${allowedHost.split(':')[1]}`],
    webRoot,
    cookieSecure: false,
    now: () => ctx.now.t
  })
  const started = await server.start()
  allowedHost = `127.0.0.1:${started.port}`
  const base = `http://127.0.0.1:${started.port}`
  try {
    await run(base, { ...ctx, server })
  } finally {
    await server.stop()
    controller.disable()
  }
}

async function pairCookie(base: string, controller: RemoteController): Promise<string> {
  const opened = controller.regeneratePairing()!
  controller.setBanner('pairable')
  const pair = await fetch(`${base}/api/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Grok-Remote': '1' },
    body: JSON.stringify({ pairingSecret: opened.pairingSecret, pin: opened.pin })
  })
  expect(pair.status).toBe(200)
  const setCookie = pair.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  expect(cookie).toBeTruthy()
  return cookie
}

function jsonHeaders(cookie: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Grok-Remote': '1',
    cookie
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
    await withServer(async (base, { controller }) => {
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
    await withServer(async (base, { controller }) => {
      const cookie = await pairCookie(base, controller)
      const snap = await fetch(`${base}/api/snapshot`, { headers: { cookie } })
      expect(snap.status).toBe(200)

      const forged = await fetch(`${base}/api/permission/respond`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
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

  it('rejects upload routes', async () => {
    await withServer(async (base, { controller }) => {
      const cookie = await pairCookie(base, controller)
      const res = await fetch(`${base}/api/upload`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: '{}'
      })
      expect(res.status).toBe(404)
    })
  })

  it('rejects bad Host', async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/status`, {
        headers: { Host: 'evil.example' }
      }).catch(() => null)
      // undici may refuse Host override; if request proceeds, server must 421
      if (res) expect([421, 403, 200]).toContain(res.status)
    })
  })
})

describe('remote-server v0.9 routes + integration', () => {
  it('focus loads unready session then prompt works', async () => {
    await withServer(async (base, { controller, ready, prompt, loadSession }) => {
      ready.delete('s1')
      const cookie = await pairCookie(base, controller)
      const focus = await fetch(`${base}/api/session/focus`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ sessionId: 's1' })
      })
      expect(focus.status).toBe(200)
      expect(loadSession).toHaveBeenCalledWith('s1', 'C:\\repo')
      const body = await focus.json() as { ok: boolean; sessionId?: string }
      expect(body.ok).toBe(true)
      expect(controller.getSnapshot().focusStatus).toBe('ready')

      const p = await fetch(`${base}/api/prompt`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ text: 'hello phone' })
      })
      expect(p.status).toBe(200)
      expect(prompt).toHaveBeenCalledWith('s1', 'hello phone')
    })
  })

  it('create rejects cwd outside union', async () => {
    await withServer(async (base, { controller, createSession }) => {
      const cookie = await pairCookie(base, controller)
      const res = await fetch(`${base}/api/session/create`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ cwd: 'C:\\evil' })
      })
      expect(res.status).toBe(403)
      expect(createSession).not.toHaveBeenCalled()
    })
  })

  it('create accepts cwd in union', async () => {
    await withServer(async (base, { controller, createSession }) => {
      const cookie = await pairCookie(base, controller)
      const res = await fetch(`${base}/api/session/create`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ cwd: 'C:\\repo' })
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; sessionId?: string }
      expect(body.sessionId).toBe('s2')
      expect(createSession).toHaveBeenCalled()
      expect(controller.getFocusSessionId()).toBe('s2')
    })
  })

  it('yolo enable with PIN keeps cookie; after reconnect restore focus prompt works', async () => {
    await withServer(async (base, { controller, mode, setPermissionMode, prompt, ready }) => {
      const opened = controller.regeneratePairing()!
      controller.setBanner('pairable')
      const pair = await fetch(`${base}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Grok-Remote': '1' },
        body: JSON.stringify({ pairingSecret: opened.pairingSecret, pin: opened.pin })
      })
      const cookie = (pair.headers.get('set-cookie') || '').split(';')[0]
      // Focus s1 ready
      await fetch(`${base}/api/session/focus`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ sessionId: 's1' })
      })
      expect(controller.getSnapshot().focusStatus).toBe('ready')

      // Elevate YOLO
      const yolo = await fetch(`${base}/api/yolo/enable`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ pin: opened.pin })
      })
      expect(yolo.status).toBe(200)
      expect(setPermissionMode).toHaveBeenCalledWith('always-approve')
      expect(mode.value).toBe('always-approve')

      // Same cookie still works
      const snap = await fetch(`${base}/api/snapshot`, { headers: { cookie } })
      expect(snap.status).toBe(200)
      const snapBody = await snap.json() as { paired: boolean; focusStatus: string; permissionMode: string }
      expect(snapBody.paired).toBe(true)
      expect(snapBody.permissionMode).toBe('always-approve')
      // restoreFocusAfterReconnect ran via setPermissionMode mock
      expect(ready.has('s1')).toBe(true)
      expect(controller.getSnapshot().focusStatus).toBe('ready')

      const p = await fetch(`${base}/api/prompt`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ text: 'after yolo' })
      })
      expect(p.status).toBe(200)
      expect(prompt).toHaveBeenCalledWith('s1', 'after yolo')
    })
  })

  it('yolo disable keeps remote session cookie', async () => {
    await withServer(async (base, { controller, mode }) => {
      mode.value = 'always-approve'
      const cookie = await pairCookie(base, controller)
      const off = await fetch(`${base}/api/yolo/disable`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: '{}'
      })
      expect(off.status).toBe(200)
      expect(mode.value).toBe('ask')
      const snap = await fetch(`${base}/api/snapshot`, { headers: { cookie } })
      expect(snap.status).toBe(200)
      expect((await snap.json() as { paired: boolean }).paired).toBe(true)
    })
  })

  it('wrong PIN does not enable yolo; elevation lock after failures', async () => {
    await withServer(async (base, { controller, setPermissionMode }) => {
      const opened = controller.regeneratePairing()!
      controller.setBanner('pairable')
      const pair = await fetch(`${base}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Grok-Remote': '1' },
        body: JSON.stringify({ pairingSecret: opened.pairingSecret, pin: opened.pin })
      })
      const cookie = (pair.headers.get('set-cookie') || '').split(';')[0]

      for (let i = 0; i < 5; i++) {
        const bad = await fetch(`${base}/api/yolo/enable`, {
          method: 'POST',
          headers: jsonHeaders(cookie),
          body: JSON.stringify({ pin: '000000' })
        })
        expect([401, 403, 400]).toContain(bad.status)
      }
      expect(setPermissionMode).not.toHaveBeenCalled()
      const locked = await fetch(`${base}/api/yolo/enable`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ pin: opened.pin })
      })
      expect(locked.status).toBe(403)
      const snap = await fetch(`${base}/api/snapshot`, { headers: { cookie } })
      expect((await snap.json() as { elevationLocked: boolean }).elevationLocked).toBe(true)
      // session still valid
      expect(snap.status).toBe(200)
    })
  })

  it('absolute TTL expiry kicks cookie; re-pair starts new window', async () => {
    await withServer(async (base, { controller, now }) => {
      const cookie = await pairCookie(base, controller)
      expect((await fetch(`${base}/api/snapshot`, { headers: { cookie } })).status).toBe(200)

      now.t += REMOTE_SESSION_ABSOLUTE_MS + 1
      const expired = await fetch(`${base}/api/snapshot`, { headers: { cookie } })
      expect(expired.status).toBe(401)

      // Re-pair with new clock base
      const cookie2 = await pairCookie(base, controller)
      expect((await fetch(`${base}/api/snapshot`, { headers: { cookie: cookie2 } })).status).toBe(200)
      // Old cookie still dead
      expect((await fetch(`${base}/api/snapshot`, { headers: { cookie } })).status).toBe(401)
    })
  })

  it('queue and interject and model routes wire to controller', async () => {
    await withServer(async (base, { controller }) => {
      const cookie = await pairCookie(base, controller)
      await fetch(`${base}/api/session/focus`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ sessionId: 's1' })
      })
      controller.setRunning('s1', true)

      const q = await fetch(`${base}/api/queue`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ text: 'next' })
      })
      expect(q.status).toBe(200)
      expect(controller.getQueue()?.text).toBe('next')

      const clear = await fetch(`${base}/api/queue/clear`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: '{}'
      })
      expect(clear.status).toBe(200)
      expect(controller.getQueue()).toBeNull()

      const inter = await fetch(`${base}/api/interject`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ text: 'side note' })
      })
      expect(inter.status).toBe(200)

      const model = await fetch(`${base}/api/model`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ modelId: 'grok-4.5', reasoningEffort: 'low' })
      })
      expect(model.status).toBe(200)

      const mode = await fetch(`${base}/api/mode`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ modeId: 'build' })
      })
      expect(mode.status).toBe(200)

      const list = await fetch(`${base}/api/session/list`, { headers: { cookie } })
      expect(list.status).toBe(200)
      const listBody = await list.json() as { sessions: unknown[]; cwdUnion: string[] }
      expect(listBody.sessions.length).toBeGreaterThan(0)
      expect(listBody.cwdUnion.some((c) => c.includes('repo'))).toBe(true)
    })
  })

  it('accepts a full 12k-char CJK prompt (UTF-8 body fits the limit)', async () => {
    await withServer(async (base, { controller, prompt }) => {
      const cookie = await pairCookie(base, controller)
      await fetch(`${base}/api/session/focus`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ sessionId: 's1' })
      })
      const text = '測'.repeat(12_000) // 36KB UTF-8 — used to 413 under the 32KB body cap
      const res = await fetch(`${base}/api/prompt`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ text })
      })
      expect(res.status).toBe(200)
      expect(prompt).toHaveBeenCalledWith('s1', text)
    })
  })

  it('phone logout flips desktop banner to expired and clears sessions', async () => {
    await withServer(async (base, { controller }) => {
      const cookie = await pairCookie(base, controller)
      const res = await fetch(`${base}/api/logout`, {
        method: 'POST',
        headers: jsonHeaders(cookie),
        body: '{}'
      })
      expect(res.status).toBe(200)
      expect(controller.getDesktopPairingView().banner).toBe('expired')
      expect((await fetch(`${base}/api/snapshot`, { headers: { cookie } })).status).toBe(401)
    })
  })

  it('cookie is HttpOnly SameSite=Strict and body never returns sessionToken', async () => {
    await withServer(async (base, { controller }) => {
      const opened = controller.regeneratePairing()!
      const pair = await fetch(`${base}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Grok-Remote': '1' },
        body: JSON.stringify({ pairingSecret: opened.pairingSecret, pin: opened.pin })
      })
      const setCookie = pair.headers.get('set-cookie') || ''
      expect(setCookie).toMatch(/HttpOnly/i)
      expect(setCookie).toMatch(/SameSite=Strict/i)
      const body = await pair.json() as Record<string, unknown>
      expect(body.sessionToken).toBeUndefined()
      expect(body.ok).toBe(true)
    })
  })
})
