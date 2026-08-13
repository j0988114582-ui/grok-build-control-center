import type { GrokBridgeApi } from '../../shared/bridge'
import type { ModelState, SessionSummary, UiSessionEvent } from '../../shared/types'

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
    }
  }
}

export {}
