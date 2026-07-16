import { describe, expect, it } from 'vitest'
import { extensionForImageMime, PASTE_IMAGE_MAX_BYTES } from '../src/shared/paste-image'

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
})
