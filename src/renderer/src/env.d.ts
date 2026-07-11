import type { GrokBridgeApi } from '../../shared/bridge'

declare global {
  interface Window { grokApi: GrokBridgeApi }
}

export {}
