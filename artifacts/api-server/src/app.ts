import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { getStripeSync } from "./lib/stripeClient";
import { markUnlockedFromWebhook } from "./lib/billing";
import { grantSkinFromWebhook } from "./lib/ship";

const app: Express = express();

// Behind the Railway reverse proxy (one hop). Required so per-IP rate limiting
// reads the real client IP from X-Forwarded-For instead of the proxy's, and so
// req.protocol/host are correct when building Stripe redirect URLs.
app.set("trust proxy", 1);

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

// Clerk auth proxy. Mounted before the body parsers because it streams raw
// bytes through to Clerk's FAPI.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Stripe webhook needs the raw request body for signature verification, so it
// MUST be registered before express.json() parses the body. StripeSync verifies
// the signature and syncs Stripe data; we then best-effort grant the unlock in
// case the buyer never returns to the success URL.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      req.log.error(
        "Stripe webhook body is not a Buffer; express.json() ran before this route",
      );
      res.status(500).json({ error: "Webhook processing error" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      const sync = await getStripeSync();
      await sync.processWebhook(req.body, sig);
      await markUnlockedFromWebhook(req.body, req.log);
      await grantSkinFromWebhook(req.body, req.log);
      res.status(200).json({ received: true });
    } catch (err) {
      req.log.error({ err }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// General per-IP request throttle for the REST API (presence WebSocket has its
// own connection/message limits and does not pass through here).
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter, router);

// Railway runs the API and web client as a single service. This keeps relative
// /api requests, Clerk proxying, and provider callbacks on the canonical domain.
const clientDist = process.env["CLIENT_DIST"] ?? path.resolve(
  process.cwd(),
  "artifacts",
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
