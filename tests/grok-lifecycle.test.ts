import { describe, expect, it, vi } from 'vitest'
import {
  createGrokInstallerEnvironment,
  GROK_INSTALLER_URL,
  readConnectedCapabilities,
  runReauthenticationLifecycle,
  SingleLifecycleOperation,
  installGrokCli,
  reauthenticateGrok
} from '../src/main/grok-lifecycle'

const validInstaller = `# xAI Grok Build installer\n$installRoot = Join-Path $HOME '.grok'\nWrite-Output 'Installing grok.exe from x.ai'\n${'x'.repeat(180)}`

const createDependencies = () => {
  const files = new Map<string, string>()
  return {
    files,
    deps: {
      downloadText: vi.fn().mockResolvedValue(validInstaller),
      makeTempDirectory: vi.fn().mockResolvedValue('C:\\Temp\\grok-gui-123'),
      writeTextFile: vi.fn(async (file: string, value: string) => { files.set(file, value) }),
      removeDirectory: vi.fn(async (directory: string) => {
        for (const file of files.keys()) if (file.startsWith(directory)) files.delete(file)
      }),
      assertFileExists: vi.fn().mockResolvedValue(undefined),
      executeFile: vi.fn(async (executable: string, args: string[]) => {
        if (executable.endsWith('grok.exe') && args[0] === '--version') return { stdout: 'grok 0.2.93 (f00f96316d) [stable]\n', stderr: '' }
        return { stdout: 'installed', stderr: '' }
      })
    }
  }
}

