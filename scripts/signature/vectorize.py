"""
Vectorize a handwritten signature photo into:
  * outline  — a smooth filled SVG path of the ink (exact shape, no photo background);
  * strokes  — ordered centre-line paths along which the ink is "drawn" in the animation.

Usage:  python3 vectorize.py <signature.jpg> <out.json> [preview.png]
Needs: numpy, scipy, scikit-image, opencv-python, pillow.
"""
import json
import math
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import morphology

SRC, OUT = sys.argv[1], sys.argv[2]
PREVIEW = sys.argv[3] if len(sys.argv) > 3 else None
PAD = 24

# ---------------------------------------------------------------- 1. ink mask
rgb = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
alpha = np.clip((R - 60) / 80.0, 0, 1) * (R - np.maximum(G, B) > 25)  # red ink only
mask = alpha > 0.5
mask = morphology.remove_small_objects(mask, max_size=200)
mask = morphology.remove_small_holes(mask, max_size=300)

ys, xs = np.nonzero(mask)
x0, y0 = max(xs.min() - PAD, 0), max(ys.min() - PAD, 0)
x1, y1 = min(xs.max() + PAD, mask.shape[1] - 1), min(ys.max() + PAD, mask.shape[0] - 1)
mask = mask[y0 : y1 + 1, x0 : x1 + 1]
alpha = alpha[y0 : y1 + 1, x0 : x1 + 1] * ndimage.binary_dilation(mask, iterations=2)
H, W = mask.shape


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def smooth_closed(pts, sigma):
    return np.stack([ndimage.gaussian_filter1d(pts[:, i], sigma, mode="wrap") for i in range(2)], 1)


