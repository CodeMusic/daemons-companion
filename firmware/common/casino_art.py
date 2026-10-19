#!/usr/bin/env python3
"""C-158 (the user, 2026-10-18: "the phone casino needs to be more like the devices"): THE CASINO's drawn pieces and the
holiday hats, as the boards draw them (firmware/esp32/src/casino.cpp drawn() and hat()), as pictures the phone, the site
and the Tab5 can show -- so a snowflake, a pumpkin or a santa hat looks the same on every screen.

The boards draw them in code with M5GFX's shapes; this is that code again in Python, shape for shape, at the boards' size
(a piece about 48 across on 56 x 56, a hat on 34 x 28). The day's colours are not baked in: index 1 is colourA, 2 colourB
and 3 the day's colour, filled in by whoever shows it (the server's /art/casino/<name>.png?a=&b=&day=, the Tab5's
palette) -- the holiday's two colours, or the season's own (casino.cpp colourA / colourB, below as SEASON).

    server/data/art/casino/<piece>.png and hat_<hat>.png   indexed, 0 clear
    server/data/casino_art.json                            what there is, the slots, the season colours
    firmware/common/casino_art.h                           the same pictures and palette for the Tab5 (8-bit indices)

A port drifts from what it was ported from, so PORTED holds the SHA-1 of the casino.cpp code each part came from:
when casino.cpp's drawn(), hat(), colourA() or colourB() changes, this reports "would write" (the generated-files test
fails) until the change is ported here and PORTED updated.

    python3 firmware/common/casino_art.py            report what would change
    python3 firmware/common/casino_art.py --write    write them
"""
import hashlib, io, json, math, os, re, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CASINO = os.path.join(ROOT, "firmware", "esp32", "src", "casino.cpp")
OUT_DIR = os.path.join(ROOT, "server", "data", "art", "casino")
OUT_JSON = os.path.join(ROOT, "server", "data", "casino_art.json")
OUT_H = os.path.join(HERE, "casino_art.h")

# the casino.cpp code each part is ported from, by its SHA-1 (whitespace kept): change one there, port it here
PORTED = {
    "drawn": "4b0b4b93a0cc52d9c5dde4590d162d8117650648",
    "hat": "3fc305359376f918883fc0a7b3c0a0fc60695054",
    "colourA": "040e169b030e43ab799c87ee165b98285f3f32c1",
    "colourB": "40c1827e5238ab797ed1471c4c32d494e72691e6",
}

PIECE, HAT = (56, 56), (34, 28)
A, B, DAY = 1, 2, 3                                  # the day's colours, filled in by whoever shows a picture
PAPER, INK = 0xFFFBF7, 0x181C21                       # app.h's PAPER 0xFFDE and INK 0x18E4, as the boards' screens show them
SEASON = {"winter": (0xA0D0FF, 0xFFFFFF), "spring": (0xFF90C0, 0x90E070), "summer": (0xFFD040, 0xFF8020), "autumn": (0xE07020, 0xFFC040)}
PIECES = ["coin", "snow", "frost", "petals", "sun", "leaves", "pumpkins", "presents", "hearts", "clover", "eggs", "fireworks",
          "moon", "berry", "gem", "mark", "rain", "storm", "fog", "star"]
HATS = ["santa", "witch", "party", "flower"]


def section(text, start, end):
    i = text.index(start)
    return text[i:text.index(end, i)]


def sources():
    t = open(CASINO).read()
    return {"drawn": section(t, "static void drawn(", "// a hat on a daemon's head"),
            "hat": section(t, "static void hat(", "static void drawPiece("),
            "colourA": section(t, "static uint32_t colourA()", "static uint32_t colourB()"),
            "colourB": section(t, "static uint32_t colourB()", "static uint16_t c565(")}


