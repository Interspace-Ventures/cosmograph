import { createServer } from "node:http";
import { configureOpenAI } from "@workspace/integrations-openai-ai-server";
import app from "./app";
import { attachPresence } from "./presence/server";
import { logger } from "./lib/logger";
import { featureEnabled } from "./lib/features";
import { loadRuntimeSecrets, runtimeSecret } from "./lib/runtimeSecrets";

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

async function main(): Promise<void> {
  // Secrets come from Bitwarden Secrets Manager once, before the server takes traffic. A
  // failure never stops boot: the affected feature stays disabled and
  // /api/health says why (fail closed). Values are never logged.
  await loadRuntimeSecrets({
    log: {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
      error: (m) => logger.error(m),
    },
  });
  const openaiKey = runtimeSecret("openaiApiKey");
  configureOpenAI(
    openaiKey
      ? { apiKey: openaiKey, baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] }
      : null,
  );

  const server = createServer(app);
  if (featureEnabled("live-presence")) {
    attachPresence(server);
  } else {
    logger.info("Live presence disabled by release plan");
  }

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

main().catch(() => {
  // Never log the error object here: it could carry config details.
  logger.error("Server failed to start");
  process.exit(1);
});
