export class BillingCache<T = unknown> {
  private value?: T
  private expiresAt = 0
  private inFlight?: Promise<T>

  constructor(
    private readonly ttlMs = 600_000,
    private readonly now: () => number = Date.now
  ) {}

  async get(load: () => Promise<T>): Promise<T> {
    if (this.value !== undefined && this.now() < this.expiresAt) return this.value
    if (this.inFlight) return this.inFlight
    this.inFlight = load().then((value) => {
      this.value = value
      this.expiresAt = this.now() + this.ttlMs
      return value
    }).finally(() => { this.inFlight = undefined })
    return this.inFlight
  }

  clear(): void {
    this.value = undefined
    this.expiresAt = 0
  }
}
