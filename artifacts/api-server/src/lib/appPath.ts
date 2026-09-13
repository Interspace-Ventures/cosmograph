import type { RequestHandler } from "express";

export function normalizeAppBasePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "/") return "";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export const APP_BASE_PATH = normalizeAppBasePath(
  process.env["APP_BASE_PATH"] ?? process.env["BASE_PATH"],
);

export function withAppBasePath(pathname: string): string {
  if (
    !APP_BASE_PATH ||
    pathname === APP_BASE_PATH ||
    pathname.startsWith(`${APP_BASE_PATH}/`)
  ) {
    return pathname;
  }

  return pathname.startsWith("/") ? `${APP_BASE_PATH}${pathname}` : pathname;
}

export function stripAppBasePath(pathname: string): string {
  if (!APP_BASE_PATH) return pathname;
  if (pathname === APP_BASE_PATH) return "/";
  if (!pathname.startsWith(`${APP_BASE_PATH}/`)) return pathname;
  return pathname.slice(APP_BASE_PATH.length) || "/";
}

export const appBasePathMiddleware: RequestHandler = (req, _res, next) => {
  if (!APP_BASE_PATH) {
    next();
    return;
  }

  const [pathname, query] = req.url.split("?", 2);
  const stripped = stripAppBasePath(pathname ?? "/");
  if (stripped !== pathname) {
    req.url = `${stripped}${query === undefined ? "" : `?${query}`}`;
  }
  next();
};
