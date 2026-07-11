import { describe, expect, it } from 'vitest'
import { selectedFilesToPrompt } from '../src/shared/attachments'

describe('selectedFilesToPrompt', () => {
  const image = { path: 'C:\\shot.png', name: 'shot.png', mimeType: 'image/png', data: 'abc' }

  it('uses an image block only when the ACP agent advertises image support', () => {
    expect(selectedFilesToPrompt([image], true)).toEqual({ blocks: [{ type: 'image', data: 'abc', mimeType: 'image/png', name: 'shot.png' }], paths: '' })
  })

  it('falls back to an absolute path when image content is unsupported', () => {
    expect(selectedFilesToPrompt([image], false)).toEqual({ blocks: [], paths: 'C:\\shot.png' })
  })
})
