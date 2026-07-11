import { describe, expect, it } from 'vitest'
import { selectPermissionOutcome } from '../src/main/permissions'

describe('selectPermissionOutcome', () => {
  const options = [
    { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' }
  ]

  it('returns only an option supplied by the active ACP request', () => {
    expect(selectPermissionOutcome(options, 'once')).toEqual({ outcome: { outcome: 'selected', optionId: 'once' } })
  })

  it('rejects forged or stale option ids', () => {
    expect(() => selectPermissionOutcome(options, 'always')).toThrow('Invalid permission option')
  })
})
