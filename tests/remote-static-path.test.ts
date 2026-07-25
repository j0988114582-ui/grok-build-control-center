import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { resolveWebRootPath } from '../src/main/remote-server'

const ROOT = path.resolve('C:/app/remote-web')
const inside = (result: string | null): boolean =>
  result !== null && !path.relative(ROOT, result).startsWith('..')

describe('remote static path containment', () => {
  it('serves normal asset paths from inside the web root', () => {
    expect(inside(resolveWebRootPath(ROOT, '/index.html'))).toBe(true)
    expect(inside(resolveWebRootPath(ROOT, '/assets/app.js'))).toBe(true)
    expect(resolveWebRootPath(ROOT, '/index.html')).toBe(path.join(ROOT, 'index.html'))
  })

  it('rejects traversal in every encoding the URL layer can hand us', () => {
    expect(resolveWebRootPath(ROOT, '/../secret.txt')).toBeNull()
    expect(resolveWebRootPath(ROOT, '/assets/../../secret.txt')).toBeNull()
    expect(resolveWebRootPath(ROOT, '/..%2f..%2fsecret.txt')).toBeNull()
    expect(resolveWebRootPath(ROOT, '/%2e%2e/secret.txt')).toBeNull()
  })

  // Windows-specific escapes the old `includes('..')` check never looked at.
  it('rejects Windows drive letters, UNC, device paths and ADS', () => {
    expect(resolveWebRootPath(ROOT, '/C:/Windows/win.ini')).toBeNull()
    expect(resolveWebRootPath(ROOT, '/C:Windows/win.ini')).toBeNull()
    expect(resolveWebRootPath(ROOT, '\\\\server\\share\\x')).toBeNull()
    expect(resolveWebRootPath(ROOT, '/%5C%5Cserver%5Cshare')).toBeNull()
    expect(resolveWebRootPath(ROOT, '/index.html:hidden')).toBeNull()
  })

  it('rejects undecodable, empty and NUL-bearing paths', () => {
    expect(resolveWebRootPath(ROOT, '/%E0%A4%A')).toBeNull()
    expect(resolveWebRootPath(ROOT, '/')).toBeNull()
    expect(resolveWebRootPath(ROOT, '//')).toBeNull()
    expect(resolveWebRootPath(ROOT, '/a%00b')).toBeNull()
  })

  it('never resolves to the root directory itself', () => {
    expect(resolveWebRootPath(ROOT, '/.')).toBeNull()
  })
})