def smooth_open(pts, sigma):
    if len(pts) < 5:
        return pts
    out = np.stack([ndimage.gaussian_filter1d(pts[:, i], sigma, mode="nearest") for i in range(2)], 1)
    out[0], out[-1] = pts[0], pts[-1]
    return out


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    n = np.hypot(*ab)
    if n == 0:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(np.cross(ab, pts - a)) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(pts[: i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.vstack([a, b])


def catmull_rom_path(pts, closed):
    """Centripetal-ish Catmull-Rom (tension 1/6) through points -> cubic Bezier SVG path."""
    n = len(pts)
    if n < 2:
        return ""
    d = [f"M{fmt(pts[0][0])} {fmt(pts[0][1])}"]
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed else pts[min(i + 2, n - 1)]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        d.append(f"C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}")
    if closed:
        d.append("Z")
    return "".join(d)


# ---------------------------------------------------------------- 2. outline
S = 3  # supersampling for sub-pixel contours
soft = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 0.9)
big = cv2.resize(soft, (W * S, H * S), interpolation=cv2.INTER_CUBIC)
bw = (big > 0.5).astype(np.uint8)
contours, hier = cv2.findContours(bw, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
outline_parts = []
for c in contours:
    if cv2.contourArea(c) < 30 * S * S:
        continue
    pts = c[:, 0, :].astype(float)
    pts = smooth_closed(pts, 2.2 * S / 3)
    pts = rdp(np.vstack([pts, pts[:1]]), 0.35 * S)[:-1] / S
    outline_parts.append(catmull_rom_path(pts, closed=True))
outline = "".join(outline_parts)

# ---------------------------------------------------------------- 3. skeleton graph
smask = ndimage.binary_opening(ndimage.binary_closing(mask, iterations=2), iterations=1)
skel = morphology.skeletonize(smask)
dt = ndimage.distance_transform_edt(mask)

K = np.ones((3, 3), int)
K[1, 1] = 0


def neighbours(p):
    y, x = p
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dy or dx) and 0 <= y + dy < H and 0 <= x + dx < W and skel[y + dy, x + dx]:
                yield (y + dy, x + dx)


def build_graph():
    deg = ndimage.convolve(skel.astype(int), K, mode="constant") * skel
    node_px = skel & (deg != 2)
    lab, n = ndimage.label(node_px, structure=np.ones((3, 3)))
    node_of = {}
    centers = {}
    for i in range(1, n + 1):
        pys, pxs = np.nonzero(lab == i)
        centers[i] = (float(pys.mean()), float(pxs.mean()))
        for p in zip(pys, pxs):
            node_of[p] = i
    edges = []
    seen = set()
    for p, nid in node_of.items():
        for q in neighbours(p):
            if q in node_of:
                continue
            if (p, q) in seen:
                continue
            path = [p, q]
            prev, cur = p, q
            while True:
                nxt = [r for r in neighbours(cur) if r != prev and r not in path[-3:]]
                if not nxt:
                    end = None
                    break
                node_n = [r for r in nxt if r in node_of]
                if node_n:
                    path.append(node_n[0])
                    end = node_of[node_n[0]]
                    break
                prev, cur = cur, nxt[0]
                path.append(cur)
            if end is None:
                continue
            seen.add((path[-1], path[-2]))
            seen.add((p, q))
            edges.append({"a": nid, "b": end, "px": path})
    # skeleton loops without nodes
    covered = set(node_of)
    for e in edges:
        covered.update(e["px"])
    rest = skel.copy()
    for p in covered:
        rest[p] = False
    lab2, n2 = ndimage.label(rest, structure=np.ones((3, 3)))
    for i in range(1, n2 + 1):
        pys, pxs = np.nonzero(lab2 == i)
        if len(pys) < 20:
            continue
        start = (pys[0], pxs[0])
        path, prev, cur = [start], None, start
        while True:
            nxt = [r for r in neighbours(cur) if r != prev and r not in path]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            path.append(cur)
        nid = max(centers) + 1 if centers else 1
        centers[nid] = (float(start[0]), float(start[1]))
        path.append(start)
        edges.append({"a": nid, "b": nid, "px": path})
    return centers, edges


centers, edges = build_graph()


def elen(e):
    p = np.array(e["px"], float)
    return float(np.hypot(*np.diff(p, axis=0).T).sum())


# prune short spurs (edge ending in a degree-1 node)
SPUR = 26
for _ in range(6):
    deg = {}
    for e in edges:
        deg[e["a"]] = deg.get(e["a"], 0) + 1
        deg[e["b"]] = deg.get(e["b"], 0) + 1
    keep = []
    removed = False
    for e in edges:
        leaf = (deg[e["a"]] == 1) != (deg[e["b"]] == 1)
        if leaf and elen(e) < SPUR:
            removed = True
            continue
        keep.append(e)
    edges = keep
    # merge nodes of degree 2
    changed = True
    while changed:
        changed = False
        deg = {}
        for e in edges:
            deg[e["a"]] = deg.get(e["a"], 0) + 1
            deg[e["b"]] = deg.get(e["b"], 0) + 1
        for nid, dg in deg.items():
            if dg != 2:
                continue
            inc = [e for e in edges if nid in (e["a"], e["b"])]
            if len(inc) != 2 or inc[0] is inc[1]:
                continue
            e1, e2 = inc
            p1 = e1["px"] if e1["b"] == nid else e1["px"][::-1]
            o1 = e1["a"] if e1["b"] == nid else e1["b"]
            p2 = e2["px"] if e2["a"] == nid else e2["px"][::-1]
            o2 = e2["b"] if e2["a"] == nid else e2["a"]
            edges = [e for e in edges if e is not e1 and e is not e2]
            edges.append({"a": o1, "b": o2, "px": p1 + p2[1:]})
            changed = True
            break
    if not removed:
        break

for i, e in enumerate(edges):
    e["id"] = i
    e["len"] = elen(e)


def node_xy(nid):
    y, x = centers[nid]
    return np.array([x, y])


def direction(px, from_start=True, span=18):
    p = np.array(px, float)[:, ::-1]  # -> x, y
    if not from_start:
        p = p[::-1]
    k = min(span, len(p) - 1)
    v = p[k] - p[0]
    n = np.hypot(*v)
    return v / n if n else v


# ---------------------------------------------------------------- 4. order strokes
ORDER_OVERRIDE = json.loads(sys.argv[4]) if len(sys.argv) > 4 else None


def auto_order():
    used = set()
    strokes = []
    pen = None
    while len(used) < len(edges):
        # candidate starts: endpoints of unused edges
        deg_unused = {}
        for e in edges:
            if e["id"] in used:
                continue
            for n in (e["a"], e["b"]):
                deg_unused[n] = deg_unused.get(n, 0) + 1
        odd = [n for n, d in deg_unused.items() if d % 2 == 1]
        cands = odd or list(deg_unused)
        if pen is None:
            start = min(cands, key=lambda n: node_xy(n)[0])
        else:
            # nearest to the pen, strongly preferring to keep moving right
            def cost(n):
                v = node_xy(n) - pen
                return np.hypot(*v) + (max(0, -v[0]) * 2.5)

            start = min(cands, key=cost)
        stroke = []
        node, heading = start, None
        while True:
            inc = [e for e in edges if e["id"] not in used and node in (e["a"], e["b"])]
            if not inc:
                break
            best, best_px, best_score = None, None, None
            for e in inc:
                px = e["px"] if e["a"] == node else e["px"][::-1]
                d0 = direction(px)
                score = -float(np.dot(d0, heading)) if heading is not None else -d0[1] * 0.2 - d0[0]
                if best_score is None or score < best_score:
                    best, best_px, best_score = e, px, score
            if heading is not None and best_score > 0.45 and stroke:
                break  # would be a sharp reversal at a junction -> lift the pen
            used.add(best["id"])
            stroke.append((best["id"], best_px))
            node = best["b"] if best["a"] == node else best["a"]
            heading = -direction(best_px, from_start=False)
        strokes.append(stroke)
        last = stroke[-1][1][-1]
        pen = np.array([last[1], last[0]], float)
    return strokes


strokes_px = auto_order()
if ORDER_OVERRIDE:
    by_id = {e["id"]: e for e in edges}
    strokes_px = []
    for spec in ORDER_OVERRIDE:  # [[edgeId, reversed?], ...] per stroke
        strokes_px.append([(eid, by_id[eid]["px"][::-1] if rev else by_id[eid]["px"]) for eid, rev in spec])

strokes = []
for st in strokes_px:
    px = []
    for _, p in st:
        px.extend(p if not px else p[1:])
    pts = np.array(px, float)[:, ::-1]
    wid = float(np.percentile([dt[int(y), int(x)] for x, y in pts], 90)) * 2 + 7
    pts = smooth_open(pts, 3.0)
    pts = rdp(pts, 0.6)
    L = float(np.hypot(*np.diff(pts, axis=0).T).sum())
    strokes.append({"d": catmull_rom_path(pts, closed=False), "len": round(L, 1), "w": round(wid, 1),
                    "edges": [[eid, 0] for eid, _ in st]})

json.dump({"width": W, "height": H, "outline": outline, "strokes": strokes}, open(OUT, "w"))
print(f"size {W}x{H}; edges {len(edges)}; strokes {len(strokes)}")
for i, s in enumerate(strokes):
    print(i, "len", s["len"], "w", s["w"], "edges", [e[0] for e in s["edges"]])

if PREVIEW:
    img = Image.new("RGB", (W, H), (12, 12, 12))
    dr = ImageDraw.Draw(img)
    m = Image.fromarray((mask * 60).astype(np.uint8))
    img.paste((70, 20, 20), mask=m)
    import colorsys

    for i, st in enumerate(strokes_px):
        col = tuple(int(c * 255) for c in colorsys.hsv_to_rgb(i / max(1, len(strokes_px)), 0.9, 1))
        for eid, p in st:
            xy = [(x, y) for y, x in p]
            dr.line(xy, fill=col, width=3)
            mid = xy[len(xy) // 2]
            dr.text((mid[0] + 4, mid[1] + 4), f"e{eid}", fill=(200, 200, 200))
        sy, sx = st[0][1][0]
        dr.ellipse([sx - 7, sy - 7, sx + 7, sy + 7], outline=col, width=3)
        dr.text((sx - 22, sy - 22), f"S{i}", fill=col)
    img.save(PREVIEW)
