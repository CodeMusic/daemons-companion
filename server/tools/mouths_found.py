# C-303: a mouth for the daemons nobody has checked, for the app's speaking overlay (data/mouths.found.json).
#
#   python3 tools/mouths_found.py OUT_DIR      candidates.json in OUT_DIR: each unchecked daemon's guessed eyes and mouth
#
# It only SUGGESTS. tools/mouths.ts looks under checked eyes; this looks at the daemons with no checked face at all,
# where tools/faces.ts's eye guesses (small dark patches) miss the big-eyed sprites: it finds the PAIR of large dark eyes
# with a light in each, then a short dark or red run between and below them. About two in three of its suggestions were
# right when first run (2026-11-06: 148 suggested, 101 accepted by eye on sheets). An accepted mouth is typed into
# data/mouths.found.json by hand; nothing here writes that file. Needs Pillow (DAEMONS' tools use ~/.pyenv/shims/python3).
import json, os, sys
from PIL import Image
S = sys.argv[1]
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data") + os.sep
faces = json.load(open(DATA + "faces.json")); species = json.load(open(DATA + "species.json"))
found = json.load(open(DATA + "mouths.found.json"))["mouths"] if os.path.exists(DATA + "mouths.found.json") else {}
stems = {}
for r in species.values():
    a = (r.get("art") or {}).get("front")
    if a: stems[a.split("/")[-1].replace("_front.png", "")] = r["name"]
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
def comps(mask):
    seen, out = set(), []
    for p in mask:
        if p in seen: continue
        st, cells = [p], []
        seen.add(p)
        while st:
            c = st.pop(); cells.append(c)
            for dx, dy in N4:
                q = (c[0] + dx, c[1] + dy)
                if q in mask and q not in seen: seen.add(q); st.append(q)
        out.append(cells)
    return out
def detect(stem):
    im = Image.open(DATA + "art/" + stem + ".png"); pal = im.getpalette(); px = im.load()
    at = lambda x, y: px[x, y] if 0 <= x < 64 and 0 <= y < 64 else 0
    rgb = lambda i: tuple(pal[i * 3:i * 3 + 3])
    lum = {i: sum(rgb(i)) for i in range(16)}
    body = [(x, y) for y in range(64) for x in range(64) if at(x, y)]
    if not body: return None
    top, bottom = min(p[1] for p in body), max(p[1] for p in body)
    darkest = min((i for i in range(1, 16) if any(at(x, y) == i for x, y in body)), key=lambda i: lum[i])
    dark = {i for i in range(1, 16) if lum[i] <= lum[darkest] + 150}
    light = {i for i in range(1, 16) if lum[i] >= 600}
    D = {p for p in body if at(*p) in dark}
    eyes = []
    for cells in comps(D):
        xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if not (6 <= len(cells) <= 110 and 3 <= w <= 15 and 3 <= h <= 15): continue
        if any(at(c[0] + dx, c[1] + dy) == 0 for c in cells for dx, dy in N4): continue           # the outline
        if len(cells) / (w * h) < 0.35: continue
        glint = sum(1 for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if at(x, y) in light)
        if not glint: continue                                                                     # an eye has a light in it
        if y0 > top + (bottom - top) * 0.7: continue
        eyes.append(dict(box=[x0, y0, w, h], n=len(cells), cx=(x0 + x1) / 2, cy=(y0 + y1) / 2, cells=set(cells)))
    best = None
    for i in range(len(eyes)):
        for j in range(i + 1, len(eyes)):
            a, b = sorted((eyes[i], eyes[j]), key=lambda e: e["cx"])
            dx, dy = b["cx"] - a["cx"], abs(a["cy"] - b["cy"])
            ratio = min(a["n"], b["n"]) / max(a["n"], b["n"])
            if dy > 3 or dx < 6 or dx > 36 or ratio < 0.45: continue
            if b["box"][0] - (a["box"][0] + a["box"][2]) < 1: continue
            score = ratio * 2 - dy * 0.3 + min(a["n"], b["n"]) / 40
            if not best or score > best[0]: best = (score, a, b)
    if not best: return None
    _, a, b = best
    eyecells = a["cells"] | b["cells"]
    span = b["cx"] - a["cx"]; cx = (a["cx"] + b["cx"]) / 2
    below = max(a["box"][1] + a["box"][3], b["box"][1] + b["box"][3])
    midy = (a["cy"] + b["cy"]) / 2
    red = lambda i: (lambda r, g, bl: r > g + 45 and r > bl + 25 and r > 120)(*rgb(i))
    xl, xr = int(a["box"][0] + a["box"][2] - 1), int(b["box"][0] + 1)
    cands = []
    for y in range(int(midy) + 1, min(63, int(below + max(5, span * 0.9))) + 1):
        x = xl
        while x <= xr:
            if (x, y) not in eyecells and (at(x, y) in dark or red(at(x, y))) and all(at(x + dx, y + dy) for dx, dy in N4):
                s = x
                while x <= xr and (x, y) not in eyecells and (at(x, y) in dark or red(at(x, y))) and all(at(x + dx, y + dy) for dx, dy in N4): x += 1
                w = x - s
                if 1 <= w <= 8:
                    # not a long line running on to either side (a collar, a jaw line)
                    if at(s - 1, y) in dark or at(x, y) in dark: continue
                    mid = s + w / 2
                    cands.append((abs(mid - cx) * 1.0 + abs(y - (below + span * 0.25)) * 0.6 - (1.5 if w >= 2 else 0), [s, y, w, 1]))
            else: x += 1
    if not cands: return None
    cands.sort()
    if cands[0][0] > span * 0.45 + 2: return None                                            # too far from where a mouth sits
    return dict(name=stems[stem], eyes=[a["box"], b["box"]], mouth=cands[0][1], drawn=True, sure=1)
out = {}
for stem in sorted(stems):
    if stem in faces or stem in found: continue     # a person has checked these (mouth or none), or one is already found
    try: d = detect(stem)
    except Exception as e: d = None
    if d: out[stem] = d
json.dump(out, open(os.path.join(S, "candidates.json"), "w"), indent=1)
print(len(out), "suggested, of", len([s for s in stems if s not in faces and s not in found]), "daemons with no mouth checked or found")
