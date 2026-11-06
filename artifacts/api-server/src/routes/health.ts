import { Router, type IRouter, type RequestHandler } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { secretStatus } from "../lib/runtimeSecrets";

/**
 * Which secret-backed integrations are live. Booleans and reason codes only,
 * never values. A disabled integration fails closed: feedback intake returns
 * 502. Ask Cosmo is not here anymore: it runs on Convex (POST /ask/chat on the
 * deployment's .convex.site) and its gateway state is that deployment's
 * GET /health.
 */
export function integrationHealth(
  env: Record<string, string | undefined> = process.env,
) {
  const intake = secretStatus("exoIntakeSecret");
  const intakeUrl = (env["EXO_INTAKE_API_URL"] ?? "").trim() !== "";
  return {
    exoIntake:
      intake.ready && !intakeUrl
        ? { ready: false, source: intake.source, reason: "api-url-missing" }
        : intake,
  };
}

const router: IRouter = Router();

const handleHealth: RequestHandler = (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    deployment: {
      // RENDER_GIT_COMMIT is set by Render on every deploy; GIT_COMMIT_SHA is
      // the host-neutral fallback for any other runner.
      commit:
        process.env["RENDER_GIT_COMMIT"] ||
        process.env["GIT_COMMIT_SHA"] ||
        "unknown",
      // DEPLOY_ENVIRONMENT names the deployment (staging | production). It is
      // separate from RELEASE_CHANNEL, which is the release audience
      // (internal | friends-and-family | public) read by the feature flags.
      environment:
        process.env["DEPLOY_ENVIRONMENT"] ||
        process.env["NODE_ENV"] ||
        "unknown",
    },
    integrations: integrationHealth(),
  });
  res.set("Cache-Control", "no-store");
  res.json(data);
};

router.get("/healthz", handleHealth);
router.get("/health", handleHealth);

export default router;
