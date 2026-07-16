import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type KillProcessTreeOptions = {
  /** Override platform detection (tests). Default: process.platform */
  platform?: NodeJS.Platform
  /** Injected runner for Windows taskkill / POSIX kill. */
  run?: (command: string, args: string[]) => Promise<void>
  /** When true, skip the actual kill (used by pure builders). */
  dryRun?: boolean
}

/**
 * Build the argv for Windows process-tree termination (plugin-cc style).
 * Session cancel is ACP-level and must NOT use this path.
 */
export function buildWindowsTaskkillArgs(pid: number): string[] {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid process id: ${pid}`)
  return ['/PID', String(pid), '/T', '/F']
}

/**
 * Best-effort process-tree kill for stop / disconnect / quit / executable swap.
 * On Windows: `taskkill /PID <pid> /T /F`. Elsewhere: `process.kill(-pid)` is not
 * reliable without a process group, so we fall back to `process.kill(pid, 'SIGKILL')`.
 */
export async function killProcessTree(pid: number, options: KillProcessTreeOptions = {}): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return
  const platform = options.platform ?? process.platform
  const run = options.run ?? (async (command, args) => {
    await execFileAsync(command, args, { windowsHide: true, timeout: 10_000 })
  })

  if (options.dryRun) return

  if (platform === 'win32') {
    try {
      await run('taskkill', buildWindowsTaskkillArgs(pid))
    } catch {
      // Process may already have exited; best-effort only.
      try { process.kill(pid) } catch { /* ignore */ }
    }
    return
  }

  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    /* already gone */
  }
}
