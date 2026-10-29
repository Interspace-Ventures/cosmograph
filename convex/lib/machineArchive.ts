/**
 * Content-addressed machine archive (docs/machine-archive.md).
 *
 * The upload endpoint takes no credentials. It is safe because it only ever
 * stores bytes whose sha256 is pinned here, in reviewed source: anyone can
 * upload the one archive the build expects, and nothing else. A pinned archive
 * is stored once; repeat uploads answer "exists".
 *
 * Keep PINNED_ARCHIVES in step with artifacts/cosmograph/machine-archive.json
 * (scripts/src/check-machine-archive.ts checks it in `pnpm run release:check`).
 */
export const PINNED_ARCHIVES: Record<string, { size: number; name: string }> = {
  "4d2cc9d64a10e3518d8bf626895f9bfab65cabb4f880c26e19e9cd125d414e2a": {
    size: 3737592,
    name: "machines-v9-ring2.tar.br",
  },
};

/** Convex HTTP action request bodies are capped at 20 MB. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ROUTE_PREFIX = "/machine-archive/";
export const UPLOAD_PATH = "/machine-archive/upload";

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ArchiveStore {
  find: (sha256: string) => Promise<{ storageId: string } | null>;
  store: (bytes: ArrayBuffer, sha256: string, size: number) => Promise<void>;
  url: (storageId: string) => Promise<string | null>;
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

/** POST /machine-archive/upload, raw archive bytes as the body. */
export async function handleUpload(request: Request, store: ArchiveStore): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  const sizes = new Set(Object.values(PINNED_ARCHIVES).map((a) => a.size));
  if (declared && (declared > MAX_UPLOAD_BYTES || !sizes.has(declared))) {
    return json(413, { error: "not a pinned archive size" });
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return json(413, { error: "too large" });
  const sha256 = await sha256Hex(bytes);
  const pinned = PINNED_ARCHIVES[sha256];
  if (!pinned || pinned.size !== bytes.byteLength) {
    return json(422, { error: "archive is not pinned in this deployment", sha256 });
  }
  if (await store.find(sha256)) return json(200, { status: "exists", sha256, size: bytes.byteLength });
  await store.store(bytes, sha256, bytes.byteLength);
  return json(201, { status: "stored", sha256, size: bytes.byteLength });
}

/** GET /machine-archive/<sha256>: redirect to the stored file (public, immutable). */
export async function handleDownload(request: Request, store: ArchiveStore): Promise<Response> {
  const path = new URL(request.url).pathname;
  const sha256 = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256) || !PINNED_ARCHIVES[sha256]) return json(404, { error: "unknown archive" });
  const row = await store.find(sha256);
  const url = row ? await store.url(row.storageId) : null;
  if (!url) return json(404, { error: "archive not uploaded yet", sha256 });
  return new Response(null, {
    status: 302,
    headers: { location: url, "cache-control": "public, max-age=3600", "x-archive-sha256": sha256 },
  });
}
