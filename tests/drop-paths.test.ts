import { describe, expect, it } from 'vitest'
import {
  appendPathLines,
  isAbsoluteLocalPath,
  isImageMime,
  isImagePath,
  removePathLine,
  stripDuplicateImagePathLines,
  upsertPathChips
} from '../src/shared/drop-paths'

describe('drop-paths (P-DRAG)', () => {
  it('detects absolute Windows paths and image hints', () => {
    expect(isAbsoluteLocalPath('C:\\Users\\me\\a.png')).toBe(true)
    expect(isAbsoluteLocalPath('relative\\a.png')).toBe(false)
    expect(isImagePath('C:\\a.PNG')).toBe(true)
    expect(isImagePath('C:\\a.txt')).toBe(false)
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('text/plain')).toBe(false)
  })

  it('appends one absolute path per line', () => {
    expect(appendPathLines('', ['C:\\a.txt', 'C:\\b'])).toBe('C:\\a.txt\nC:\\b')
    expect(appendPathLines('hello', ['C:\\a.txt'])).toBe('hello\nC:\\a.txt')
  })

  it('strips draft lines that duplicate image attachment paths', () => {
    const draft = '請看這張圖\nC:\\img.png\n其他'
    expect(stripDuplicateImagePathLines(draft, ['C:\\img.png'])).toBe('請看這張圖\n其他')
  })

  it('removes a single path chip line', () => {
    expect(removePathLine('C:\\a\nC:\\b\nC:\\a', 'C:\\a')).toBe('C:\\b')
  })

  it('upserts path chips by path', () => {
    const next = upsertPathChips(
      [{ path: 'C:\\a', isDirectory: false }],
      [{ path: 'C:\\a', isDirectory: true }, { path: 'C:\\b' }]
    )
    expect(next).toEqual([
      { path: 'C:\\a', isDirectory: true },
      { path: 'C:\\b' }
    ])
  })
})
