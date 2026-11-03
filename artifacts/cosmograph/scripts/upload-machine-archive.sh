#!/usr/bin/env bash
# Upload the ring-2 machine archive to Cosmograph's Convex file storage.
#
#   bash upload-machine-archive.sh https://<cosmograph-deployment>.convex.site
#
# Run once, after the Convex code from PR #20 (convex/http.ts, convex/machineArchive.ts)
# is deployed. Needs only curl and shasum: the upload endpoint takes no key or token,
# because it stores nothing but the archive whose sha256 is pinned in the deployed code.
# The archive (machines-v9-ring2.tar.br) must sit next to this script or in ~/Downloads.
# Safe to re-run: a second upload answers "exists".
set -euo pipefail

SHA256="4d2cc9d64a10e3518d8bf626895f9bfab65cabb4f880c26e19e9cd125d414e2a"
SIZE=3737592
NAME="machines-v9-ring2.tar.br"

SITE="${1:-}"
SITE="${SITE%/}"
if [[ ! "$SITE" =~ ^https://[a-z0-9-]+\.convex\.site$ ]]; then
  echo "usage: bash $0 https://<cosmograph-deployment>.convex.site" >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE=""
for cand in "$HERE/$NAME" "$HOME/Downloads/$NAME" "$HOME/Downloads/machine-archive/$NAME"; do
  [[ -f "$cand" ]] && { ARCHIVE="$cand"; break; }
done
[[ -n "$ARCHIVE" ]] || { echo "Could not find $NAME next to this script or in ~/Downloads." >&2; exit 1; }

sha() { if command -v shasum >/dev/null; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }
got="$(sha "$ARCHIVE")"
[[ "$got" == "$SHA256" ]] || { echo "Checksum mismatch for $ARCHIVE (got $got). Re-download it from Drive." >&2; exit 1; }
echo "1/3 Archive OK: $ARCHIVE ($SIZE bytes, sha256 ${SHA256:0:12}...)"

echo "2/3 Uploading to $SITE ..."
out="$(mktemp)"
code="$(curl -sS -o "$out" -w '%{http_code}' -X POST \
  -H 'content-type: application/octet-stream' --data-binary @"$ARCHIVE" \
  "$SITE/machine-archive/upload")"
cat "$out"; echo; rm -f "$out"
[[ "$code" == "201" || "$code" == "200" ]] || { echo "Upload failed (HTTP $code). Is the PR #20 Convex code deployed to $SITE?" >&2; exit 1; }

echo "3/3 Verifying the download the build will make ..."
tmp="$(mktemp)"
curl -sSfL -o "$tmp" "$SITE/machine-archive/$SHA256"
back="$(sha "$tmp")"; rm -f "$tmp"
[[ "$back" == "$SHA256" ]] || { echo "Downloaded copy does not match (got $back)." >&2; exit 1; }
echo "Done. The archive is live at $SITE/machine-archive/$SHA256"
echo "The next build picks it up once machine-archive.json has \"convexSiteUrl\": \"$SITE\" (or the deployment sets VITE_CONVEX_URL)."
