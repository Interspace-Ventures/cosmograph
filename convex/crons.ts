import { cronJobs } from "convex/server";
import { refs } from "./lib/refs";

const crons = cronJobs();

// Expired checkout/portal rate counters (lib/rateLimit.ts).
crons.daily(
  "prune billing rate counters",
  { hourUTC: 4, minuteUTC: 17 },
  refs.pruneRateCounters,
  {},
);

export default crons;
