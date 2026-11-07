import { cronJobs } from "convex/server";
import { refs } from "./lib/refs";

const crons = cronJobs();

// Expired rate counters for checkout/portal and Ask Cosmo (lib/rateLimit.ts).
crons.daily(
  "prune billing rate counters",
  { hourUTC: 4, minuteUTC: 17 },
  refs.pruneRateCounters,
  {},
);

export default crons;
