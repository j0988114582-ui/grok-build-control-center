export class BillingCache<T = unknown> {
  private value?: T
  private expiresAt = 0
  private inFlight?: Promise<T>
  private generation = 0

  constructor(
    private readonly ttlMs = 600_000,
    private readonly now: () => number = Date.now
  ) {}

  async get(load: () => Promise<T>): Promise<T> {
    if (this.value !== undefined && this.now() < this.expiresAt) return this.value
    if (this.inFlight) return this.inFlight
    const generation = this.generation
    const request = load().then((value) => {
      if (generation === this.generation) {
        this.value = value
        this.expiresAt = this.now() + this.ttlMs
      }
      return value
    }).finally(() => { if (this.inFlight === request) this.inFlight = undefined })
    this.inFlight = request
    return request
  }

  clear(): void {
    this.generation += 1
    this.value = undefined
    this.expiresAt = 0
    this.inFlight = undefined
  }
}
