import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { withAppBasePath } from "../lib/appPath";

/**
 * Strict, nonce-based Content Security Policy (EXO platform rule: no
 * third-party JavaScript). Follows the "strict CSP" recipe from
 * https://web.dev/articles/strict-csp :
 *
 *   script-src 'nonce-…' 'strict-dynamic'
 *
 * Only scripts carrying this response's nonce run, and they may load further
 * modules (Vite's chunks, deck.gl on /world). A script injected any other way,
 * including from a third-party host, is refused. The `https:` and
 * 'unsafe-inline' entries are ignored by every browser that understands
 * nonces; they only keep very old browsers working.
 *
 * Rollout: `CSP_MODE` (non-secret) is `report-only` by default. Violations go
 * to /api/csp-report and land in the logs. Once a staging soak shows no
 * legitimate violations, set `CSP_MODE=enforce`.
 */

export type CspMode = "report-only" | "enforce" | "off";

export function cspMode(value: string | undefined): CspMode {
  const v = value?.trim().toLowerCase();
  if (v === "enforce") return "enforce";
  if (v === "off") return "off";
  return "report-only";
}

/** Extra origins, space- or comma-separated (e.g. the Convex deployment). */
export function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^(https|wss):\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));
}

export const CSP_REPORT_PATH = "/api/csp-report";

export function cspDirectives(opts: {
  connectSrc: string[];
  reportUri: string;
}) {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: [
      (_req: unknown, res: unknown) =>
        `'nonce-${(res as Response).locals["cspNonce"]}'`,
      "'strict-dynamic'",
      "https:",
      "'unsafe-inline'",
    ],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    fontSrc: ["'self'", "data:"],
    imgSrc: ["'self'", "data:", "blob:"],
    mediaSrc: ["'self'", "blob:"],
    // OpenAlex: the researcher search calls its public API from the browser.
    connectSrc: ["'self'", "https://api.openalex.org", ...opts.connectSrc],
    workerSrc: ["'self'", "blob:"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: [] as string[],
    reportUri: [opts.reportUri],
    reportTo: ["csp"],
  };
}

/** A fresh 128-bit nonce for every response. */
export function cspNonce(_req: Request, res: Response, next: NextFunction) {
  res.locals["cspNonce"] = randomBytes(16).toString("base64");
  next();
}

export function cspHeaders(env = process.env): RequestHandler {
  const mode = cspMode(env["CSP_MODE"]);
  if (mode === "off") return (_req, _res, next) => next();
  const reportUri = withAppBasePath(CSP_REPORT_PATH);
  const policy = helmet.contentSecurityPolicy({
    useDefaults: false,
    reportOnly: mode === "report-only",
    directives: cspDirectives({
      connectSrc: parseOrigins(env["CSP_CONNECT_SRC"]),
      reportUri,
    }),
  });
  return (req, res, next) => {
    res.setHeader("Reporting-Endpoints", `csp="${reportUri}"`);
    policy(req, res, next);
  };
}

/** Stamp the nonce onto every script and module preload in the SPA shell. */
export function applyNonce(html: string, nonce: string): string {
  return html
    .replace(/<script\b/g, `<script nonce="${nonce}"`)
    .replace(
      /<link\b(?=[^>]*\brel=["']?modulepreload)/g,
      `<link nonce="${nonce}"`,
    );
}

/**
 * Serves index.html with this response's nonce. The shell is read once and
 * cached; it is a build artifact and never changes while the process runs.
 */
export function spaShell(clientDist: string): RequestHandler {
  let shell: string | undefined;
  return (req, res, next) => {
    if (
      (req.method !== "GET" && req.method !== "HEAD") ||
      req.path.startsWith("/api")
    ) {
      next();
      return;
    }
    try {
      shell ??= readFileSync(path.join(clientDist, "index.html"), "utf8");
    } catch (err) {
      next(err);
      return;
    }
    const nonce = String(res.locals["cspNonce"] ?? "");
    res
      .status(200)
      .type("html")
      .set("Cache-Control", "no-cache")
      .send(nonce ? applyNonce(shell, nonce) : shell);
  };
}

/** Bounded summary of one violation; never logs full URLs' query strings. */
export function summarizeReport(body: unknown): Record<string, string>[] {
  const strip = (v: unknown) =>
    typeof v === "string" ? v.split("?")[0]!.slice(0, 300) : "";
  const one = (r: Record<string, unknown>) => ({
    directive: strip(r["effective-directive"] ?? r["effectiveDirective"] ?? r["violated-directive"]),
    blocked: strip(r["blocked-uri"] ?? r["blockedURL"]),
    page: strip(r["document-uri"] ?? r["documentURL"]),
    source: strip(r["source-file"] ?? r["sourceFile"]),
    disposition: strip(r["disposition"]),
  });
  if (Array.isArray(body)) {
    return body
      .slice(0, 20)
      .filter((x) => x && typeof x === "object" && (x as { type?: string }).type === "csp-violation")
      .map((x) => one(((x as { body?: unknown }).body ?? {}) as Record<string, unknown>));
  }
  if (body && typeof body === "object" && "csp-report" in body) {
    return [one((body as { "csp-report": Record<string, unknown> })["csp-report"])];
  }
  return [];
}

/** POST /api/csp-report: accepts both the legacy and Reporting API formats. */
export function cspReportRoute(): RequestHandler[] {
  return [
    rateLimit({
      windowMs: 60_000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
    }),
    express.json({
      type: ["application/csp-report", "application/reports+json", "application/json"],
      limit: "16kb",
    }),
    (req, res) => {
      for (const v of summarizeReport(req.body)) {
        req.log.warn({ csp: v }, "CSP violation");
      }
      res.status(204).end();
    },
  ];
}
