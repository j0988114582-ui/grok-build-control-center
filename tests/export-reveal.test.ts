import { describe, expect, it } from 'vitest'
import { assertRevealAllowed, ExportPathAllowlist } from '../src/shared/export-reveal'

describe('export-reveal allowlist', () => {
  it('registers and allows only exported absolute paths', () => {
    const list = new ExportPathAllowlist()
    const file = 'C:\\Users\\demo\\exports\\out.md'
    list.register(file)
    expect(assertRevealAllowed(list, file)).toBe(file)
    expect(() => assertRevealAllowed(list, 'C:\\Users\\demo\\secrets.txt')).toThrow(/只能開啟/)
    expect(() => assertRevealAllowed(list, 'relative.md')).toThrow()
  })
})
