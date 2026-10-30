import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { stagingAccess } from "./middlewares/stagingAccess";
import { appBasePathMiddleware } from "./lib/appPath";
import {
  CSP_REPORT_PATH,
  cspHeaders,
  cspNonce,
  cspReportRoute,
  spaShell,
} from "./security/csp";

const app: Express = express();

// Behind the Railway reverse proxy (one hop). Required so per-IP rate limiting
// reads the real client IP from X-Forwarded-For instead of the proxy's, and so
// req.protocol/host are correct when building Stripe redirect URLs.
app.set("trust proxy", 1);

// EXO's App gateway keeps the public App prefix in the upstream request.
// Normalize it once at the service boundary so existing routes remain stable.
app.use(appBasePathMiddleware);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Strict nonce-based CSP on every response (report-only until CSP_MODE=enforce).
app.use(cspNonce, cspHeaders());

// CSP violation reports. Public (browsers send no credentials) and before the
// staging boundary so staging reviewers' violations are still recorded.
app.post(CSP_REPORT_PATH, ...cspReportRoute());

// Accounts, billing, ships, referrals and the verified Stripe webhook live on
// Convex (convex/http.ts). This server keeps only Ask, feedback, GitHub stars,
// health and presence until Phase 5 removes it. No Clerk, no auth proxy.
// No cookies or cross-origin callers any more: the SPA calls /api on its own
// origin, so send no CORS grants at all.
app.use(cors({ origin: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Staging is a private review surface. Production remains public because this
// boundary is enabled only by an explicit environment variable in Railway.
app.use((req, res, next) => {
  stagingAccess(req, res, next).catch(next);
});

// General per-IP request throttle for the REST API (presence WebSocket has its
// own connection/message limits and does not pass through here).
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter, router);

// Railway builds and runs the API and web client as a single service. This
// keeps relative /api requests on one domain.
const clientDist = process.env["CLIENT_DIST"] ?? path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "cosmograph",
  "dist",
  "public",
);

// index: false so "/" falls through to spaShell, which stamps the nonce.
app.use(express.static(clientDist, { index: false }));
app.use(spaShell(clientDist));

export default app;
