import type { RequestHandler } from "express";

// Browser hardening headers for every response (API and the SPA shell).
//
// Framing: the marketing site on Construct embeds the live galaxy, so
// frame-ancestors allows our own origins (FRAME_ANCESTORS, space-separated,
// extends the defaults) and nothing else. That blocks clickjacking the
// checkout or sign-in from someone else's page.
//
// CSP: enforced for the directives that stop the embarrassing attacks
// (framing, plugin/object injection, base-tag hijack, form posts to other
// hosts). Script/connect sources ship as Report-Only first, because Clerk,
// Stripe, fonts and OpenAlex load from several hosts; promote them to the
// enforced policy once a week of reports is clean.
const DEFAULT_ANCESTORS = [
  "'self'",
  "https://cosmograph.space",
  "https://*.cosmograph.space",
  "https://staging.exo.now",
  "https://staging.construct.page",
];

function ancestors(): string {
  const extra = (process.env.FRAME_ANCESTORS ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^https:\/\/[a-z0-9.*-]+(:\d+)?$/i.test(s));
  return [...new Set([...DEFAULT_ANCESTORS, ...extra])].join(" ");
}

const FRAME_ANCESTORS = ancestors();

const ENFORCED_CSP = [
  `frame-ancestors ${FRAME_ANCESTORS}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "upgrade-insecure-requests",
].join("; ");

const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' https://*.clerk.accounts.dev https://clerk.cosmograph.space https://challenges.cloudflare.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' wss: https://api.openalex.org https://*.clerk.accounts.dev https://clerk.cosmograph.space https://api.stripe.com",
  "frame-src https://js.stripe.com https://challenges.cloudflare.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
].join("; ");

export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader("Content-Security-Policy", ENFORCED_CSP);
  res.setHeader("Content-Security-Policy-Report-Only", REPORT_ONLY_CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.stripe.com\"), usb=(), interest-cohort=()",
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  if (req.secure) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  // API responses are per-user or live; never let a shared cache keep them.
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  next();
};

export const _test = { FRAME_ANCESTORS, ENFORCED_CSP };
