#!/usr/bin/env python3
"""C-349: THE ACCENTS -- each place's palette from the game, for the app to wear once the save has reached it.

For every place (a map section, by our name, as data/maps.json names it) this reads the game's own colours: the
place's first outdoor map (a town or a route before a cave, a cave before a room), every colour weighed by how many of
the map's pixels show it (its blocks, their metatiles, their tiles and palettes), and keeps four: DEEP (the darkest strong colour),
MAIN (the strongest mid colour of the place's own tileset, which the app's theme is mixed from, as a weekday's is), LIGHT (the palest) and SPARK
(the strongest colour furthest in hue from MAIN). THE BLACKOUT's own colours are the engine's (daemons_blackout.c,
T-546): the purple that breathes and the green threads, and `breathe` tells the app to breathe them.

Reads the engine checkout (DAEMONS' engineGba, or --engine); writes data/accents.json with --write, reports without.
    ~/.pyenv/shims/python3 server/tools/accents.py [--engine PATH] [--write]
"""
import argparse, colorsys, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(DATA, "accents.json")
OWN = 4          # a pixel of the place's own tileset (its secondary) counts four times one of the grass and water every place shares
TYPE_ORDER = {"MAP_TYPE_TOWN": 0, "MAP_TYPE_CITY": 0, "MAP_TYPE_ROUTE": 1, "MAP_TYPE_UNDERGROUND": 2, "MAP_TYPE_INDOOR": 3}
# T-546: THE BLACKOUT -- its lit purple (row 8's breath) and its threads (row 8, index 6), from daemons_blackout.c's slots
BLACKOUT = {"tileset": "gTileset_RockTunnel", "deep": "#200a2a", "main": "#8838a4", "light": "#ec96f0", "spark": "#a8ff78"}


def default_engine():
    for p in (os.path.expanduser("~/Projects/DAEMONS/engineGba"), os.path.expanduser("~/Projects/pokefirered-daemons")):
        if os.path.isdir(os.path.join(p, "data", "maps")):
            return p
    return None


def read_pal(path):
    with open(path) as f:
        lines = f.read().split("\n")
    return [tuple(int(v) for v in l.split()) for l in lines[3:19] if l.strip()]


def tileset_parts(engine):
    """symbol -> (tiles folder, palettes folder, metatiles.bin), read from headers.h's Tileset structs and the INCBINs
    their parts name (graphics.h, metatiles.h, and src/graphics.c, where the primary General's tiles are)."""
    t = os.path.join(engine, "src", "data", "tilesets")
    src = "".join(open(f).read() for f in (os.path.join(t, "graphics.h"), os.path.join(t, "metatiles.h"),
                                           os.path.join(engine, "src", "graphics.c")))
    path = {}
    for m in re.finditer(r"(g\w+)\[\](?:\[16\])?\s*=\s*(?:INCBIN_U\d+\(\s*\"([^\"]+)\"|\{(.*?)\};)", src, re.S):
        p = m.group(2) or (re.search(r'"([^"]+)"', m.group(3) or "") or [None, None])[1]
        if p:
            path[m.group(1)] = p
    out = {}
    for m in re.finditer(r"const struct Tileset (gTileset_\w+)\s*=\s*\{(.*?)\};", open(os.path.join(t, "headers.h")).read(), re.S):
        f = dict(re.findall(r"\.(tiles|palettes|metatiles)\s*=\s*(\w+)", m.group(2)))
        tiles, pals, metas = (path.get(f.get(k, "")) for k in ("tiles", "palettes", "metatiles"))
        if tiles and pals and metas:
            out[m.group(1)] = (os.path.join(engine, os.path.dirname(tiles)), os.path.join(engine, os.path.dirname(pals)),
                               os.path.join(engine, metas))
    return out


def hexc(c):
    return "#%02x%02x%02x" % tuple(c[:3])


