import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REMOTE_COOKIE_NAME,
  REMOTE_HEADER,
  REMOTE_SESSION_ABSOLUTE_MS,
  remoteError
} from '../shared/remote-protocol'
import { buildClearSessionCookie, buildSessionCookie, parseCookie } from './remote-auth'
import type { RemoteController } from './remote-controller'

const BODY_LIMIT = 32_768
const JSON_TYPE = 'application/json'

export type RemoteServerOptions = {
  controller: RemoteController
  /** Expected Host header when served via tunnel (e.g. xxx.trycloudflare.com) or localhost:port */
  getAllowedHosts: () => string[]
  /** Static files directory for mobile SPA */
  webRoot: string
  /** Cookie Secure flag — true for HTTPS tunnels; false for pure loopback HTTP. */
  cookieSecure?: boolean | (() => boolean)
  now?: () => number
}

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  })
  res.end(payload)
}

function securityHeaders(res: ServerResponse, isApi: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Frame-Options', 'DENY')
  if (!isApi) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    )
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(new Error('body_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function hostAllowed(hostHeader: string | undefined, allowed: string[]): boolean {
  if (!hostHeader) return false
  const host = hostHeader.trim().toLowerCase()
  return allowed.some((item) => item.toLowerCase() === host)
}

function originAllowed(origin: string | undefined, allowedHosts: string[]): boolean {
  // No CORS: same-origin only. Allow missing Origin for same-origin navigations.
  if (!origin) return true
  try {
    const url = new URL(origin)
    const host = url.host.toLowerCase()
    return allowedHosts.some((item) => item.toLowerCase() === host)
  } catch {
    return false
  }
}

export class RemoteServer {
  private server: Server | null = null
  private port: number | null = null
  private healthNonce: string | null = null

  constructor(private options: RemoteServerOptions) {}

  getPort(): number | null {
    return this.port
  }

  getHealthNonce(): string | null {
    return this.healthNonce
  }

  /** Bind 127.0.0.1 only (R-SEC-0). */
  async start(): Promise<{ port: number; healthNonce: string }> {
    if (this.server) return { port: this.port!, healthNonce: this.healthNonce! }
    this.healthNonce = `hn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    const server = createServer((req, res) => {
      void this.handle(req, res)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('無法綁定本機遠端伺服器')
    }
    this.server = server
    this.port = address.port
    return { port: this.port, healthNonce: this.healthNonce }
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.port = null
    this.healthNonce = null
    if (!server) return
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const allowedHosts = this.options.getAllowedHosts()
      const host = req.headers.host
      if (!hostAllowed(host, allowedHosts)) {
        securityHeaders(res, true)
        sendJson(res, 421, remoteError('forbidden', 'Host 不允許'))
        return
      }
      if (!originAllowed(req.headers.origin, allowedHosts)) {
        securityHeaders(res, true)
        sendJson(res, 403, remoteError('forbidden', 'Origin 不允許'))
        return
      }
      // No CORS headers ever
      if (req.method === 'OPTIONS') {
        securityHeaders(res, true)
        res.writeHead(403)
        res.end()
        return
      }

      const url = new URL(req.url || '/', `http://${host}`)
      const pathname = url.pathname

      if (pathname.startsWith('/api/')) {
        securityHeaders(res, true)
        await this.handleApi(req, res, pathname)
        return
      }

      securityHeaders(res, false)
      await this.handleStatic(res, pathname)
    } catch (error) {
      securityHeaders(res, true)
      if (error instanceof Error && error.message === 'body_too_large') {
        sendJson(res, 413, remoteError('invalid_request', '請求過大'))
        return
      }
      sendJson(res, 500, remoteError('server_error', '伺服器錯誤'))
    }
  }

  private cookieSecure(): boolean {
    const flag = this.options.cookieSecure
    if (typeof flag === 'function') return flag()
    if (typeof flag === 'boolean') return flag
    return true
  }

  private async handleApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const controller = this.options.controller
    const now = this.options.now?.() ?? Date.now()

    if (pathname === '/api/health') {
      const nonce = new URL(req.url || '/', 'http://local').searchParams.get('nonce')
      if (nonce && this.healthNonce && nonce === this.healthNonce) {
        sendJson(res, 200, { ok: true, nonce: this.healthNonce })
        return
      }
      sendJson(res, 200, { ok: true })
      return
    }

    if (pathname === '/api/status' && req.method === 'GET') {
      const pairing = controller.auth.getPairingPublic(now)
      const snap = controller.getSnapshot()
      sendJson(res, 200, {
        banner: snap.banner,
        pairable: pairing.pairable,
        paired: snap.paired,
        experimentalTunnel: controller.getDesktopPairingView().experimentalTunnel
      })
      return
    }

    if (pathname === '/api/pair' && req.method === 'POST') {
      if (!requireJsonMutation(req, res)) return
      if (!controller.auth.rateLimit('pair', 10, 60_000, now)) {
        sendJson(res, 429, remoteError('rate_limited', '請求過於頻繁'))
        return
      }
      const raw = await readBody(req)
      let body: { pairingSecret?: string; pin?: string }
      try {
        body = JSON.parse(raw) as { pairingSecret?: string; pin?: string }
      } catch {
        sendJson(res, 400, remoteError('invalid_request', 'JSON 無效'))
        return
      }
      if (typeof body.pairingSecret !== 'string' || typeof body.pin !== 'string') {
        sendJson(res, 400, remoteError('invalid_request', '缺少 pairingSecret 或 pin'))
        return
      }
      const result = await controller.handlePair(body.pairingSecret, body.pin)
      if (!result.ok) {
        const status = result.code === 'rate_limited' ? 429 : result.code === 'pin_invalid' ? 401 : 403
        sendJson(res, status, remoteError(result.code as 'pin_invalid', result.message))
        return
      }
      const maxAge = Math.floor(REMOTE_SESSION_ABSOLUTE_MS / 1000)
      sendJson(res, 200, { ok: true }, {
        'Set-Cookie': buildSessionCookie(result.sessionToken, maxAge, this.cookieSecure())
      })
      return
    }

    // Authenticated routes
    const token = parseCookie(req.headers.cookie, REMOTE_COOKIE_NAME)
    const session = controller.auth.validateSession(token, now)
    if (!session.ok) {
      sendJson(res, 401, remoteError(session.code, session.message), {
        'Set-Cookie': buildClearSessionCookie(this.cookieSecure())
      })
      return
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      if (!requireJsonMutation(req, res)) return
      controller.auth.revokeAll()
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': buildClearSessionCookie(this.cookieSecure()) })
      return
    }

    if (pathname === '/api/snapshot' && req.method === 'GET') {
      if (!controller.auth.rateLimit(`snap:${session.value.tokenHash}`, 30, 60_000, now)) {
        sendJson(res, 429, remoteError('rate_limited', '請求過於頻繁'))
        return
      }
      sendJson(res, 200, controller.getSnapshot())
      return
    }

    if (pathname === '/api/prompt' && req.method === 'POST') {
      if (!requireJsonMutation(req, res)) return
      if (!controller.auth.rateLimit(`prompt:${session.value.tokenHash}`, 5, 60_000, now)) {
        sendJson(res, 429, remoteError('rate_limited', '提示頻率過高'))
        return
      }
      const raw = await readBody(req)
      let body: { text?: string }
      try {
        body = JSON.parse(raw) as { text?: string }
      } catch {
        sendJson(res, 400, remoteError('invalid_request', 'JSON 無效'))
        return
      }
      const result = await controller.handlePrompt(typeof body.text === 'string' ? body.text : '')
      if (!result.ok) {
        sendJson(res, result.code === 'in_flight' ? 409 : 400, remoteError(result.code as 'invalid_request', result.message))
        return
      }
      sendJson(res, 200, { ok: true, provenance: 'mobile-remote' })
      return
    }

    if (pathname === '/api/cancel' && req.method === 'POST') {
      if (!requireJsonMutation(req, res)) return
      const result = await controller.handleCancel()
      if (!result.ok) {
        sendJson(res, 400, remoteError(result.code as 'not_ready', result.message))
        return
      }
      sendJson(res, 200, { ok: true, provenance: 'mobile-remote' })
      return
    }

    if (pathname === '/api/permission/respond' && req.method === 'POST') {
      if (!requireJsonMutation(req, res)) return
      const raw = await readBody(req)
      let body: { requestId?: string; optionId?: string }
      try {
        body = JSON.parse(raw) as { requestId?: string; optionId?: string }
      } catch {
        sendJson(res, 400, remoteError('invalid_request', 'JSON 無效'))
        return
      }
      if (typeof body.requestId !== 'string' || typeof body.optionId !== 'string') {
        sendJson(res, 400, remoteError('invalid_request', '缺少 requestId 或 optionId'))
        return
      }
      const result = controller.handlePermissionRespond(body.requestId, body.optionId)
      if (!result.ok) {
        sendJson(res, result.code === 'forbidden' ? 403 : 400, remoteError(result.code as 'permission_mismatch', result.message))
        return
      }
      sendJson(res, 200, { ok: true, provenance: 'mobile-remote' })
      return
    }

    sendJson(res, 404, remoteError('not_found', '找不到 API'))
  }

  private async handleStatic(res: ServerResponse, pathname: string): Promise<void> {
    const rel = pathname === '/' ? '/index.html' : pathname
    if (rel.includes('..')) {
      res.writeHead(400)
      res.end('Bad path')
      return
    }
    const filePath = path.join(this.options.webRoot, rel.replace(/^\//, ''))
    try {
      const data = await readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const type =
        ext === '.html' ? 'text/html; charset=utf-8'
          : ext === '.js' ? 'text/javascript; charset=utf-8'
            : ext === '.css' ? 'text/css; charset=utf-8'
              : 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
      res.end(data)
    } catch {
      // SPA fallback
      try {
        const index = await readFile(path.join(this.options.webRoot, 'index.html'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(index)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
    }
  }
}

function requireJsonMutation(req: IncomingMessage, res: ServerResponse): boolean {
  const type = String(req.headers['content-type'] || '').toLowerCase()
  if (!type.includes(JSON_TYPE)) {
    sendJson(res, 415, remoteError('invalid_request', 'Content-Type 必須為 application/json'))
    return false
  }
  const marker = req.headers[REMOTE_HEADER]
  if (marker !== '1' && marker !== 'true') {
    sendJson(res, 403, remoteError('forbidden', `缺少 ${REMOTE_HEADER} 標頭`))
    return false
  }
  return true
}

export function defaultRemoteWebRoot(): string {
  // Prefer packaged resources, then repo resources/remote-web
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../resources/remote-web')
}
