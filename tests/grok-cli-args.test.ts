import { describe, expect, it } from 'vitest'
import { buildAgentArgs } from '../src/main/grok-cli'

describe('buildAgentArgs', () => {
  it('uses default agent stdio without always-approve', () => {
    expect(buildAgentArgs()).toEqual(['agent', '--no-leader', 'stdio'])
  })

  it('inserts always-approve before leader/stdio flags', () => {
    expect(buildAgentArgs({ alwaysApprove: true })).toEqual(['agent', '--always-approve', '--no-leader', 'stdio'])
  })
})
