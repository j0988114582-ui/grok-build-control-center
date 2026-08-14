import { describe, expect, it } from 'vitest'
import {
  buildExitPlanModeResponse,
  EXIT_PLAN_MODE_METHOD,
  isPlanApprovalDecision,
  parseExitPlanModeParams,
  PLAN_APPROVAL_FALLBACK
} from '../src/shared/plan-approval'

/**
 * Contract verified live against grok 1.0.3 by work/plan_mode_acp_probe.mjs:
 * leaving `_x.ai/exit_plan_mode` unanswered gets -32601 and the CLI cancels the
 * turn with "client disconnected mid-approval".
 */
describe('plan-approval (_x.ai/exit_plan_mode)', () => {
  it('uses the underscore-prefixed extension method, like the other x.ai extensions', () => {
    expect(EXIT_PLAN_MODE_METHOD).toBe('_x.ai/exit_plan_mode')
  })

  it('parses the agent request', () => {
    expect(parseExitPlanModeParams({
      sessionId: 's1',
      toolCallId: 'call-9',
      planContent: '# 計畫\n先做 A 再做 B'
    })).toEqual({ sessionId: 's1', toolCallId: 'call-9', planContent: '# 計畫\n先做 A 再做 B' })
  })

  it('accepts snake_case and an absent plan (the agent may exit without writing one)', () => {
    expect(parseExitPlanModeParams({ session_id: 's2', tool_call_id: 'call-1' }))
      .toEqual({ sessionId: 's2', toolCallId: 'call-1', planContent: '' })
    expect(parseExitPlanModeParams({ sessionId: 's3', planContent: 42 }))
      .toEqual({ sessionId: 's3', toolCallId: '', planContent: '' })
  })

  it('refuses params with no session to route to', () => {
    for (const bad of [null, undefined, 'nope', [], {}, { sessionId: '' }, { sessionId: 7 }]) {
      expect(parseExitPlanModeParams(bad)).toBeNull()
    }
  })

  it('maps the three decisions onto ExitPlanModeExtResponse', () => {
    expect(buildExitPlanModeResponse('approve')).toEqual({ approved: true, abandoned: false })
    expect(buildExitPlanModeResponse('request-changes')).toEqual({ approved: false, abandoned: false })
    expect(buildExitPlanModeResponse('abandon')).toEqual({ approved: false, abandoned: true })
  })

  /** A dropped connection must never read as consent to start building. */
  it('never approves as a fallback', () => {
    expect(buildExitPlanModeResponse(PLAN_APPROVAL_FALLBACK).approved).toBe(false)
    expect(PLAN_APPROVAL_FALLBACK).toBe('request-changes')
  })

  it('guards the IPC boundary against junk decisions', () => {
    expect(isPlanApprovalDecision('approve')).toBe(true)
    expect(isPlanApprovalDecision('request-changes')).toBe(true)
    expect(isPlanApprovalDecision('abandon')).toBe(true)
    for (const bad of ['approved', 'yes', '', null, undefined, 1, {}]) {
      expect(isPlanApprovalDecision(bad)).toBe(false)
    }
  })
})
