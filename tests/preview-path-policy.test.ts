import { describe, expect, it } from 'vitest'
import {
  fromGrokPreviewUrl,
  isPathInsideRoots,
  kindFromPath,
  mimeForPreviewPath,
  normalizePreviewPathKey,
  rejectUnsafePreviewPath,
  toGrokPreviewUrl
} from '../src/shared/preview-path-policy'

describe('preview-path-policy', () => {
  it('accepts normal Windows image paths', () => {
    expect(rejectUnsafePreviewPath('C:\\repo\\out\\shot.png')).toBeNull()
    expect(kindFromPath('C:\\repo\\out\\shot.png')).toBe('image')
    expect(mimeForPreviewPath('C:\\repo\\out\\photo.jpg')).toBe('image/jpeg')
  })

  it('rejects path traversal with ..', () => {
    expect(rejectUnsafePreviewPath('C:\\repo\\..\\secrets\\file.png')).toMatch(/上層目錄/)
    expect(rejectUnsafePreviewPath('C:\\repo\\foo\\..\\..\\Windows\\file.png')).toMatch(/上層目錄/)
  })

  it('rejects UNC network paths', () => {
    expect(rejectUnsafePreviewPath('\\\\server\\share\\photo.png')).toMatch(/UNC/)
    expect(rejectUnsafePreviewPath('//server/share/photo.png')).toMatch(/UNC/)
  })

  it('rejects device paths', () => {
    expect(rejectUnsafePreviewPath('\\\\.\\C:\\foo.png')).toMatch(/裝置/)
    expect(rejectUnsafePreviewPath('//./C:/foo.png')).toMatch(/裝置/)
  })

  it('rejects NTFS alternate data streams', () => {
    expect(rejectUnsafePreviewPath('C:\\repo\\file.png:evil')).toMatch(/替代資料流/)
    expect(rejectUnsafePreviewPath('C:\\repo\\file.png:Zone.Identifier')).toMatch(/替代資料流/)
  })

  it('rejects trailing dots/spaces in segments', () => {
    expect(rejectUnsafePreviewPath('C:\\repo\\evil. \\file.png')).toMatch(/點或空白/)
    expect(rejectUnsafePreviewPath('C:\\repo\\evil.\\file.png')).toMatch(/點或空白/)
  })

  it('rejects reserved device names (CON/NUL)', () => {
    expect(rejectUnsafePreviewPath('C:\\repo\\CON.png')).toMatch(/保留/)
    expect(rejectUnsafePreviewPath('C:\\repo\\NUL.txt')).toMatch(/保留/)
    expect(rejectUnsafePreviewPath('C:\\repo\\com1\\file.png')).toMatch(/保留/)
  })

  it('rejects non-absolute and empty paths', () => {
    expect(rejectUnsafePreviewPath('relative\\file.png')).toMatch(/絕對/)
    expect(rejectUnsafePreviewPath('')).toMatch(/無效/)
    expect(rejectUnsafePreviewPath(null)).toMatch(/無效/)
  })

  it('rejects non-whitelist extensions', () => {
    expect(rejectUnsafePreviewPath('C:\\repo\\payload.exe')).toMatch(/暫不支援/)
    expect(rejectUnsafePreviewPath('C:\\repo\\data.bin')).toMatch(/暫不支援/)
  })

  it('normalizes case for root comparison (Windows)', () => {
    const roots = ['C:\\Users\\Demo\\Project']
    expect(isPathInsideRoots('c:\\users\\demo\\project\\out\\a.png', roots)).toBe(true)
    expect(isPathInsideRoots('C:\\Users\\Demo\\Project\\sub\\b.mp4', roots)).toBe(true)
    expect(isPathInsideRoots('C:\\Users\\Demo\\Other\\a.png', roots)).toBe(false)
    expect(normalizePreviewPathKey('C:\\Users\\Demo\\Project\\')).toBe('c:\\users\\demo\\project')
  })

  it('handles \\\\?\\ long-path prefix for drive paths', () => {
    expect(rejectUnsafePreviewPath('\\\\?\\C:\\repo\\shot.png')).toBeNull()
    expect(normalizePreviewPathKey('\\\\?\\C:\\repo\\shot.png')).toBe('c:\\repo\\shot.png')
    expect(isPathInsideRoots('\\\\?\\C:\\repo\\shot.png', ['C:\\repo'])).toBe(true)
  })

  it('round-trips protocol URL encode/decode', () => {
    const abs = 'C:\\Users\\demo\\media\\clip.mp4'
    const url = toGrokPreviewUrl(abs)
    expect(url.startsWith('grok-preview://local/')).toBe(true)
    expect(fromGrokPreviewUrl(url)).toBe(abs)
    // Double-encoded safety: decode once only
    const weird = 'grok-preview://local/' + encodeURIComponent('D:\\a\\b.png')
    expect(fromGrokPreviewUrl(weird)).toBe('D:\\a\\b.png')
  })

  it('classifies video/html/code extensions', () => {
    expect(kindFromPath('C:\\a\\v.webm')).toBe('video')
    expect(kindFromPath('C:\\a\\page.HTML')).toBe('html')
    expect(kindFromPath('C:\\a\\main.ts')).toBe('code')
    expect(kindFromPath('C:\\a\\readme.md')).toBe('code')
  })

  it('root equality allows exact file roots', () => {
    const file = 'C:\\Temp\\paste\\shot.png'
    expect(isPathInsideRoots(file, [file])).toBe(true)
    expect(isPathInsideRoots('C:\\Temp\\paste\\other.png', [file])).toBe(false)
    expect(isPathInsideRoots('C:\\Temp\\paste\\other.png', ['C:\\Temp\\paste'])).toBe(true)
  })
})
