export const MINUTE = 60_000;
export const DEFINITIONS_MAX_AGE = 48 * 60 * MINUTE;

// Operational metadata only: never record file names, paths, bytes or scanner output.
export class ScannerHealth {
  lastCheckAt: number | null = null;
  lastSuccessAt: number | null = null;
  failureSince: number | null = null;
  consecutiveFailures = 0;

  record(ok: boolean, now = Date.now()) {
    this.lastCheckAt = now;
    if (ok) {
      this.lastSuccessAt = now;
      this.failureSince = null;
      this.consecutiveFailures = 0;
    } else {
      this.failureSince ??= now;
      this.consecutiveFailures++;
    }
  }

  snapshot(definitionsAt: number | null, now = Date.now()) {
    const definitions = definitionsAt === null ? "missing" :
      now - definitionsAt >= DEFINITIONS_MAX_AGE ? "stale" : "current";
    const persistent = this.consecutiveFailures >= 3 && this.failureSince !== null &&
      now - this.failureSince >= 10 * MINUTE;
    const status = definitions !== "current" ? "blocked" :
      this.lastCheckAt === null || now - this.lastCheckAt > 10 * MINUTE ? "unknown" :
      persistent ? "outage" : this.consecutiveFailures ? "retrying" : "healthy";
    return {
      status, definitions,
      definitionsCheckedAt: definitionsAt === null ? null : new Date(definitionsAt).toISOString(),
      lastCheckAt: this.lastCheckAt === null ? null : new Date(this.lastCheckAt).toISOString(),
      lastSuccessAt: this.lastSuccessAt === null ? null : new Date(this.lastSuccessAt).toISOString(),
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

export const scannerHealth = new ScannerHealth();
