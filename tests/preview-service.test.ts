import { mkdir, writeFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { PreviewMediaAllowlist } from '../src/main/preview-protocol'
import { allowPreviewFolder, PreviewRootTracker, previewRegister, previewStat } from '../src/main/preview-service'

const work = path.join(tmpdir(), `grok-preview-test-${Date.now()}`)
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(20)])

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
    await writeFile(file, pngBytes)
    roots.addDialogPath(file)
    const allow = new PreviewMediaAllowlist()
    const reg = await previewRegister(file, roots, allow)
    expect(reg.ok).toBe(true)
    if (reg.ok) {
      expect(reg.kind).toBe('image')
      expect(reg.loadVia === 'base64' || reg.loadVia === 'protocol').toBe(true)
    }
  })

  it('listed session cwds (sidebar projects A and B) are both previewable', async () => {
    const roots = new PreviewRootTracker()
    const projA = path.join(work, 'proj-a')
    const projB = path.join(work, 'proj-b')
    await mkdir(projA, { recursive: true })
    await mkdir(projB, { recursive: true })
    const pngA = path.join(projA, 'a.png')
    const pngB = path.join(projB, 'b.png')
    await writeFile(pngA, pngBytes)
    await writeFile(pngB, pngBytes)
    roots.registerListedSessionCwds([
      { id: 'session-a', cwd: projA },
      { id: 'session-b', cwd: projB }
    ])
    const allow = new PreviewMediaAllowlist()
    const regA = await previewRegister(pngA, roots, allow)
    const regB = await previewRegister(pngB, roots, allow)
    expect(regA.ok).toBe(true)
    expect(regB.ok).toBe(true)
  })

  it('allowPreviewFolder adds parent dir then register succeeds; UNC/.. stay rejected', async () => {
    const roots = new PreviewRootTracker()
    const listed = path.join(work, 'listed')
    const unlisted = path.join(work, 'unlisted')
    await mkdir(listed, { recursive: true })
    await mkdir(unlisted, { recursive: true })
    const file = path.join(unlisted, 'shot.png')
    const sibling = path.join(unlisted, 'other.png')
    const elsewhere = path.join(work, 'elsewhere', 'nope.png')
    await mkdir(path.join(work, 'elsewhere'), { recursive: true })
    await writeFile(file, pngBytes)
    await writeFile(sibling, pngBytes)
    await writeFile(elsewhere, pngBytes)
    roots.setSessionCwd('s1', listed)
    const allow = new PreviewMediaAllowlist()
    const first = await previewRegister(file, roots, allow)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.revealOnly).toBe(true)

    expect(allowPreviewFolder('\\\\server\\share\\a.png', roots).ok).toBe(false)
    expect(allowPreviewFolder('C:\\repo\\..\\secrets\\file.png', roots).ok).toBe(false)
    expect(allowPreviewFolder('C:\\repo\\file.png:Zone.Identifier', roots).ok).toBe(false)

    const allowed = allowPreviewFolder(file, roots)
    expect(allowed.ok).toBe(true)
    const retry = await previewRegister(file, roots, allow)
    expect(retry.ok).toBe(true)
    const sib = await previewRegister(sibling, roots, allow)
    expect(sib.ok).toBe(true)
    const blocked = await previewRegister(elsewhere, roots, allow)
    expect(blocked.ok).toBe(false)
  })

  it('main listSessions registers each listed session cwd', () => {
    const indexSrc = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/main/index.ts'),
      'utf8'
    )
    const start = indexSrc.indexOf("ipcMain.handle('grok:sessions'")
    expect(start).toBeGreaterThan(0)
    const body = indexSrc.slice(start, start + 400)
    expect(body).toContain('registerListedSessionCwds')
    expect(indexSrc).toContain("ipcMain.handle('preview:allow-folder'")
  })
})
