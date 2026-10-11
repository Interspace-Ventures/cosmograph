import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkCanonicalHostMiddleware,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import type Stripe from "stripe";
import {
  getUncachableStripeClient,
  stripeConfigured,
  webhookSecret,
} from "./lib/stripeClient";
import { handleStripeEvent } from "./lib/billing";
import { stagingAccess } from "./middlewares/stagingAccess";
import { appBasePathMiddleware } from "./lib/appPath";
import { securityHeaders } from "./middlewares/securityHeaders";
import { isAllowedOrigin } from "./lib/publicOrigin";
import { requireSameOrigin } from "./middlewares/sameOrigin";

const app: Express = express();

// Behind the Railway reverse proxy (one hop). Required so per-IP rate limiting
// reads the real client IP from X-Forwarded-For instead of the proxy's, and so
// req.protocol/host are correct when building Stripe redirect URLs.
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(securityHeaders);

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

app.use(clerkCanonicalHostMiddleware());

// Clerk auth proxy. Mounted before the body parsers because it streams raw
// bytes through to Clerk's FAPI.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Stripe webhook: raw body (needed for the signature), verified with Stripe's
// own SDK against STRIPE_WEBHOOK_SECRET, then applied exactly once (event ids
// are recorded). Registered before express.json() and outside the Origin gate:
// Stripe authenticates by signature, not by browser origin.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    if (!stripeConfigured()) {
      res.status(503).json({ error: "Billing not configured" });
      return;
    }
    const signature = req.get("stripe-signature");
    if (!signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Missing signature" });
      return;
    }
    let event: Stripe.Event;
    try {
      const stripe = await getUncachableStripeClient();
      event = await stripe.webhooks.constructEventAsync(
        req.body,
        signature,
        webhookSecret(),
        300,
      );
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, "rejected Stripe webhook signature");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }
    try {
      await handleStripeEvent(event, req.log);
      res.status(200).json({ received: true });
    } catch (err) {
      req.log.error({ err, eventId: event.id, type: event.type }, "Stripe webhook processing failed");
      // 500 so Stripe retries with backoff.
      res.status(500).json({ error: "Webhook processing error" });
    }
  },
);

// Credentialed CORS only for our own origins. `origin: true` would reflect any
// site, letting another page call the API with a signed-in visitor's cookies.
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
  }),
);
// Small bodies only: nothing legitimate posts more than a few KB, and a cap
// stops memory-exhaustion floods before any handler runs.
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "8kb" }));

// Resolve the publishable key from the incoming request host so the same server
// can serve multiple Clerk custom domains; falls back to CLERK_PUBLISHABLE_KEY.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Staging is a private review surface. Production remains public because this
// boundary is enabled only by an explicit environment variable in Railway.
app.use(stagingAccess);

// General per-IP request throttle for the REST API (presence WebSocket has its
// own connection/message limits and does not pass through here).
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// Every state-changing API call must come from a Cosmograph page. (The Stripe
// webhook is registered above this and authenticates by signature instead.)
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  requireSameOrigin(req, res, next);
});

app.use("/api", apiLimiter, router);

// Unknown API paths get a JSON 404 instead of the SPA shell.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Railway builds and runs the API and web client as a single service. This
// keeps relative /api requests, auth, and provider callbacks on one domain.
const clientDist = process.env["CLIENT_DIST"] ?? path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "cosmograph",
  "dist",
  "public",
);

app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (
    (req.method !== "GET" && req.method !== "HEAD") ||
    req.path.startsWith("/api")
  ) {
    next();
    return;
  }

  res.sendFile("index.html", { root: clientDist }, (err) => {
    if (err) next(err);
  });
});

export default app;
