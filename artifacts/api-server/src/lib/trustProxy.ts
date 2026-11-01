// How many reverse-proxy hops sit between the visitor and this process.
//
// Render serves every web service through Cloudflare and its own load
// balancer. Cloudflare appends the visitor's address to whatever
// X-Forwarded-For the client sent, Render's balancer appends Cloudflare's, and
// the socket peer is the balancer:
//   socket peer = Render load balancer
//   X-Forwarded-For = "<anything the client sent>, <client>, <cloudflare>"
// That is two trusted hops (Express `trust proxy = 2`), measured on the live
// cosmograph-staging service on 2026-11-01: with 2, a forged X-Forwarded-For
// no longer moves the rate-limit key; with 3 it did. Trusting fewer keys rate
// limits on a shared proxy address; trusting more lets a client pick its own
// IP by sending a forged X-Forwarded-For.
//
// TRUST_PROXY_HOPS is set per service (render.yaml). The code default is 1, the
// fail-safe value: it never trusts a client-written entry, so a missing
// setting can only make limits coarser, never spoofable.
export const DEFAULT_TRUST_PROXY_HOPS = 1;

export function trustProxyHops(
  raw: string | undefined = process.env["TRUST_PROXY_HOPS"],
): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : DEFAULT_TRUST_PROXY_HOPS;
}

/**
 * Client IP for raw Node requests (the presence WebSocket), matching Express
 * `req.ip` with `trust proxy = hops`: the socket peer is the first trusted hop
 * and each further hop vouches for one more X-Forwarded-For entry from the
 * right, so the client is the entry `hops` places from the end.
 */
export function clientIpFromForwarded(
  forwardedFor: string | string[] | undefined,
  socketAddress: string | undefined,
  hops: number,
): string {
  const raw = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
  const parts = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return socketAddress || "unknown";
  // Fewer entries than trusted hops: the furthest address is the best we know.
  return parts[Math.max(0, parts.length - hops)]!;
}
