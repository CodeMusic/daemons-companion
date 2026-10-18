#!/usr/bin/env python3
"""The devices as they look -- each a little sprite made of rectangles and circles on a 32x32 grid, in the device's own
colours: its body, its screen, its buttons, its dial or keys. And who makes it, so the DEVICES lists can group them
under LilyGO and M5Stack.

Drawn from the makers' own product photos (lilygo.cc, docs.m5stack.com), 2026-10-16. One list here feeds every place
that shows a device:

    server/data/devices.json            the app and the site (app/deviceSprites.tsx draws it)
    firmware/common/device_sprites.h    the Tab5 (firmware/tab5/src/ui.cpp draws it with LVGL)

    python3 firmware/common/device_sprites.py            report what would change
    python3 firmware/common/device_sprites.py --write    write both files
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
JSON_OUT = os.path.join(ROOT, "server", "data", "devices.json")
H_OUT = os.path.join(HERE, "device_sprites.h")

# The makers, in the order the lists show them.
MAKERS = ["LilyGO", "M5Stack", "Espressif", "This phone"]

# Colours shared between devices
SCREEN = "#46a8e0"       # a lit screen
GLASS = "#22313f"        # the glass round a screen
KEY = "#8b8f97"          # a plain grey button


def r(x, y, w, h, c, rad=0):
    """A rectangle; rad rounds its corners (half its short side makes a circle or a capsule)."""
    return [x, y, w, h, rad, c]


def circle(cx, cy, d, c):
    return r(cx - d / 2, cy - d / 2, d, d, c, d / 2)


def keyboard(x0, y0, cols, rows, step, size, c):
    return [r(x0 + i * step, y0 + j * step, size, size, c, 0.5) for j in range(rows) for i in range(cols)]


DEVICES = {
    # ---- LilyGO ------------------------------------------------------------------------------------------------------
    # the CC1101: a tall capsule, the screen above, the dial below with its ring of lights, an antenna at the top
    "t-embed-cc1101": ("LilyGO", "T-Embed CC1101", [
        r(15, 0, 2, 3, "#9aa0a8"),
        r(9, 2, 14, 29, "#1f2125", 7),
        r(11, 5, 10, 11, GLASS, 1), r(12, 6, 8, 9, SCREEN, 0.5),
        circle(16, 23.5, 10, "#ff6aa8"), circle(16, 23.5, 8.4, "#2b2e33"), circle(16, 23.5, 5, "#17181b"),
        r(23, 8, 1, 4, KEY),
    ]),
    # the plain T-Embed: a capsule on its side, a long strip of screen, the dial and its ring of lights at one end
    "t-embed": ("LilyGO", "T-Embed", [
        r(1, 10, 30, 12, "#2a2c31", 6),
        r(4, 13, 16, 6, GLASS, 1), r(5, 14, 14, 4, SCREEN, 0.5),
        circle(25, 16, 9, "#ff6aa8"), circle(25, 16, 7.4, "#2b2e33"), circle(25, 16, 4.6, "#17181b"),
    ]),
    # the SI4732: the same, with its radio's aerial
    "t-embed-si4732": ("LilyGO", "T-Embed SI4732", [
        r(3, 3, 1, 8, "#b8bdc4"), circle(3.5, 3, 2, "#b8bdc4"),
        r(1, 10, 30, 12, "#2a2c31", 6),
        r(4, 13, 16, 6, GLASS, 1), r(5, 14, 14, 4, SCREEN, 0.5),
        circle(25, 16, 9, "#ff6aa8"), circle(25, 16, 7.4, "#2b2e33"), circle(25, 16, 4.6, "#17181b"),
    ]),
    # the watch: a square case on a strap, a square screen, its crown
    "t-watch-s3": ("LilyGO", "T-Watch S3", [
        r(10, 0, 12, 7, "#121315", 1), r(10, 25, 12, 7, "#121315", 1),
        r(6, 5, 20, 22, "#1c1d21", 4),
        r(8, 7, 16, 18, GLASS, 2), r(9, 8, 14, 16, SCREEN, 1),
        r(26, 13, 2, 6, "#5a5d63", 1),
    ]),
    # the T-Deck (and Plus): a BlackBerry -- the screen above, the trackball, three rows of keys
    "t-deck": ("LilyGO", "T-Deck", [
        r(4, 1, 24, 30, "#3c3f45", 4),
        r(6, 3, 20, 13, GLASS, 1), r(7, 4, 18, 11, SCREEN, 0.5),
        circle(16, 18.5, 3, "#e8e8e8"),
        *keyboard(6.5, 21.5, 7, 3, 2.8, 2, "#1d1e22"),
    ]),
    # the T-Display-S3 Pro: a bare black board, a wide screen, two buttons at each end and a green light
    "t-display-pro": ("LilyGO", "T-Display-S3 Pro", [
        r(0, 8, 32, 16, "#1a1c1f", 1),
        r(3.5, 9.5, 25, 13, GLASS, 0.5), r(4.5, 10.5, 23, 11, SCREEN),
        r(1, 10, 2, 2, KEY, 0.5), r(1, 19, 2, 2, KEY, 0.5),
        r(29, 10, 2, 2, KEY, 0.5), r(29, 19, 2, 2, KEY, 0.5),
        circle(30, 15.5, 1, "#4cd964"),
    ]),
    # the T-Display-S3 AMOLED 1.91 (C-135): a slim black board, a long AMOLED (deeper black, brighter colour), two buttons
    "t-display-amoled": ("LilyGO", "T-Display-S3 AMOLED", [
        r(0, 9, 32, 14, "#141518", 1.5),
        r(2.5, 10.5, 25, 11, "#05070a", 0.5), r(3.2, 11.2, 23.6, 9.6, "#5b8cff"),
        r(29, 11, 2, 2.5, KEY, 0.5), r(29, 18.5, 2, 2.5, KEY, 0.5),
    ]),
    # ---- M5Stack -----------------------------------------------------------------------------------------------------
    # the Cardputer (C-136): a light grey card, the screen at the top left, the Stamp's orange corner, four rows of keys
    "m5-cardputer": ("M5Stack", "Cardputer", [
        r(1, 5, 30, 22, "#d9dbd8", 2),
        r(3, 7, 13, 8, GLASS, 0.5), r(3.6, 7.6, 11.8, 6.8, SCREEN),
        r(18, 7, 11, 5, "#f08a24", 1),
        *keyboard(3, 16.5, 9, 3, 2.9, 2.2, "#2b2d32"),
    ]),
    # the Cardputer ADV (C-136): the same card in dark grey, with its LoRa cap and aerial
    "m5-cardputer-adv": ("M5Stack", "Cardputer ADV", [
        r(27, 0, 1.5, 6, "#b8bdc4"),
        r(1, 5, 30, 22, "#34363b", 2),
        r(3, 7, 13, 8, GLASS, 0.5), r(3.6, 7.6, 11.8, 6.8, SCREEN),
        r(18, 7, 11, 5, "#f08a24", 1),
        *keyboard(3, 16.5, 9, 3, 2.9, 2.2, "#1a1b1e"),
    ]),
    # the StickS3: a dark stick, an upright screen, the face button under it, the blue button on its side
    "m5-sticks3": ("M5Stack", "StickS3", [
        r(10, 2, 12, 28, "#2e3035", 3),
        r(11.5, 4, 9, 14, GLASS, 1), r(12.5, 5, 7, 12, SCREEN, 0.5),
        r(13, 21, 6, 5, "#1a1b1e", 1.5),
        r(22, 9, 1.5, 6, "#2f7fe0", 0.5),
    ]),
    # the StickC-Plus (C-148): the StickS3's shape in orange, the big M5 button under the screen, B on one side and the
    # power button on the other
    "m5-stickc-plus": ("M5Stack", "StickC-Plus", [
        r(10, 2, 12, 28, "#f26b21", 3),
        r(11.5, 4, 9, 14, GLASS, 1), r(12.5, 5, 7, 12, SCREEN, 0.5),
        r(12.5, 20.5, 7, 6, "#d4561a", 1.5),
        r(22, 9, 1.5, 6, "#d4561a", 0.5),
        r(8.5, 7, 1.5, 4, "#d4561a", 0.5),
    ]),
    # the CoreS3: a dark square, the screen in its face, the camera above it
    "m5-cores3": ("M5Stack", "CoreS3", [
        r(3, 3, 26, 26, "#2b2d32", 3),
        r(6, 8, 20, 16, GLASS, 1), r(7, 9, 18, 14, SCREEN, 0.5),
        circle(16, 5.5, 2, "#0c0c0e"),
    ]),
    # the Fire: the grey core on its red base, three buttons under the screen
    "m5-fire": ("M5Stack", "Fire", [
        r(2, 2, 28, 28, "#d63a2f", 4),
        r(4, 4, 24, 24, "#3a3c42", 3),
        r(6, 6, 20, 15, GLASS, 1), r(7, 7, 18, 13, SCREEN, 0.5),
        r(7.5, 23, 4, 2, KEY, 1), r(14, 23, 4, 2, KEY, 1), r(20.5, 23, 4, 2, KEY, 1),
    ]),
    # the M5GO: the same core on its white base, the light bars down its sides
    "m5go": ("M5Stack", "M5GO", [
        r(2, 2, 28, 28, "#e4e4e2", 4),
        r(2.6, 8, 1.2, 16, "#ff9a3c", 0.6), r(28.2, 8, 1.2, 16, "#ff9a3c", 0.6),
        r(4, 4, 24, 24, "#3a3c42", 3),
        r(6, 6, 20, 15, GLASS, 1), r(7, 7, 18, 13, SCREEN, 0.5),
        r(7.5, 23, 4, 2, KEY, 1), r(14, 23, 4, 2, KEY, 1), r(20.5, 23, 4, 2, KEY, 1),
    ]),
    # the Dial: a round white body, the orange ring that turns, a round screen in it
    "m5-dial": ("M5Stack", "Dial", [
        circle(16, 16, 30, "#e6e6e4"),
        circle(16, 16, 25, "#f08a24"),
        circle(16, 16, 19, GLASS), circle(16, 16, 17, SCREEN),
    ]),
    # the Tab5: a dark tablet, its screen nearly all of it
    "m5-tab5": ("M5Stack", "Tab5", [
        r(0, 5, 32, 22, "#2a2c31", 3),
        r(2, 7, 28, 18, GLASS, 1), r(2.6, 7.6, 26.8, 16.8, SCREEN, 0.5),
        circle(16, 6, 1, "#0c0c0e"),
    ]),
    # ---- Espressif ---------------------------------------------------------------------------------------------------
    # C-138: the ESP32-S3-BOX-3 -- a white face, the screen nearly all of it, its red circle below, on its cyan dock
    "esp32-s3-box-3": ("Espressif", "ESP32-S3-BOX-3", [
        r(1, 20, 30, 11, "#2ec4d8", 2),
        r(3, 2, 26, 24, "#efefed", 4),
        r(5.5, 4.5, 21, 15.5, GLASS, 1), r(6.5, 5.5, 19, 13.5, SCREEN, 0.5),
        circle(16, 22.8, 2.2, "#e8463a"), circle(16, 22.8, 1.2, "#efefed"),
        circle(9, 3.3, 0.7, "#55585e"), circle(23, 3.3, 0.7, "#55585e"),
    ]),
    # ---- this phone ---------------------------------------------------------------------------------------------------
    # the phone's widget: a phone, and the widget on its home screen
    "iphone-widget": ("This phone", "This phone's widget", [
        r(9, 1, 14, 30, "#1b1c20", 4),
        r(10, 2.5, 12, 27, SCREEN, 3),
        r(12, 6, 8, 8, "#ffffff", 2), r(13.5, 7.5, 5, 5, "#46a8e0", 1),
        r(14, 3.5, 4, 1, "#1b1c20", 0.5),
    ]),
}

# the names a board gives itself that are another's look
ALIASES = {"t-deck-plus": "t-deck"}


def round_shape(s):
    return [round(v, 2) if isinstance(v, float) else v for v in s]


def as_json():
    out = {"makers": MAKERS, "aliases": ALIASES, "devices": {}}
    for kind, (maker, name, shapes) in DEVICES.items():
        out["devices"][kind] = {"maker": maker, "name": name, "shapes": [round_shape(s) for s in shapes]}
    return json.dumps(out, indent=1) + "\n"


def as_header():
    lines = [
        "#pragma once",
        "// The devices as they look -- written by firmware/common/device_sprites.py from its own list (do not edit by hand).",
        "// Each shape is a rectangle on a 32x32 grid, in tenths: x, y, w, h, corner radius, and its colour (0xRRGGBB).",
        "#include <stdint.h>",
        "struct DeviceShape { int16_t x, y, w, h, r; uint32_t c; };",
        "struct DeviceLook { const char *kind, *maker, *name; const DeviceShape *shapes; uint8_t n; };",
        "static const char *const DEVICE_MAKERS[] = { " + ", ".join(json.dumps(m) for m in MAKERS) + " };",
        "static const int DEVICE_MAKER_N = %d;" % len(MAKERS),
    ]
    looks = []
    for i, (kind, (maker, name, shapes)) in enumerate(DEVICES.items()):
        body = ", ".join("{%d, %d, %d, %d, %d, 0x%s}" % (round(s[0] * 10), round(s[1] * 10), round(s[2] * 10),
                                                          round(s[3] * 10), round(s[4] * 10), s[5][1:].upper())
                         for s in shapes)
        lines.append("static const DeviceShape DEVICE_SHAPES_%d[] = { %s };" % (i, body))
        looks.append('  { %s, %s, %s, DEVICE_SHAPES_%d, %d },' % (json.dumps(kind), json.dumps(maker), json.dumps(name), i, len(shapes)))
    lines.append("static const DeviceLook DEVICE_LOOKS[] = {")
    lines += looks
    lines.append("};")
    lines.append("static const int DEVICE_LOOK_N = %d;" % len(DEVICES))
    lines.append("static const char *const DEVICE_ALIASES[][2] = { " +
                 ", ".join("{ %s, %s }" % (json.dumps(a), json.dumps(b)) for a, b in ALIASES.items()) + " };")
    lines.append("static const int DEVICE_ALIAS_N = %d;" % len(ALIASES))
    return "\n".join(lines) + "\n"


def main():
    write = "--write" in sys.argv
    changed = 0
    for path, text in ((JSON_OUT, as_json()), (H_OUT, as_header())):
        old = open(path).read() if os.path.exists(path) else None
        if old == text:
            continue
        changed += 1
        print(("wrote " if write else "would write ") + os.path.relpath(path, ROOT))
        if write:
            with open(path, "w") as f:
                f.write(text)
    if not changed:
        print("device_sprites: nothing to change")


if __name__ == "__main__":
    main()
