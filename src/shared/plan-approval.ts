/**
 * Plan-mode approval over ACP.
 *
 * When the agent finishes planning it calls its `exit_plan_mode` tool. The CLI
 * intercepts that and forwards it to the *client* as the extension request
 * `_x.ai/exit_plan_mode`. A client that does not answer is treated as gone: the
 * CLI logs "exit_plan_mode: client disconnected mid-approval; plan mode stays
 * active", tells the model "Plan approval could not be completed because the
 * client disconnected", keeps plan mode Active, and ends the turn with
 * stopReason `cancelled`.
 *
 * Wire contract, verified against grok 1.0.3 by `work/plan_mode_acp_probe.mjs`:
 *   request  `_x.ai/exit_plan_mode` { sessionId, toolCallId, planContent }
 *   response ExitPlanModeExtResponse { approved: boolean, abandoned: boolean }
 *
 * The three decisions mirror the CLI's own plan approval view:
 *   approve         → leave plan mode and start implementing
 *   request-changes → send the agent back to planning (plan mode stays active)
 *   abandon         → drop the plan and turn plan mode off
 */

export const EXIT_PLAN_MODE_METHOD = '_x.ai/exit_plan_mode'

export type PlanApprovalDecision = 'approve' | 'request-changes' | 'abandon'

/** Parsed `_x.ai/exit_plan_mode` params plus the id the UI answers with. */
export type PlanApprovalRequest = {
  requestId: string
  sessionId: string
  toolCallId: string
  /** May be empty — the agent can exit plan mode without writing a plan. */
  planContent: string
}

export type ExitPlanModeResponse = {
  approved: boolean
  abandoned: boolean
}

const readString = (source: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value) return value
  }
  return ''
}

/**
 * Tolerant parse of the extension params. Returns null when there is no session
 * to attribute the request to — answering a request we cannot route would be
 * worse than letting the SDK reject it.
 */
export function parseExitPlanModeParams(
  params: unknown
): Omit<PlanApprovalRequest, 'requestId'> | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null
  const source = params as Record<string, unknown>
  const sessionId = readString(source, 'sessionId', 'session_id')
  if (!sessionId) return null
  const planContent = source.planContent ?? source.plan_content
  return {
    sessionId,
    toolCallId: readString(source, 'toolCallId', 'tool_call_id'),
    planContent: typeof planContent === 'string' ? planContent : ''
  }
}

export function buildExitPlanModeResponse(decision: PlanApprovalDecision): ExitPlanModeResponse {
  switch (decision) {
    case 'approve':
      return { approved: true, abandoned: false }
    case 'abandon':
      return { approved: false, abandoned: true }
    default:
      return { approved: false, abandoned: false }
  }
}

/**
 * What to answer when the dialog can never be answered — disconnect, quit, or a
 * cancelled turn. Never `approve`: a plan must not start building because a
 * connection dropped. `request-changes` keeps plan mode active, which is what
 * the CLI already expects to happen on a lost client.
 */
export const PLAN_APPROVAL_FALLBACK: PlanApprovalDecision = 'request-changes'

export function isPlanApprovalDecision(value: unknown): value is PlanApprovalDecision {
  return value === 'approve' || value === 'request-changes' || value === 'abandon'
}
