#!/usr/bin/env python3
"""Pack machine thumbnails into sprite atlases for the /world view's mid-range level of detail.

    python3 scripts/build-thumb-atlas.py <thumbs-dir> [--order src/world/data/curated.json]

Offline asset tool (needs Pillow); its output is committed. Writes
public/world/atlas/t<N>.webp sheets plus public/world/atlas/atlas.json:

    { "schema": 1, "cell": [240, 161], "cols": 8, "rows": 8,
      "sheets": [{ "file": "t0.webp", "v": "<sha256[:12]>", "w": 1920, "h": 1288 }, ...],
      "slots": { "<slug>": [sheet, index], ... } }

Machines are packed in map order (domain, then ring), so the machines on one island
share a sheet and a viewport touches as few sheets as possible. The app reads
atlas.json through its asset resolver (src/world/assets.ts), so sheets can move to a
CDN by changing the manifest, not app code.
"""
import hashlib
import io
import json
import os
import sys

from PIL import Image

CELL = (240, 161)
COLS, ROWS = 8, 8
QUALITY = 72

here = os.path.dirname(os.path.abspath(__file__))
pkg = os.path.dirname(here)
args = [a for a in sys.argv[1:] if not a.startswith("--")]
thumbs = args[0] if args else os.path.join(pkg, "public", "world", "thumbs")
order_path = os.path.join(pkg, "src", "world", "data", "curated.json")
if "--order" in sys.argv:
    order_path = sys.argv[sys.argv.index("--order") + 1]
out_dir = os.path.join(pkg, "public", "world", "atlas")

available = {f[:-5] for f in os.listdir(thumbs) if f.endswith(".webp")}
order = []
try:
    curated = json.load(open(order_path))
    dom_order = {d["slug"]: i for i, d in enumerate(curated["domains"])}
    ms = sorted(
        curated["machines"],
        key=lambda m: (dom_order.get(m["domain"], 999), m.get("ring", 9), m["slug"]),
    )
    order = [m["slug"] for m in ms if m["slug"] in available]
except (OSError, KeyError, ValueError):
    pass
order += sorted(available - set(order))

os.makedirs(out_dir, exist_ok=True)
for f in os.listdir(out_dir):
    if f.endswith(".webp") or f == "atlas.json":
        os.remove(os.path.join(out_dir, f))

per = COLS * ROWS
sheets, slots = [], {}
for s in range(0, len(order), per):
    batch = order[s : s + per]
    rows = (len(batch) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (CELL[0] * COLS, CELL[1] * rows), (0, 0, 0, 0))
    for i, slug in enumerate(batch):
        im = Image.open(os.path.join(thumbs, slug + ".webp")).convert("RGBA")
        if im.size != CELL:
            im = im.resize(CELL, Image.LANCZOS)
        sheet.paste(im, ((i % COLS) * CELL[0], (i // COLS) * CELL[1]))
        slots[slug] = [len(sheets), i]
    buf = io.BytesIO()
    sheet.save(buf, "WEBP", quality=QUALITY, method=4)
    data = buf.getvalue()
    name = f"t{len(sheets)}.webp"
    open(os.path.join(out_dir, name), "wb").write(data)
    sheets.append({"file": name, "v": hashlib.sha256(data).hexdigest()[:12], "w": sheet.width, "h": sheet.height})

manifest = {"schema": 1, "cell": list(CELL), "cols": COLS, "rows": ROWS, "sheets": sheets, "slots": slots}
open(os.path.join(out_dir, "atlas.json"), "w").write(json.dumps(manifest, separators=(",", ":")) + "\n")
total = sum(os.path.getsize(os.path.join(out_dir, s["file"])) for s in sheets)
print(f"packed {len(slots)} thumbnails into {len(sheets)} sheets, {total} bytes")
