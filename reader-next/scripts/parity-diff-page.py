"""Pixel diff of scripts/parity-page.mjs shots: share of clearly differing pixels per pair, a diff mask and a zoomable side-by-side.
Usage: python3 scripts/parity-diff-page.py [name-prefix]   (default: page-)"""
import glob, os, sys
from PIL import Image, ImageChops
import numpy as np
prefix = sys.argv[1] if len(sys.argv) > 1 else "page-"
for live in sorted(glob.glob(f"docs/parity/{prefix}*-live.png")):
    ours = live.replace("-live.png", "-ours.png")
    if not os.path.exists(ours): continue
    a, b = Image.open(live).convert("RGB"), Image.open(ours).convert("RGB")
    w, h = min(a.width, b.width), min(a.height, b.height)
    d = np.asarray(ImageChops.difference(a.crop((0, 0, w, h)), b.crop((0, 0, w, h))).convert("L")) > 40
    name = os.path.basename(live)[:-9]
    Image.fromarray((d * 255).astype("uint8")).save(f"docs/parity/{name}-diff.png")
    side = Image.new("RGB", (a.width + b.width + 10, max(a.height, b.height)), "red")
    side.paste(a, (0, 0)); side.paste(b, (a.width + 10, 0)); side.save(f"docs/parity/{name}-side.png")
    ys, xs = np.where(d)
    box = f"bbox {xs.min()},{ys.min()}-{xs.max()},{ys.max()}" if len(ys) else ""
    size = "" if a.size == b.size else f"  SIZE live {a.size} ours {b.size}"
    print(f"{name:34} {d.mean()*100:6.2f}%  {box}{size}")
