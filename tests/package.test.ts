import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')

describe('public installer legal artifacts', () => {
  it('packages the project license, privacy notice, and generated third-party notices', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as { build?: { files?: string[] } }
    expect(manifest.build?.files).toEqual(expect.arrayContaining([
      'LICENSE', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.txt'
    ]))

    const notices = await readFile(path.join(root, 'THIRD_PARTY_NOTICES.txt'), 'utf8')
    expect(notices).toContain('@agentclientprotocol/sdk')
    expect(notices).toContain('MIT License')
  })
})
