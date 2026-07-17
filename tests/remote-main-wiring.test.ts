import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const indexSrc = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/main/index.ts'),
  'utf8'
)

describe('remote main composition (wave2)', () => {
  it('injects RemoteController ACP wrappers required by phone routes', () => {
    // Fail closed if deps regress to wave-0 stubs (routes would return not_ready)
    expect(indexSrc).toMatch(/loadSession:\s*async\s*\(/)
    expect(indexSrc).toMatch(/createSession:\s*async\s*\(/)
    expect(indexSrc).toMatch(/setModel:\s*async\s*\(/)
    expect(indexSrc).toMatch(/setMode:\s*async\s*\(/)
    expect(indexSrc).toMatch(/interject:\s*async\s*\(/)
    expect(indexSrc).toMatch(/setPermissionMode:\s*async/)
    expect(indexSrc).toMatch(/applyAgentPermissionMode/)
    expect(indexSrc).toMatch(/restoreFocusAfterReconnect/)
    expect(indexSrc).toMatch(/sessionReadyGate\.markReady/)
    expect(indexSrc).toMatch(/previewRoots\.setSessionCwd/)
  })
})
