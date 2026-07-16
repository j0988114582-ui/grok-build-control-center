import type { GrokBridgeApi } from '../../shared/bridge'
import type { SessionSummary } from '../../shared/types'

declare global {
  interface Window {
    grokApi: GrokBridgeApi
    /** Electron smoke harness only (preview C13); not a product API. */
    __grokSmoke?: {
      activateSession: (session: SessionSummary) => void
      openPreviewPath: (filePath: string) => void
    }
  }
}

export {}
