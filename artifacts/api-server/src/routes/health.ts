import { Router, type IRouter, type RequestHandler } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const handleHealth: RequestHandler = (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    deployment: {
      commit:
        process.env["RAILWAY_GIT_COMMIT_SHA"] ??
        process.env["GIT_COMMIT_SHA"] ??
        "unknown",
      environment:
        process.env["RAILWAY_ENVIRONMENT_NAME"] ??
        process.env["NODE_ENV"] ??
        "unknown",
    },
  });
  res.set("Cache-Control", "no-store");
  res.json(data);
};

router.get("/healthz", handleHealth);
router.get("/health", handleHealth);

export default router;
