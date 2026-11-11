#!/usr/bin/env python3
"""C-330: THE ENGINE ROOM's icons -- a pixel gear in the hub's gold around a lit core, on the companion's night blue.

Drawn on a 32-pixel grid and scaled up square, so it reads as the game's own art. Writes server/admin/icon-192.png,
icon-512.png, icon-maskable-512.png (the gear inside the safe circle) and apple-touch-icon.png (180).

    ~/.pyenv/shims/python3 server/tools/admin_icons.py
"""
import math
import os
from PIL import Image

BG, GOLD, DARK, CORE, GLOW = (15, 20, 32), (217, 167, 74), (138, 98, 38), (255, 214, 120), (224, 138, 60)
OUT = os.path.join(os.path.dirname(__file__), "..", "admin")


def gear(n=32, teeth=8, outer=13.5, root=10.5, hole=5.0):
    """The gear on an n-pixel grid: teeth, a rim shaded on its lower right, and a glowing core in its hole."""
    img = Image.new("RGB", (n, n), BG)
    c = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            dx, dy = x - c, y - c
            r, a = math.hypot(dx, dy), math.atan2(dy, dx)
            tooth = (math.cos(a * teeth) > 0.15)               # flat-topped teeth
            edge = outer if tooth else root
            if r <= hole - 1.6:
                img.putpixel((x, y), CORE)
            elif r <= hole:
                img.putpixel((x, y), GLOW)
            elif r <= edge:
                shade = (dx + dy) / (2 * edge) > 0.28 or r > edge - 1   # the lower right and the outline in shadow
                img.putpixel((x, y), DARK if shade else GOLD)
    return img


def write(size, name, pad=0.0):
    g = gear()
    inner = round(size * (1 - 2 * pad))
    canvas = Image.new("RGB", (size, size), BG)
    canvas.paste(g.resize((inner, inner), Image.NEAREST), ((size - inner) // 2, (size - inner) // 2))
    canvas.save(os.path.join(OUT, name))
    print("wrote", name)


if __name__ == "__main__":
    write(192, "icon-192.png", 0.06)
    write(512, "icon-512.png", 0.06)
    write(512, "icon-maskable-512.png", 0.16)    # inside the 80% circle a launcher may crop to
    write(180, "apple-touch-icon.png", 0.08)
