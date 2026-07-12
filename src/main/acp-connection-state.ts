export class AcpConnectionState<T> {
  private generation = 0
  private active: T | null = null

  get current(): T | null {
    return this.active
  }

  begin(): number {
    this.generation += 1
    this.active = null
    return this.generation
  }

  commit(generation: number, client: T): boolean {
    if (generation !== this.generation) return false
    this.active = client
    return true
  }

  release(client: T): boolean {
    if (this.active !== client) return false
    this.active = null
    return true
  }
}

export function reportAsyncError(task: Promise<unknown>, report: (message: string) => void): void {
  void task.catch((error) => report(error instanceof Error ? error.message : String(error)))
}
