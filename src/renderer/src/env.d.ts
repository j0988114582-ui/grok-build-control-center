import type { GrokBridgeApi } from '../../shared/bridge'
import type { PlanApprovalRequest } from '../../shared/plan-approval'
import type { ModelState, PermissionRequest, SessionSummary, UiSessionEvent } from '../../shared/types'

declare global {
  interface Window {
    grokApi: GrokBridgeApi
    /** Electron smoke harness only (preview C13); not a product API. */
    __grokSmoke?: {
      activateSession: (session: SessionSummary) => void
      setModelState: (models: ModelState | undefined) => void
      seedSessionEvents: (sessionId: string, events: UiSessionEvent[]) => void
      appendSessionEvent: (event: UiSessionEvent) => void
      openPreviewPath: (filePath: string) => void
      enqueuePlanApproval: (request: PlanApprovalRequest) => void
      enqueuePermission: (request: PermissionRequest) => void
      seedSessions: (sessions: SessionSummary[]) => void
      clearPermissions: () => void
      setCommands: (commands: import('../../shared/types').AgentCapabilities['commands']) => void
      dropLocalPaths: (sessionId: string, paths: string[]) => void
      getActiveSessionId: () => string | null
      getSessionEvents: (sessionId?: string) => UiSessionEvent[]
    }
  }
}

export {}
