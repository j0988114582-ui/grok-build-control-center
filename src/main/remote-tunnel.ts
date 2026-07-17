import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Experimental Cloudflare Quick Tunnel lifecycle (R-SEC-20).
 * - no shell:true
 * - parse single https://*.trycloudflare.com URL
 * - caller must verify route via nonce health before showing QR
 */
export type TunnelStartResult =
  | { ok: true; url: string; pid: number }
  | { ok: false; reason: string }

const TRYCLOUDFLARE = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?$/i

export function parseQuickTunnelUrl(line: string): string | null {
  const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?/i)
  if (!match) return null
  const url = match[0].replace(/\/$/, '')
  return TRYCLOUDFLARE.test(url) ? url : null
}

export async function verifyCloudflaredChecksum(
  filePath: string,
  expectedSha256: string
): Promise<boolean> {
  const buf = await readFile(filePath)
  const hash = createHash('sha256').update(buf).digest('hex')
  return hash.toLowerCase() === expectedSha256.toLowerCase()
}

export class RemoteTunnelManager {
  private child: ChildProcess | null = null
  private url: string | null = null

  getUrl(): string | null {
    return this.url
  }

  isRunning(): boolean {
    return Boolean(this.child && !this.child.killed)
  }

  /**
   * Start quick tunnel to http://127.0.0.1:port
   * cloudflaredPath must be a verified binary path (caller checks checksum).
   */
  async startQuickTunnel(options: {
    cloudflaredPath: string
    port: number
    timeoutMs?: number
  }): Promise<TunnelStartResult> {
    await this.stop()
    try {
      await access(options.cloudflaredPath)
    } catch {
      return { ok: false, reason: '找不到 cloudflared 執行檔' }
    }

    const args = [
      'tunnel',
      '--url', `http://127.0.0.1:${options.port}`,
      '--no-autoupdate'
    ]

    let child: ChildProcess
    try {
      child = spawn(options.cloudflaredPath, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }

    this.child = child
    const timeoutMs = options.timeoutMs ?? 25_000

    return await new Promise<TunnelStartResult>((resolve) => {
      let settled = false
      const finish = (result: TunnelStartResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }

      const timer = setTimeout(() => {
        void this.stop()
        finish({ ok: false, reason: 'Quick Tunnel 啟動逾時（實驗性，無 SLA）' })
      }, timeoutMs)

      const onData = (buf: Buffer): void => {
        const text = buf.toString('utf8')
        // Production: do not log secrets/URLs at debug; only parse
        const url = parseQuickTunnelUrl(text)
        if (url) {
          this.url = url
          finish({ ok: true, url, pid: child.pid ?? 0 })
        }
      }

      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
      child.on('error', (error) => {
        finish({ ok: false, reason: error.message })
      })
      child.on('exit', () => {
        this.child = null
        if (!settled) finish({ ok: false, reason: 'cloudflared 已結束' })
      })
    })
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.url = null
    if (!child || child.killed) return
    try {
      child.kill()
    } catch { /* ignore */ }
    // Best-effort Windows tree kill is handled by process-tree if needed elsewhere
  }
}

export function cloudflaredCandidatePaths(homeDir: string): string[] {
  return [
    path.join(homeDir, '.grok', 'bin', 'cloudflared.exe'),
    path.join(homeDir, '.cloudflared', 'cloudflared.exe'),
    'cloudflared'
  ]
}