describe('Grok lifecycle', () => {
  it('downloads the fixed official installer, executes a temporary file, verifies the binary, and cleans up', async () => {
    const { deps } = createDependencies()

    const result = await installGrokCli('C:\\Users\\newbie', deps)

    expect(deps.downloadText).toHaveBeenCalledWith(GROK_INSTALLER_URL)
    expect(deps.writeTextFile).toHaveBeenCalledWith('C:\\Temp\\grok-gui-123\\install.ps1', validInstaller)
    expect(deps.executeFile).toHaveBeenNthCalledWith(1, 'powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Temp\\grok-gui-123\\install.ps1'
    ], expect.objectContaining({ timeout: 300_000, windowsHide: true }))
    expect(deps.assertFileExists).toHaveBeenCalledWith('C:\\Users\\newbie\\.grok\\bin\\grok.exe')
    expect(deps.executeFile).toHaveBeenNthCalledWith(2, 'C:\\Users\\newbie\\.grok\\bin\\grok.exe', ['--version'], expect.objectContaining({ timeout: 10_000 }))
    expect(deps.removeDirectory).toHaveBeenCalledWith('C:\\Temp\\grok-gui-123')
    expect(result).toEqual({ executable: 'C:\\Users\\newbie\\.grok\\bin\\grok.exe', version: '0.2.93', revision: 'f00f96316d' })
  })

  it('rejects an HTML or truncated installer before execution and still removes the temporary directory', async () => {
    const { deps } = createDependencies()
    deps.downloadText.mockResolvedValue('<html>gateway error</html>')

    await expect(installGrokCli('C:\\Users\\newbie', deps)).rejects.toThrow('官方 Grok 安裝程式內容無效')

    expect(deps.executeFile).not.toHaveBeenCalled()
    expect(deps.removeDirectory).toHaveBeenCalledWith('C:\\Temp\\grok-gui-123')
  })

  it('rejects an unexpectedly large installer payload before writing or executing it', async () => {
    const { deps } = createDependencies()
    deps.downloadText.mockResolvedValue(`# Grok installer\n${'x'.repeat(1_048_577)}`)

    await expect(installGrokCli('C:\\Users\\newbie', deps)).rejects.toThrow('官方 Grok 安裝程式內容無效')

    expect(deps.writeTextFile).not.toHaveBeenCalled()
    expect(deps.executeFile).not.toHaveBeenCalled()
  })

  it('does not turn a successful install into a failure when temporary cleanup is blocked', async () => {
    const { deps } = createDependencies()
    deps.removeDirectory.mockRejectedValue(new Error('antivirus lock'))

    await expect(installGrokCli('C:\\Users\\newbie', deps)).resolves.toMatchObject({ version: '0.2.93' })
  })

  it('removes Grok installer override variables while preserving ordinary environment values', () => {
    const environment = createGrokInstallerEnvironment({
      PATH: 'C:\\Windows',
      HTTPS_PROXY: 'http://proxy.local',
      GROK_BIN_DIR: 'D:\\untrusted',
      GROK_CHANNEL: 'alpha',
      GROK_VERSION: '0.0.1',
      GROK_DEPLOYMENT_KEY: 'secret',
      GROK_HOME: 'D:\\other-home',
      Grok_Bin_Dir: 'D:\\mixed-bin',
      grok_channel: 'nightly',
      Grok_Version: '0.0.2',
      grok_deployment_key: 'mixed-secret',
      grok_home: 'D:\\mixed-home'
    })

    expect(environment).toMatchObject({ PATH: 'C:\\Windows', HTTPS_PROXY: 'http://proxy.local' })
    expect(environment).not.toHaveProperty('GROK_BIN_DIR')
    expect(environment).not.toHaveProperty('GROK_CHANNEL')
    expect(environment).not.toHaveProperty('GROK_VERSION')
    expect(environment).not.toHaveProperty('GROK_DEPLOYMENT_KEY')
    expect(environment).not.toHaveProperty('GROK_HOME')
    expect(Object.keys(environment).filter((key) => key.toUpperCase().startsWith('GROK_'))).toEqual([])
  })

  it('runs the official OAuth reauthentication command without logging out or handling credentials itself', async () => {
    const executeFile = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })

    await reauthenticateGrok('C:\\Users\\demo\\.grok\\bin\\grok.exe', executeFile)

    expect(executeFile).toHaveBeenCalledWith(
      'C:\\Users\\demo\\.grok\\bin\\grok.exe',
      ['login', '--oauth'],
      expect.objectContaining({ timeout: 300_000, windowsHide: true })
    )
  })

  it('returns serializable capabilities from a connected client instead of returning the client instance', async () => {
    const capabilities = { loadSession: true, modes: [], commands: [] }
    const client = { start: vi.fn().mockResolvedValue(capabilities) }

    await expect(readConnectedCapabilities(async () => client)).resolves.toBe(capabilities)
    expect(client.start).toHaveBeenCalledTimes(1)
  })

  it('disconnects both before and after OAuth so concurrent old-account clients cannot be reused', async () => {
    const calls: string[] = []
    const capabilities = { commands: [], modes: [] }

    await expect(runReauthenticationLifecycle({
      disconnect: () => { calls.push('disconnect') },
      login: async () => { calls.push('login') },
      connect: async () => { calls.push('connect'); return capabilities }
    })).resolves.toBe(capabilities)

    expect(calls).toEqual(['disconnect', 'login', 'disconnect', 'connect'])
  })

  it('rejects overlapping install or login operations and unlocks after completion', async () => {
    const gate = new SingleLifecycleOperation()
    let release!: () => void
    const first = gate.run('安裝 Grok CLI', () => new Promise<void>((resolve) => { release = resolve }))

    expect(() => gate.assertIdle()).toThrow('安裝 Grok CLI正在進行中')
    await expect(gate.run('切換帳號', async () => undefined)).rejects.toThrow('安裝 Grok CLI正在進行中')
    release()
    await first
    expect(() => gate.assertIdle()).not.toThrow()
    await expect(gate.run('切換帳號', async () => 'ok')).resolves.toBe('ok')
  })

  it('keeps lifecycle operations exclusive while allowing ordinary ACP operations to share the gate', async () => {
    const gate = new SingleLifecycleOperation()
    let releaseShared!: () => void
    const shared = gate.runShared('Grok 工作', () => new Promise<void>((resolve) => { releaseShared = resolve }))

    await expect(gate.run('切換帳號', async () => undefined)).rejects.toThrow('Grok 工作正在進行中')
    releaseShared()
    await shared

    let releaseExclusive!: () => void
    const exclusive = gate.run('切換帳號', () => new Promise<void>((resolve) => { releaseExclusive = resolve }))
    await expect(gate.runShared('Grok 連線', async () => undefined)).rejects.toThrow('切換帳號正在進行中')
    releaseExclusive()
    await exclusive
  })
})
