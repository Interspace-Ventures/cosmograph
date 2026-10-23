#!/usr/bin/env bash
# Installs a pinned 1Password CLI (`op`) into .render/bin during the Render build.
#
# Stopgap for ADR 0016 (Interspace-Ventures/exo): until this app ports the Exo Secure loader, the
# start command wraps the server in `op run`, which resolves the op:// references in
# scripts/render/secrets.op.env with the service's read-only OP_SERVICE_ACCOUNT_TOKEN. The CLI is
# not on Render's native Node image, so the build fetches it. Nothing here needs a secret.
#
# Bump OP_VERSION and OP_SHA256 together (sha256 of op_linux_amd64_v<version>.zip from
# https://app-updates.agilebits.com/product_history/CLI2). The checksum check fails the build on a
# mismatch so a tampered download never ships.
set -euo pipefail

OP_VERSION="2.41.1"
OP_SHA256="e52476700cba9202ac7469bdfb2648ecdbf3438ac85822010f77230139e74966"

dest="$(pwd)/.render/bin"
if [ -x "$dest/op" ] && "$dest/op" --version 2>/dev/null | grep -qx "$OP_VERSION"; then
  echo "[install-op] op $OP_VERSION already present"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
zip="op_linux_amd64_v${OP_VERSION}.zip"
curl -fsSL --retry 3 -o "$tmp/$zip" "https://cache.agilebits.com/dist/1P/op2/pkg/v${OP_VERSION}/${zip}"
echo "${OP_SHA256}  $tmp/$zip" | sha256sum -c -
mkdir -p "$dest"
if command -v unzip >/dev/null 2>&1; then
  unzip -oq "$tmp/$zip" op -d "$dest"
else
  python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extract("op", sys.argv[2])' "$tmp/$zip" "$dest"
fi
chmod 0755 "$dest/op"
echo "[install-op] installed $("$dest/op" --version) at $dest/op"
