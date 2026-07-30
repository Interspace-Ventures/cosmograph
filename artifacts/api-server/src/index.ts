import { createServer } from "node:http";
import app from "./app";
import { attachPresence } from "./presence/server";
import { initStripe } from "./lib/stripeSetup";
import { logger } from "./lib/logger";
import { featureEnabled } from "./lib/features";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
if (featureEnabled("live-presence")) {
  attachPresence(server);
} else {
  logger.info("Live presence disabled by release plan");
}

// Best-effort, non-fatal: initializes Stripe sync + webhook when connected.
void initStripe();

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
