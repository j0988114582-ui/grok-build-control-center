import path from 'node:path'
import { parseGrokVersion } from './grok-cli'

export const GROK_INSTALLER_URL = 'https://x.ai/cli/install.ps1'

export type ExecuteFileOptions = {
  windowsHide?: boolean
  timeout?: number
  maxBuffer?: number
  env?: NodeJS.ProcessEnv
}

export type ExecuteFile = (
  executable: string,
  args: string[],
  options: ExecuteFileOptions
) => Promise<{ stdout: string; stderr: string }>

export type GrokInstallDependencies = {
  downloadText(url: string): Promise<string>
  makeTempDirectory(): Promise<string>
  writeTextFile(file: string, value: string): Promise<void>
  removeDirectory(directory: string): Promise<void>
  assertFileExists(file: string): Promise<void>
  executeFile: ExecuteFile
  environment?: NodeJS.ProcessEnv
}

export type InstalledGrok = {
  executable: string
  version: string
  revision?: string
}

const validInstaller = (value: string): boolean =>
  value.length >= 200 && value.length <= 1_048_576 && !/^\s*<(!doctype|html)/i.test(value) && /grok/i.test(value)

const GROK_INSTALL_OVERRIDE_VARIABLES = new Set([
  'GROK_BIN_DIR', 'GROK_CHANNEL', 'GROK_VERSION', 'GROK_DEPLOYMENT_KEY', 'GROK_HOME'
])

export function createGrokInstallerEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment = { ...source }
  for (const variable of Object.keys(environment)) {
    if (GROK_INSTALL_OVERRIDE_VARIABLES.has(variable.toUpperCase())) delete environment[variable]
  }
  return environment
}

export async function installGrokCli(homeDir: string, dependencies: GrokInstallDependencies): Promise<InstalledGrok> {
  const tempDirectory = await dependencies.makeTempDirectory()
  const installer = path.join(tempDirectory, 'install.ps1')
  try {
    const source = await dependencies.downloadText(GROK_INSTALLER_URL)
    if (!validInstaller(source)) throw new Error('官方 Grok 安裝程式內容無效，已停止執行')
    await dependencies.writeTextFile(installer, source)
    await dependencies.executeFile('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', installer
    ], {
      windowsHide: true,
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024,
      env: dependencies.environment
    })

    const executable = path.join(homeDir, '.grok', 'bin', 'grok.exe')
    await dependencies.assertFileExists(executable)
    const { stdout } = await dependencies.executeFile(executable, ['--version'], { windowsHide: true, timeout: 10_000 })
    const parsed = parseGrokVersion(stdout)
    if (!parsed) throw new Error('Grok CLI 已下載，但無法驗證版本')
    return { executable, ...parsed }
  } finally {
    try {
      await dependencies.removeDirectory(tempDirectory)
    } catch {
      // Temporary cleanup is best-effort and must not mask install success or its real failure.
    }
  }
}

export async function reauthenticateGrok(executable: string, executeFile: ExecuteFile): Promise<void> {
  await executeFile(executable, ['login', '--oauth'], { windowsHide: true, timeout: 300_000, maxBuffer: 4 * 1024 * 1024 })
}

export async function readConnectedCapabilities<T>(connect: () => Promise<{ start(): Promise<T> }>): Promise<T> {
  return (await connect()).start()
}

export async function runReauthenticationLifecycle<T>(operations: {
  disconnect(): void
  login(): Promise<void>
  connect(): Promise<T>
}): Promise<T> {
  operations.disconnect()
  await operations.login()
  operations.disconnect()
  return operations.connect()
}

export class SingleLifecycleOperation {
  private active: string | null = null
  private sharedCount = 0
  private sharedLabel: string | null = null

  assertIdle(): void {
    if (this.active) throw new Error(`${this.active}正在進行中，請完成後再試`)
    if (this.sharedCount > 0) throw new Error(`${this.sharedLabel ?? 'Grok 工作'}正在進行中，請完成後再試`)
  }

  async run<T>(label: string, operation: () => Promise<T>): Promise<T> {
    this.assertIdle()
    this.active = label
    try {
      return await operation()
    } finally {
      this.active = null
    }
  }

  async runShared<T>(label: string, operation: () => Promise<T>): Promise<T> {
    if (this.active) throw new Error(`${this.active}正在進行中，請完成後再試`)
    this.sharedCount += 1
    this.sharedLabel ??= label
    try {
      return await operation()
    } finally {
      this.sharedCount -= 1
      if (this.sharedCount === 0) this.sharedLabel = null
    }
  }
}