class Tileset:
    def __init__(self, parts):
        from PIL import Image
        folder, pals, metas = parts
        self.pals = [read_pal(os.path.join(pals, "%02d.pal" % i)) if os.path.exists(os.path.join(pals, "%02d.pal" % i)) else []
                     for i in range(16)]
        im = Image.open(os.path.join(folder, "tiles.png"))
        w = im.size[0] // 8
        px = im.load()
        self.tiles = []                       # each tile: a count of its colour indices
        for t in range((im.size[0] // 8) * (im.size[1] // 8)):
            tx, ty = (t % w) * 8, (t // w) * 8
            c = [0] * 16
            for y in range(8):
                for x in range(8):
                    c[px[tx + x, ty + y] & 15] += 1
            self.tiles.append(c)
        mb = open(metas, "rb").read()
        self.metatiles = [[int.from_bytes(mb[i + 2 * k:i + 2 * k + 2], "little") for k in range(8)] for i in range(0, len(mb), 16)]


def usage(engine, lay, primary, secondary):
    """Every colour the map shows, by how many pixels show it (each metatile's eight tiles, as the map lays them)."""
    from collections import Counter
    blocks = open(os.path.join(engine, lay["blockdata_filepath"]), "rb").read()
    count = Counter()
    for i in range(0, len(blocks), 2):
        count[int.from_bytes(blocks[i:i + 2], "little") & 0x3FF] += 1
    seen, own = Counter(), Counter()
    for mt, n in count.items():
        meta = primary.metatiles[mt] if mt < 640 else (secondary.metatiles[mt - 640] if mt - 640 < len(secondary.metatiles) else None)
        if not meta:
            continue
        for e in meta:
            tile, pal = e & 0x3FF, (e >> 12) & 15
            ts = primary if tile < 640 else secondary
            ti = tile if tile < 640 else tile - 640
            if ti >= len(ts.tiles) or pal >= len(primary.pals if pal < 7 else secondary.pals):
                continue
            row = (primary if pal < 7 else secondary).pals[pal]
            for idx, k in enumerate(ts.tiles[ti]):
                if k and idx and idx < len(row):
                    seen[row[idx][:3]] += k * n * (OWN if ts is secondary else 1)
                    if ts is secondary:
                        own[row[idx][:3]] += k * n
    return seen, own


def weigh(seen):
    total = sum(seen.values()) or 1
    hls = []
    for c, n in seen.items():
        h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in c))
        hls.append((c, h, l, s, n / total))
    return [x for x in hls if x[3] > 0.2 and 0.1 < x[2] < 0.9 and x[4] > 0.004] or hls


def pick(seen, own):
    """MAIN from the place's own tileset alone (the grass and water every place shares never decide it), the rest from all."""
    strong = weigh(seen)
    mine = [x for x in weigh(own) if 0.25 <= x[2] <= 0.62 and x[3] > 0.25] if own else []
    mids = mine or [x for x in strong if 0.25 <= x[2] <= 0.62] or strong
    main = max(mids, key=lambda x: x[4] * (0.4 + x[3]))
    deep = max([x for x in strong if x[2] < 0.3] or strong, key=lambda x: x[4] * (1 - x[2]))
    light = max([x for x in strong if x[2] > 0.65] or strong, key=lambda x: x[4] * x[2])
    gap = lambda x: min(abs(x[1] - main[1]), 1 - abs(x[1] - main[1]))
    spark = max(strong, key=lambda x: gap(x) * x[3] * (x[4] ** 0.5))
    return {"deep": hexc(deep[0]), "main": hexc(main[0]), "light": hexc(light[0]), "spark": hexc(spark[0])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default=default_engine())
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if not a.engine:
        sys.exit("no engine checkout found; pass --engine")
    maps = json.load(open(os.path.join(DATA, "maps.json")))
    layouts = {l["id"]: l for l in json.load(open(os.path.join(a.engine, "data", "layouts", "layouts.json")))["layouts"] if "id" in l}
    dirs = tileset_parts(a.engine)
    cache = {}
    def tileset(sym):
        if sym not in cache:
            cache[sym] = Tileset(dirs[sym]) if sym in dirs else None
        return cache[sym]
    by_place = {}
    for key, m in maps.items():
        if key.startswith("_"):
            continue
        f = os.path.join(a.engine, "data", "maps", m["map"], "map.json")
        if not os.path.exists(f):
            continue
        mj = json.load(open(f))
        lay = layouts.get(mj.get("layout"))
        if not lay:
            continue
        rank = (TYPE_ORDER.get(mj.get("map_type"), 4), key.count("."), [int(x) for x in key.split(".")])
        best = by_place.get(m["place"])
        if best is None or rank < best[0]:
            by_place[m["place"]] = (rank, key, m["map"], lay)
    accents = {}
    for place, (_, key, mapname, lay) in sorted(by_place.items()):
        if lay["secondary_tileset"] == BLACKOUT["tileset"]:
            accents[place] = {k: v for k, v in BLACKOUT.items() if k != "tileset"} | {"map": mapname, "breathe": True}
            continue
        pri, sec = tileset(lay["primary_tileset"]), tileset(lay["secondary_tileset"])
        if not pri or not sec:
            continue
        seen, own = usage(a.engine, lay, pri, sec)
        if seen:
            accents[place] = pick(seen, own) | {"map": mapname}
    out = {"_about": "C-349: each place's palette from the game -- deep, main (the app's theme is mixed from it), light, spark -- "
                     "weighed by how much of its first outdoor map shows each colour by server/tools/accents.py. `breathe`: the app "
                     "breathes it, as the game does (THE BLACKOUT, T-546).",
           "accents": accents}
    text = json.dumps(out, indent=1, ensure_ascii=False) + "\n"
    old = open(OUT).read() if os.path.exists(OUT) else ""
    print(f"{len(accents)} places' accents{' (unchanged)' if old == text else ''}")
    if a.write and old != text:
        tmp = OUT + ".tmp"
        open(tmp, "w").write(text)
        os.replace(tmp, OUT)
        print("wrote", OUT)


if __name__ == "__main__":
    main()
