#!/usr/bin/env python3
"""The handheld's screen as a PNG, over its USB cable: the device answers SHOT with its screen buffer.

    python3 shot.py OUT.png [PORT]

A bridge holds the port, so stop it first (or let linkCompanion.sh's bridge be the one to ask: not yet). Needs pyserial
and Pillow. The buffer is TFT_eSPI's sprite: RGB565, high byte first.
"""
import base64, glob, sys, time
import serial
import boardport  # noqa: E402  (beside this file)
from PIL import Image

out = sys.argv[1] if len(sys.argv) > 1 else "shot.png"
port = sys.argv[2] if len(sys.argv) > 2 else (boardport.ports() or [None])[0]
if not port:
    sys.exit("shot: no board on USB")
dev = boardport.open_port(port, timeout=2)
time.sleep(0.3)
dev.reset_input_buffer()
dev.write(b"SHOT\n")
w = h = 0
data = bytearray()
deadline = time.time() + 15
while time.time() < deadline:
    line = dev.readline().decode(errors="replace").strip()
    if line.startswith("SHOT END"):
        break
    if line.startswith("SHOT "):
        w, h = map(int, line.split()[1:3])
        data = bytearray()
    elif w and line and not line.startswith(("HELLO", "ART?", "INTERACT", "TICK", "UNREAD", "PONG")):
        data += base64.b64decode(line)
if not w or len(data) != w * h * 2:
    sys.exit("shot: got %d of %d bytes" % (len(data), w * h * 2))
img = Image.new("RGB", (w, h))
px = []
for i in range(0, len(data), 2):
    v = (data[i] << 8) | data[i + 1]
    px.append((((v >> 11) & 31) * 255 // 31, ((v >> 5) & 63) * 255 // 63, (v & 31) * 255 // 31))
img.putdata(px)
img.resize((w * 3, h * 3), Image.NEAREST).save(out)
print("shot: %s (%dx%d)" % (out, w, h))
