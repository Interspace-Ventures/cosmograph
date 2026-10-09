// Hard daily ceilings for anything that costs real money per call.
//
// Per-minute rate limits stop bursts, but a patient script (or many IPs) can
// still run up a bill over a day. These counters bound the worst case: a
// per-client daily allowance plus a global circuit breaker per UTC day. When the
// global breaker trips, the feature returns 503 until midnight UTC instead of
// spending.
//
// State is in-memory: the service runs as one always-on Railway instance. A
// restart resets the counters, which can at most double one day's ceiling. The
// durable, cross-instance cap is the tenant spend cap in the Exo router once
// Ask Cosmo moves there.

export interface DailyBudgetOptions {
  /** Max calls per client key per UTC day. */
  perClient: number;
  /** Max calls across all clients per UTC day (circuit breaker). */
  global: number;
  /** Cap on distinct client keys tracked per day, bounding memory. */
  maxTrackedClients?: number;
}

export type BudgetDecision =
  | { ok: true; remaining: number }
  | { ok: false; reason: "client" | "global" };

const utcDay = (now: number) => Math.floor(now / 86_400_000);

export class DailyBudget {
  private day = -1;
  private total = 0;
  private perClient = new Map<string, number>();
  private readonly maxTracked: number;

  constructor(private readonly opts: DailyBudgetOptions) {
    this.maxTracked = opts.maxTrackedClients ?? 200_000;
  }

  /** Reserve one call for `client`; returns whether it may proceed. */
  take(client: string, now = Date.now()): BudgetDecision {
    const today = utcDay(now);
    if (today !== this.day) {
      this.day = today;
      this.total = 0;
      this.perClient.clear();
    }
    if (this.total >= this.opts.global) return { ok: false, reason: "global" };
    const used = this.perClient.get(client) ?? 0;
    if (used >= this.opts.perClient) return { ok: false, reason: "client" };
    // Too many distinct clients today points to a distributed flood. Fail closed
    // for new clients rather than growing memory without bound.
    if (used === 0 && this.perClient.size >= this.maxTracked) {
      return { ok: false, reason: "global" };
    }
    this.perClient.set(client, used + 1);
    this.total += 1;
    return { ok: true, remaining: this.opts.perClient - used - 1 };
  }

  snapshot() {
    return { day: this.day, total: this.total, clients: this.perClient.size };
  }
}

/** Positive integer from env, falling back when unset or malformed. */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
