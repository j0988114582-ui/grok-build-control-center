import { describe, expect, it } from 'vitest'
import {
  estimateDecodedBase64Bytes,
  extensionForImageMime,
  looksLikeImageBuffer,
  maxBase64CharsForByteLimit,
  PASTE_IMAGE_MAX_BYTES,
  preparePasteImagePayload,
  selectPasteFilesToDelete,
  stripDataUrlBase64
} from '../src/shared/paste-image'

describe('paste-image helpers', () => {
  it('maps supported image mime types to file extensions', () => {
    expect(extensionForImageMime('image/png')).toBe('png')
    expect(extensionForImageMime('image/jpeg')).toBe('jpeg')
    expect(extensionForImageMime('image/jpg')).toBe('jpeg')
    expect(extensionForImageMime('IMAGE/WEBP')).toBe('webp')
    expect(extensionForImageMime(' image/gif ')).toBe('gif')
  })

  it('rejects unsupported mime types', () => {
    expect(extensionForImageMime('image/svg+xml')).toBeNull()
    expect(extensionForImageMime('application/octet-stream')).toBeNull()
    expect(extensionForImageMime('')).toBeNull()
  })

  it('keeps the 20MB paste size ceiling aligned with attachments', () => {
    expect(PASTE_IMAGE_MAX_BYTES).toBe(20 * 1024 * 1024)
  })

  it('strips data-url prefixes before sizing', () => {
    expect(stripDataUrlBase64('data:image/png;base64,AAAA')).toBe('AAAA')
    expect(stripDataUrlBase64('AAAA')).toBe('AAAA')
  })

  it('estimates decoded size without allocating a buffer', () => {
    // "AAAA" decodes to 3 bytes (with no padding issues in estimate)
    expect(estimateDecodedBase64Bytes('AAAA')).toBe(3)
    expect(estimateDecodedBase64Bytes(stripDataUrlBase64('data:image/png;base64,AAAA'))).toBe(3)
    expect(estimateDecodedBase64Bytes('')).toBe(0)
    expect(estimateDecodedBase64Bytes('!!!!')).toBe(Number.POSITIVE_INFINITY)
  })

  it('rejects oversize payloads before decode via preparePasteImagePayload', () => {
    const hugeChars = maxBase64CharsForByteLimit(PASTE_IMAGE_MAX_BYTES) + 100
    const huge = 'A'.repeat(hugeChars)
    expect(() => preparePasteImagePayload('image/png', huge)).toThrow(/20MB/)
  })

  it('rejects estimated oversize even when char count is under the char ceiling', () => {
    // Build base64 whose estimated size exceeds a tiny limit
    const limit = 10
    const over = 'A'.repeat(maxBase64CharsForByteLimit(limit))
    expect(() => preparePasteImagePayload('image/png', over, limit)).toThrow(/20MB|上限/)
  })

  it('rejects empty, bad mime, and invalid base64 payload shapes', () => {
    expect(() => preparePasteImagePayload('image/png', '')).toThrow(/空/)
    expect(() => preparePasteImagePayload('image/svg+xml', 'AAAA')).toThrow(/不支援/)
    expect(() => preparePasteImagePayload('image/png', '@@@')).toThrow(/解碼失敗|空|上限/)
  })

  it('accepts a minimal valid-looking small payload', () => {
    // 1x1 PNG base64 is long; use tiny valid base64 "AQID" (~3 bytes) for prepare only
    const prepared = preparePasteImagePayload('image/png', 'AQID')
    expect(prepared.ext).toBe('png')
    expect(prepared.rawBase64).toBe('AQID')
    expect(prepared.estimatedBytes).toBeGreaterThan(0)
  })

  it('checks magic bytes for common image formats', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
    const garbage = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(looksLikeImageBuffer(png, 'png')).toBe(true)
    expect(looksLikeImageBuffer(jpeg, 'jpeg')).toBe(true)
    expect(looksLikeImageBuffer(garbage, 'png')).toBe(false)
    expect(looksLikeImageBuffer(garbage, 'jpeg')).toBe(false)
  })

  it('selects only aged paste-* image files for cleanup', () => {
    const now = 1_000_000
    const week = 7 * 24 * 60 * 60 * 1000
    const doomed = selectPasteFilesToDelete([
      { name: 'paste-old.png', mtimeMs: now - week - 1 },
      { name: 'paste-new.png', mtimeMs: now - 1000 },
      { name: 'notes.txt', mtimeMs: now - week - 1 },
      { name: 'paste-evil.exe', mtimeMs: now - week - 1 }
    ], now, week)
    expect(doomed).toEqual(['paste-old.png'])
  })
})
