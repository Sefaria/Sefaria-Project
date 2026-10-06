"""Compares docs/parity/<name>-<w>-live.png with -ours.png: share of pixels that differ clearly, and a side-by-side image."""
import glob, os
from PIL import Image, ImageChops
import numpy as np
rows = []
for live in sorted(glob.glob("docs/parity/*-live.png")):
    ours = live.replace("-live.png", "-ours.png")
    if not os.path.exists(ours): continue
    a, b = Image.open(live).convert("L"), Image.open(ours).convert("L")
    w, h = min(a.width, b.width), min(a.height, b.height)
    d = np.asarray(ImageChops.difference(a.crop((0, 0, w, h)), b.crop((0, 0, w, h)))) > 60
    # ink share of each side, to see whether one has more text than the other
    ink = lambda im: float((np.asarray(im) < 128).mean())
    name = os.path.basename(live)[:-9]
    side = Image.new("RGB", (a.width + b.width + 10, max(a.height, b.height)), "white")
    side.paste(Image.open(live).convert("RGB"), (0, 0)); side.paste(Image.open(ours).convert("RGB"), (a.width + 10, 0))
    side.save(f"docs/parity/{name}-side.png")
    rows.append((name, float(d.mean()), ink(a), ink(b)))
print(f"{'case':28} {'differ':>7} {'ink live':>9} {'ink ours':>9}")
for n, d, i1, i2 in rows: print(f"{n:28} {d*100:6.1f}% {i1*100:8.1f}% {i2*100:8.1f}%")
