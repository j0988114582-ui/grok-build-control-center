/**
 * Main-process readiness gate: only sessions created/loaded under the current
 * ACP connection generation may prompt / interject / cancel.
 */

export class SessionReadyGate {
  private generation = 0
  private readonly ready = new Map<string, number>()

  get currentGeneration(): number {
    return this.generation
  }

  /** New ACP connection epoch — nothing is ready until create/load. */
  beginConnection(): number {
    this.generation += 1
    this.ready.clear()
    return this.generation
  }

  /** Disconnect / process death. */
  invalidate(): void {
    this.generation += 1
    this.ready.clear()
  }

  markReady(sessionId: string): void {
    if (!sessionId || this.generation < 1) return
    this.ready.set(sessionId, this.generation)
  }

  clear(sessionId: string): void {
    this.ready.delete(sessionId)
  }

  isReady(sessionId: string): boolean {
    return Boolean(sessionId) && this.ready.get(sessionId) === this.generation
  }

  assertReady(sessionId: string): void {
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new Error('Invalid session id')
    }
    if (!this.isReady(sessionId)) {
      throw new Error('此對話尚未在目前連線就緒（請重新開啟後再送出）')
    }
  }
}
