import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { PreviewMediaAllowlist } from '../src/main/preview-protocol'
import { PreviewRootTracker, previewRegister, previewStat } from '../src/main/preview-service'

const work = path.join(tmpdir(), `grok-preview-test-${Date.now()}`)

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

describe('preview-service roots + register', () => {
  it('rejects paths outside session/paste/dialog roots with Chinese reason', async () => {
    const roots = new PreviewRootTracker()
    roots.setSessionCwd('s1', path.join(work, 'project'))
    await mkdir(path.join(work, 'project'), { recursive: true })
    await mkdir(path.join(work, 'outside'), { recursive: true })
    const outside = path.join(work, 'outside', 'secret.png')
    await writeFile(outside, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))
    const result = await previewStat(outside, roots)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/工作區外|允許/)
  })

  it('accepts files under session cwd and registers protocol for video', async () => {
    const roots = new PreviewRootTracker()
    const cwd = path.join(work, 'proj')
    roots.setSessionCwd('s1', cwd)
    await mkdir(cwd, { recursive: true })
    const video = path.join(cwd, 'clip.mp4')
    await writeFile(video, Buffer.alloc(64, 1))
    const allow = new PreviewMediaAllowlist()
    const reg = await previewRegister(video, roots, allow)
    expect(reg.ok).toBe(true)
    if (reg.ok) {
      expect(reg.kind).toBe('video')
      expect(reg.loadVia).toBe('protocol')
      expect(reg.protocolUrl).toMatch(/^grok-preview:\/\//)
    }
  })

  it('rejects traversal and non-whitelist extensions via IPC-facing helpers', async () => {
    const roots = new PreviewRootTracker()
    roots.setSessionCwd('s1', 'C:\\Users\\demo\\proj')
    const allow = new PreviewMediaAllowlist()
    const cases = [
      'C:\\Users\\demo\\proj\\..\\..\\Windows\\system32\\x.png',
      '\\\\server\\share\\a.png',
      'C:\\Users\\demo\\proj\\tool.exe',
      'relative\\a.png'
    ]
    for (const file of cases) {
      const st = await previewStat(file, roots)
      expect(st.ok).toBe(false)
      if (!st.ok) expect(st.reason.length).toBeGreaterThan(0)
      const reg = await previewRegister(file, roots, allow)
      expect(reg.ok).toBe(false)
      if (!reg.ok) expect(reg.reason.length).toBeGreaterThan(0)
    }
  })

  it('dialog registration allows the selected file', async () => {
    const roots = new PreviewRootTracker()
    const dir = path.join(work, 'picked')
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, 'shot.png')
    // minimal PNG header
    await writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(20)]))
    roots.addDialogPath(file)
    const allow = new PreviewMediaAllowlist()
    const reg = await previewRegister(file, roots, allow)
    expect(reg.ok).toBe(true)
    if (reg.ok) {
      expect(reg.kind).toBe('image')
      expect(reg.loadVia === 'base64' || reg.loadVia === 'protocol').toBe(true)
    }
  })
})