class Canvas:
    """M5GFX's shapes, on an indexed picture: every coordinate an int as the C++ passes it (a float truncated)."""
    def __init__(self, size):
        self.im = Image.new("P", size, 0)
        self.d = ImageDraw.Draw(self.im)

    def fillCircle(self, x, y, r, c):
        x, y, r = int(x), int(y), int(r)
        self.d.ellipse([x - r, y - r, x + r, y + r], fill=c)

    def drawCircle(self, x, y, r, c):
        x, y, r = int(x), int(y), int(r)
        self.d.ellipse([x - r, y - r, x + r, y + r], outline=c)

    def fillEllipse(self, x, y, rx, ry, c):
        x, y, rx, ry = int(x), int(y), int(rx), int(ry)
        self.d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=c)

    def fillTriangle(self, x0, y0, x1, y1, x2, y2, c):
        self.d.polygon([(int(x0), int(y0)), (int(x1), int(y1)), (int(x2), int(y2))], fill=c, outline=c)

    def fillRect(self, x, y, w, h, c):
        x, y, w, h = int(x), int(y), int(w), int(h)
        self.d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)

    def fillRoundRect(self, x, y, w, h, r, c):
        x, y, w, h = int(x), int(y), int(w), int(h)
        self.d.rounded_rectangle([x, y, x + w - 1, y + h - 1], radius=int(r), fill=c)

    def drawLine(self, x0, y0, x1, y1, c):
        self.d.line([(int(x0), int(y0)), (int(x1), int(y1))], fill=c)

    def drawFastHLine(self, x, y, w, c):
        self.d.line([(int(x), int(y)), (int(x) + int(w) - 1, int(y))], fill=c)

    # casino.cpp's own helpers
    def thick(self, x0, y0, x1, y1, w, c):
        for d in range(-(w // 2), (w - 1) // 2 + 1):
            if abs(x1 - x0) > abs(y1 - y0): self.drawLine(x0, y0 + d, x1, y1 + d, c)
            else: self.drawLine(x0 + d, y0, x1 + d, y1, c)

    def star(self, cx, cy, r, c):
        px, py = [], []
        for i in range(10):
            a, rr = -math.pi / 2 + i * math.pi / 5, (r * 0.45 if i % 2 else r)
            px.append(cx + rr * math.cos(a)); py.append(cy + rr * math.sin(a))
        for i in range(10):
            self.fillTriangle(cx, cy, px[i], py[i], px[(i + 1) % 10], py[(i + 1) % 10], c)

    def heart(self, cx, cy, r, c):
        self.fillCircle(cx - r // 2, cy - r // 4, r // 2 + 1, c); self.fillCircle(cx + r // 2, cy - r // 4, r // 2 + 1, c)
        self.fillTriangle(cx - r - 1, cy, cx + r + 1, cy, cx, cy + r + 2, c)


# One palette for every picture: the three slots, then each fixed colour numbered from 4 in the order first met.
class Painter(Canvas):
    def __init__(self, size, palette):
        super().__init__(size)
        self.palette = palette                       # shared by every picture: fixed colours in the order first met

    def ix(self, colour):
        if colour in (A, B, DAY):
            return colour
        if colour not in self.palette:
            self.palette.append(colour)
        return 4 + self.palette.index(colour)


def drawn(kind, palette):
    """casino.cpp drawn(): a piece drawn rather than pictured, about 48 across."""
    k = Painter(PIECE, palette); cx, cy = PIECE[0] // 2, PIECE[1] // 2
    a, b, white, gold, dark = A, B, k.ix(PAPER), k.ix(0xFFC830), k.ix(0x8A5A10)
    ink = k.ix(INK)
    cos, sin, PI = math.cos, math.sin, math.pi
    if kind == "coin":
        k.fillCircle(cx, cy, 21, dark); k.fillCircle(cx - 1, cy - 1, 20, gold); k.drawCircle(cx - 1, cy - 1, 15, dark)
        k.star(cx - 1, cy - 1, 10, k.ix(0xFFF0A0)); k.fillCircle(cx - 9, cy - 10, 3, k.ix(0xFFF8D0))
    elif kind in ("snow", "frost"):
        c = k.ix(0xDDEEFF)
        for i in range(6):
            ang = i * PI / 3
            ex, ey, mx, my = int(cx + 20 * cos(ang)), int(cy + 20 * sin(ang)), int(cx + 12 * cos(ang)), int(cy + 12 * sin(ang))
            k.thick(cx, cy, ex, ey, 2, c)
            k.drawLine(mx, my, mx + 6 * cos(ang + 0.8), my + 6 * sin(ang + 0.8), c)
            k.drawLine(mx, my, mx + 6 * cos(ang - 0.8), my + 6 * sin(ang - 0.8), c)
        k.fillCircle(cx, cy, 3, white)
    elif kind == "petals":
        for i in range(5):
            ang = -PI / 2 + i * 2 * PI / 5; k.fillCircle(cx + 11 * cos(ang), cy + 11 * sin(ang), 9, a)
        k.fillCircle(cx, cy, 6, k.ix(0xFFE060))
    elif kind == "sun":
        for i in range(8):
            ang = i * PI / 4; k.thick(cx + 15 * cos(ang), cy + 15 * sin(ang), cx + 22 * cos(ang), cy + 22 * sin(ang), 3, b)
        k.fillCircle(cx, cy, 13, a)
    elif kind == "leaves":
        k.fillTriangle(cx - 14, cy + 4, cx, cy - 20, cx + 14, cy + 4, a); k.fillTriangle(cx - 14, cy + 4, cx, cy + 16, cx + 14, cy + 4, a)
        k.fillTriangle(cx - 20, cy - 4, cx - 6, cy - 12, cx - 4, cy + 6, a); k.fillTriangle(cx + 20, cy - 4, cx + 6, cy - 12, cx + 4, cy + 6, a)
        k.thick(cx, cy + 22, cx, cy - 12, 2, dark)
    elif kind == "pumpkins":
        o, od = k.ix(0xFF7A1A), k.ix(0xC04A00)
        k.fillEllipse(cx - 9, cy + 3, 11, 16, od); k.fillEllipse(cx + 9, cy + 3, 11, 16, od); k.fillEllipse(cx, cy + 3, 13, 17, o)
        k.fillRect(cx - 2, cy - 18, 5, 7, k.ix(0x2E7D32))
        k.fillTriangle(cx - 9, cy - 1, cx - 3, cy - 1, cx - 6, cy - 7, ink); k.fillTriangle(cx + 3, cy - 1, cx + 9, cy - 1, cx + 6, cy - 7, ink)
        k.fillTriangle(cx - 9, cy + 7, cx + 9, cy + 7, cx, cy + 13, ink)
    elif kind == "presents":
        k.fillRect(cx - 17, cy - 10, 34, 28, a); k.fillRect(cx - 19, cy - 15, 38, 8, a)
        k.fillRect(cx - 3, cy - 15, 6, 33, b); k.fillRect(cx - 19, cy - 13, 38, 4, b)
        k.fillEllipse(cx - 7, cy - 19, 7, 4, b); k.fillEllipse(cx + 7, cy - 19, 7, 4, b)
    elif kind == "hearts":
        k.heart(cx, cy - 2, 18, a); k.heart(cx - 4, cy - 6, 6, k.ix(0xFFD0E0))
    elif kind == "clover":
        g = k.ix(0x20B040)
        k.heart(cx, cy - 12, 9, g); k.heart(cx - 11, cy, 9, g); k.heart(cx + 11, cy, 9, g)
        k.thick(cx, cy + 4, cx + 6, cy + 20, 2, g)
    elif kind == "eggs":
        k.fillEllipse(cx, cy, 15, 20, a)
        for i in range(-14, 14, 7): k.fillTriangle(cx + i, cy + 2, cx + i + 7, cy + 2, cx + i + 3, cy - 4, b)
        k.fillRect(cx - 14, cy + 2, 28, 4, b)
    elif kind == "fireworks":
        for i in range(12):
            ang = i * PI / 6; k.thick(cx + 6 * cos(ang), cy + 6 * sin(ang), cx + 21 * cos(ang), cy + 21 * sin(ang), 2, a if i % 2 else b)
        k.fillCircle(cx, cy, 4, white)
    elif kind == "moon":
        k.fillCircle(cx, cy, 19, k.ix(0xFFE070)); k.fillCircle(cx - 6, cy - 4, 4, k.ix(0xE8C050)); k.fillCircle(cx + 7, cy + 6, 3, k.ix(0xE8C050))
    elif kind == "berry":
        k.fillCircle(cx - 7, cy + 4, 12, k.ix(0xD02040)); k.fillCircle(cx + 8, cy + 6, 11, k.ix(0xB01030))
        k.fillTriangle(cx, cy - 8, cx + 14, cy - 20, cx + 4, cy - 6, k.ix(0x30A040))
    elif kind == "gem":
        c = k.ix(0x40D8E8)
        k.fillTriangle(cx - 18, cy - 4, cx + 18, cy - 4, cx, cy + 20, c); k.fillTriangle(cx - 18, cy - 4, cx + 18, cy - 4, cx, cy - 18, k.ix(0xA0F0FF))
    elif kind == "mark":
        k.fillCircle(cx, cy, 19, DAY); k.drawCircle(cx, cy, 19, white); k.star(cx, cy, 11, white)
    elif kind in ("rain", "storm", "fog"):
        cloud = k.ix(0xB8BCC4 if kind == "fog" else 0xD8DCE4)
        k.fillCircle(cx - 9, cy - 2, 10, cloud); k.fillCircle(cx + 6, cy - 6, 12, cloud); k.fillRoundRect(cx - 19, cy - 2, 38, 12, 6, cloud)
        if kind == "rain":
            for i in range(-12, 13, 8): k.drawLine(cx + i, cy + 14, cx + i - 3, cy + 22, k.ix(0x60A8FF))
        if kind == "storm":
            y = k.ix(0xFFE040)
            k.fillTriangle(cx + 2, cy + 8, cx - 6, cy + 20, cx + 1, cy + 18, y); k.fillTriangle(cx + 1, cy + 16, cx + 7, cy + 16, cx - 3, cy + 28, y)
        if kind == "fog":
            for i in range(3): k.drawFastHLine(cx - 18 + i * 4, cy + 14 + i * 5, 30, cloud)
    else:
        k.star(cx, cy, 19, a)                        # stars, confetti, streamers: a star in the holiday's colour
    return k.im


def hat(kind, palette):
    """casino.cpp hat(): a hat on a daemon's head; (cx, base) -- the middle of the head and just under its top -- is at
    HAT_AT in the picture."""
    k = Painter(HAT, palette); cx, base = HAT_AT
    a, b, paper = A, B, k.ix(PAPER)
    PI, cos, sin = math.pi, math.cos, math.sin
    if kind == "santa":
        k.fillTriangle(cx - 11, base, cx + 11, base, cx + 6, base - 16, k.ix(0xE02828))
        k.fillRoundRect(cx - 12, base - 3, 24, 5, 2, paper); k.fillCircle(cx + 7, base - 16, 3, paper)
    elif kind == "witch":
        w = k.ix(0x3A1A5A)
        k.fillTriangle(cx - 8, base, cx + 8, base, cx + 4, base - 20, w); k.fillRect(cx - 14, base - 2, 28, 3, w)
        k.fillRect(cx - 7, base - 5, 14, 3, k.ix(0xFF7A1A))
    elif kind == "party":
        k.fillTriangle(cx - 8, base, cx + 8, base, cx, base - 18, a)
        k.drawLine(cx - 5, base - 5, cx + 4, base - 9, b); k.drawLine(cx - 3, base - 10, cx + 2, base - 13, b)
        k.fillCircle(cx, base - 18, 3, b)
    elif kind == "flower":
        for i in range(5):
            ang = i * 2 * PI / 5; k.fillCircle(cx + 9 + 4 * cos(ang), base - 2 + 4 * sin(ang), 3, a)
        k.fillCircle(cx + 9, base - 2, 2, b)
    return k.im


HAT_AT = (15, 22)

# the slots' stand-in colours in a written PNG (whoever shows it fills them): autumn's, and the day's MONDAY blue
STAND_IN = {A: SEASON["autumn"][0], B: SEASON["autumn"][1], DAY: 0x315A62}


def rgb(c):
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255]


def png(im, palette):
    p = [0, 0, 0] + rgb(STAND_IN[A]) + rgb(STAND_IN[B]) + rgb(STAND_IN[DAY]) + [x for c in palette for x in rgb(c)]
    out = im.copy()
    out.putpalette(p + [0] * (768 - len(p)))
    buf = io.BytesIO()
    out.save(buf, "PNG", transparency=0, optimize=False)
    return buf.getvalue()


def header(pics, palette):
    lines = ["// Generated by firmware/common/casino_art.py from firmware/esp32/src/casino.cpp's drawn() and hat() -- edit those",
             "// (and port them there), not this. C-158: THE CASINO's drawn pieces and holiday hats, as the boards draw them, for",
             "// a screen that shows pictures (the Tab5). 8-bit indices: 0 clear, 1 colourA, 2 colourB, 3 the day's colour (each",
             "// filled in by the screen: the holiday's colours, else the season's -- CASINO_SEASON), then CASINO_PALETTE from 4.",
             "#pragma once",
             "#include <stdint.h>",
             "#ifndef PROGMEM",
             "#define PROGMEM",
             "#endif",
             "",
             "struct CasinoArt { const char *name; uint8_t w, h; int8_t atX, atY; const uint8_t *px; };   // at: a hat's (head middle, base)",
             f"static const uint32_t CASINO_PALETTE[{len(palette)}] = {{ " + ", ".join(f"0x{c:06X}" for c in palette) + " };",
             f"static const int CASINO_PALETTE_N = {len(palette)};",
             "struct CasinoSeason { const char *season; uint32_t a, b; };",
             "static const CasinoSeason CASINO_SEASON[] = { " + ", ".join(f'{{ "{s}", 0x{a:06X}, 0x{b:06X} }}' for s, (a, b) in SEASON.items()) + " };",
             ""]
    table = []
    for name, im, at in pics:
        ident = "CASINO_ART_" + re.sub(r"\W", "_", name).upper()
        data = list(im.getdata())
        rows = [", ".join(str(v) for v in data[i:i + 28]) for i in range(0, len(data), 28)]
        lines.append(f"static const uint8_t {ident}[{len(data)}] PROGMEM = {{")
        lines += ["  " + r + "," for r in rows]
        lines.append("};")
        table.append(f'  {{ "{name}", {im.width}, {im.height}, {at[0]}, {at[1]}, {ident} }},')
    lines.append(f"static const CasinoArt CASINO_ART[{len(pics)}] = {{")
    lines += table
    lines.append("};")
    lines.append(f"static const int CASINO_ART_N = {len(pics)};")
    return "\n".join(lines) + "\n"


def build():
    palette = []
    pics = [(k, drawn(k, palette), (-1, -1)) for k in PIECES] + [("hat_" + h, hat(h, palette), HAT_AT) for h in HATS]
    files = {os.path.join(OUT_DIR, f"{n}.png"): png(im, palette) for n, im, _ in pics}
    files[OUT_JSON] = (json.dumps({
        "_about": "Generated by firmware/common/casino_art.py from firmware/esp32/src/casino.cpp's drawn() and hat() -- edit "
                  "those (and port them there), not this. Indexed PNGs in art/casino/: 0 clear, 1 colourA, 2 colourB, 3 the "
                  "day's colour -- GET /art/casino/<name>.png?a=RRGGBB&b=RRGGBB&day=RRGGBB fills them.",
        "pieces": PIECES, "hats": {h: {"w": HAT[0], "h": HAT[1], "x": HAT_AT[0], "y": HAT_AT[1]} for h in HATS},
        "piece": {"w": PIECE[0], "h": PIECE[1]}, "slots": {"a": A, "b": B, "day": DAY},
        "season": {s: [f"#{a:06x}", f"#{b:06x}"] for s, (a, b) in SEASON.items()},
    }, indent=1) + "\n").encode()
    files[OUT_H] = header(pics, palette).encode()
    return files


# A PNG is the same file when it is the same picture: zlib builds compress the same pixels to different bytes (the Mac's
# Pillow 11 ships zlib-ng, Debian's 9.4 classic zlib -- every PNG read as changed on the CoreMP135 hub, C-168, 2026-10-19),
# so a PNG is compared by what it shows -- mode, size, pixels (an RGBA's alpha among them), and for a palette picture
# each index it uses, its colour and how transparent it is. The .json and the .h stay compared byte for byte.
def picture(data):
    im = Image.open(io.BytesIO(data))
    im.load()
    px, info = im.tobytes(), im.info.get("transparency")
    if im.mode != "P":
        return im.mode, im.size, px, info
    pal = im.getpalette() or []
    def alpha(i):
        if isinstance(info, int):
            return 0 if i == info else 255
        return info[i] if isinstance(info, (bytes, bytearray)) and i < len(info) else 255
    return im.mode, im.size, px, [(tuple(pal[3 * i:3 * i + 3]), alpha(i)) for i in sorted(set(px))]


def same(path, old, body):
    if old == body:
        return True
    if old is None or not path.endswith(".png"):
        return False
    try:
        return picture(old) == picture(body)
    except Exception:                                 # not a picture this Pillow can read: changed
        return False


def main():
    write = "--write" in sys.argv
    stale = [k for k, v in sources().items() if hashlib.sha1(v.encode()).hexdigest() != PORTED[k]]
    if stale and "--ported" not in sys.argv:
        print(f"  casino_art: would write -- casino.cpp's {', '.join(stale)} changed since it was ported: port the change into "
              "casino_art.py, then run it with --write --ported")
        if not write:
            return
        raise SystemExit(1)
    if "--ported" in sys.argv and write:              # the port is done: remember what it was ported from
        me = open(__file__).read()
        for k, v in sources().items():
            me = re.sub(rf'("{k}": )"[0-9a-f]*"', rf'\1"{hashlib.sha1(v.encode()).hexdigest()}"', me, count=1)
        open(__file__, "w").write(me)
    changed = []
    for path, body in build().items():
        old = open(path, "rb").read() if os.path.exists(path) else None
        if not same(path, old, body):
            changed.append(os.path.relpath(path, ROOT))
            if write:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                open(path, "wb").write(body)
    print("  casino_art: " + ("unchanged" if not changed else ("written: " if write else "would write: ") + f"{len(changed)} files"))


if __name__ == "__main__":
    main()
