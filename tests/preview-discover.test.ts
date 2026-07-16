import { describe, expect, it } from 'vitest'
import {
  discoverCodeFences,
  discoverFilePaths,
  discoverMarkdownImages,
  discoverPreviewCandidates,
  isMediaPreviewItem
} from '../src/shared/preview-discover'

describe('preview-discover', () => {
  const sessionId = 's-preview-1'
  const cwd = 'C:\\Users\\demo\\project'

  it('finds Windows absolute paths with previewable extensions', () => {
    const text = 'Wrote C:\\Users\\demo\\project\\out\\diagram.png and ignored C:\\Users\\demo\\project\\out\\secret.exe'
    const items = discoverFilePaths(text, sessionId, cwd, 1000)
    expect(items.some((item) => item.label === 'diagram.png' && item.kind === 'image')).toBe(true)
    expect(items.some((item) => item.label === 'secret.exe')).toBe(false)
  })

  it('resolves relative paths under cwd', () => {
    const text = 'see screenshots\\ui\\main.webp for result'
    const items = discoverFilePaths(text, sessionId, cwd, 1000)
    expect(items).toHaveLength(1)
    expect(items[0].source).toMatchObject({ type: 'file' })
    if (items[0].source.type === 'file') {
      expect(items[0].source.path.toLowerCase()).toContain('screenshots\\ui\\main.webp')
    }
  })

  it('discovers markdown local and remote images', () => {
    const text = [
      '![local](./assets/hero.png)',
      '![remote](https://cdn.example.com/a/photo.jpg)',
      '![page](https://example.com/index.html)'
    ].join('\n')
    const items = discoverMarkdownImages(text, sessionId, cwd, 2000)
    expect(items.some((item) => item.kind === 'image')).toBe(true)
    expect(items.some((item) => item.kind === 'remote-image')).toBe(true)
    expect(items.some((item) => item.source.type === 'remote-url' && item.source.url.includes('index.html'))).toBe(false)
  })

  it('discovers fenced code blocks with language and hash', () => {
    const text = '```typescript\nexport const x = 1\nconsole.log(x)\n```\n```\nshort\n```'
    const items = discoverCodeFences(text, sessionId, 3000)
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(items[0].kind).toBe('code')
    expect(items[0].source.type).toBe('inline-code')
    if (items[0].source.type === 'inline-code') {
      expect(items[0].source.language).toBe('typescript')
      expect(items[0].source.hash).toBeTruthy()
    }
  })

  it('dedupes and caps at max items, newest first', () => {
    const existing = discoverPreviewCandidates('C:\\Users\\demo\\project\\a.png', {
      sessionId, cwd, nowMs: 1, maxItems: 50
    })
    const text = [
      'C:\\Users\\demo\\project\\a.png',
      'C:\\Users\\demo\\project\\b.mp4',
      '```js\nconst n = 2\nconsole.log(n * n)\n```'
    ].join('\n')
    const merged = discoverPreviewCandidates(text, {
      sessionId, cwd, nowMs: 99, existing, maxItems: 50
    })
    const pngs = merged.filter((item) => item.label === 'a.png')
    expect(pngs).toHaveLength(1)
    expect(merged[0].discoveredAt).toBeGreaterThanOrEqual(merged[merged.length - 1].discoveredAt)
  })

  it('respects maxItems cap of 50 by default semantics', () => {
    const paths = Array.from({ length: 60 }, (_, i) => `C:\\Users\\demo\\project\\f${i}.png`).join('\n')
    const items = discoverPreviewCandidates(paths, { sessionId, cwd, nowMs: 5, maxItems: 50 })
    expect(items.length).toBe(50)
  })

  it('marks media kinds for auto-preview filter', () => {
    const items = discoverPreviewCandidates(
      'C:\\Users\\demo\\project\\a.png\nhttps://x.test/z.jpg\n![r](https://x.test/z.jpg)',
      { sessionId, cwd, nowMs: 1 }
    )
    const media = items.filter(isMediaPreviewItem)
    expect(media.length).toBeGreaterThan(0)
    expect(media.every((item) => item.kind === 'image' || item.kind === 'video' || item.kind === 'remote-image')).toBe(true)
  })
})
