#!/usr/bin/env python3
"""C-232: THE SUBTLE LAYER's cards -- the faces the daemon, its keyword and its phrase are laid over (data/arcana.json).

Both on the book's purple (DAEMONS tools/gensubtle.py: C_RULE the hue, C_MARGIN lit), as the user asked (2026-10-28):
  REASON    a circuit board under a green gradient -- traces at right angles, their pads -- the mainland's mind
  INSTINCT  a living net under gold -- nodes, and the curves between them -- the islands' mind
and each again SHINY: its colours inverted, a gold foil edge and a few glints. A soft dark halo where the daemon stands.
Every face the same size and layout as the app and the watch draw over it (CARD below). Original art, nothing of
Nintendo's. Pillow; run from server/:  python3 tools/arcana_backs.py [--write]
"""
import math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageOps

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "art")
W, H = 240, 400
CARD = {"keyword_y": 46, "sprite_cy": 186, "sprite_size": 128, "phrase_y": 292, "name_y": 368, "roman_y": 18}
HUE, LIT, DEEP = (176, 86, 158), (239, 140, 214), (58, 24, 56)          # C_RULE (as gensubtle names it), C_MARGIN, its shade
GREEN, GREEN_LIT = (22, 150, 92), (128, 240, 180)
GOLD, GOLD_LIT = (224, 150, 40), (255, 214, 140)
FOIL = (255, 226, 122)


def gradient(top, bottom, fade_from=0.35):
    """the purple deepening upward, and the side's colour rising from the bottom"""
    im = Image.new("RGB", (W, H))
    px = im.load()
    for y in range(H):
        t = y / (H - 1)
        base = tuple(int(DEEP[i] + (HUE[i] - DEEP[i]) * min(1, t * 1.4)) for i in range(3))
        k = max(0.0, (t - fade_from) / (1 - fade_from)) ** 1.4 * 0.7
        c = tuple(int(base[i] + (bottom[i] - base[i]) * k) for i in range(3))
        for x in range(W):
            px[x, y] = c
    return im


def circuit(rng):
    """traces at right angles with pads at their ends and bends -- the board under REASON"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(26):
        x, y = rng.randrange(8, W - 8, 8), rng.randrange(8, H - 8, 8)
        pts = [(x, y)]
        for _ in range(rng.randint(2, 4)):
            if rng.random() < 0.5: x = max(8, min(W - 8, x + rng.choice([-1, 1]) * rng.randrange(16, 72, 8)))
            else: y = max(8, min(H - 8, y + rng.choice([-1, 1]) * rng.randrange(16, 96, 8)))
            pts.append((x, y))
        a = rng.randint(70, 130)
        d.line(pts, fill=GREEN_LIT + (a,), width=2)
        for px_, py_ in (pts[0], pts[-1]):
            d.ellipse((px_ - 3, py_ - 3, px_ + 3, py_ + 3), outline=GREEN_LIT + (a + 40,), width=1)
    for _ in range(5):                                                   # a few chips
        x, y = rng.randrange(16, W - 48, 8), rng.randrange(80, H - 40, 8)
        d.rectangle((x, y, x + 24, y + 14), outline=GREEN_LIT + (110,), width=1)
        for i in range(4): d.line((x + 3 + i * 6, y - 3, x + 3 + i * 6, y), fill=GREEN_LIT + (110,))
    return layer


def neural(rng):
    """nodes and the curves between them, a little glow -- the net under INSTINCT"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    nodes = [(rng.randint(10, W - 10), rng.randint(10, H - 10), rng.randint(2, 5)) for _ in range(30)]
    for i, (x, y, r) in enumerate(nodes):
        near = sorted(nodes, key=lambda n: (n[0] - x) ** 2 + (n[1] - y) ** 2)[1:4]
        for (x2, y2, _) in near:
            mx, my = (x + x2) / 2 + rng.randint(-18, 18), (y + y2) / 2 + rng.randint(-18, 18)
            pts = [((1 - t) ** 2 * x + 2 * (1 - t) * t * mx + t * t * x2, (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * y2)
                   for t in [k / 16 for k in range(17)]]
            d.line(pts, fill=GOLD_LIT + (rng.randint(60, 110),), width=1)
    glow = layer.filter(ImageFilter.GaussianBlur(2))
    d2 = ImageDraw.Draw(layer)
    for (x, y, r) in nodes:
        d2.ellipse((x - r, y - r, x + r, y + r), fill=GOLD_LIT + (170,))
    return Image.alpha_composite(glow, layer)


def face(kind, shiny=False, seed=231):
    rng = random.Random(seed + (0 if kind == "reason" else 1))
    im = gradient(HUE, GREEN if kind == "reason" else GOLD).convert("RGBA")
    im = Image.alpha_composite(im, circuit(rng) if kind == "reason" else neural(rng))
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))                      # where the daemon stands
    s, cy = CARD["sprite_size"], CARD["sprite_cy"]
    ImageDraw.Draw(halo).ellipse((W / 2 - s * 0.62, cy - s * 0.58, W / 2 + s * 0.62, cy + s * 0.58), fill=DEEP + (150,))
    im = Image.alpha_composite(im, halo.filter(ImageFilter.GaussianBlur(10)))
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))                      # the phrase's panel, so its words read over the pattern
    py = CARD["phrase_y"]
    ImageDraw.Draw(band).rounded_rectangle((14, py - 22, W - 15, py + 36), radius=10, fill=DEEP + (190,))
    im = Image.alpha_composite(im, band.filter(ImageFilter.GaussianBlur(1)))
    if shiny:
        rgb = ImageOps.invert(im.convert("RGB")).convert("RGBA")
        im = rgb
    d = ImageDraw.Draw(im)
    edge = FOIL if shiny else LIT
    d.rounded_rectangle((1, 1, W - 2, H - 2), radius=14, outline=edge, width=3)
    d.rounded_rectangle((7, 7, W - 8, H - 8), radius=10, outline=edge + (140,), width=1)
    if shiny:                                                            # a few glints
        g = random.Random(seed + 7)
        for _ in range(9):
            x, y, r = g.randint(14, W - 14), g.randint(14, H - 14), g.randint(3, 6)
            d.line((x - r, y, x + r, y), fill=FOIL, width=1); d.line((x, y - r, x, y + r), fill=FOIL, width=1)
    # the corners rounded clear
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), radius=14, fill=255)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0)); out.paste(im, (0, 0), mask)
    return out


def main():
    write = "--write" in sys.argv
    for kind in ("reason", "instinct"):
        for shiny in (False, True):
            name = f"arcana_{kind}{'_shiny' if shiny else ''}.png"
            img = face(kind, shiny)
            if write: img.save(os.path.join(OUT, name), optimize=True)
            print(("  written: " if write else "  would write: ") + name)


if __name__ == "__main__":
    main()
