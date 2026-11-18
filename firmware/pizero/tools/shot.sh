#!/usr/bin/env bash
# C-377: a picture of what the Cardputer Zero's screen shows right now, for review sheets and qa -- /dev/fb0 (320x170,
# 16 bpp RGB565, stride 640, as the probe found it) read over SSH and written here as a PNG, three times the size.
# Nothing is written on the device. The user must be in the `video` group there (the image's first user is).
#   tools/shot.sh <user>@<device> out.png [scale]
set -euo pipefail
host=${1:?usage: tools/shot.sh <user>@<device> out.png [scale]}
out=${2:?usage: tools/shot.sh <user>@<device> out.png [scale]}
scale=${3:-3}
ssh "$host" 'cat /sys/class/graphics/fb0/virtual_size /sys/class/graphics/fb0/stride; head -c $(( $(cut -d, -f2 /sys/class/graphics/fb0/virtual_size) * $(cat /sys/class/graphics/fb0/stride) )) /dev/fb0' |
python3 -c '
import struct, sys, zlib
raw = sys.stdin.buffer.read()
nl1 = raw.index(b"\n"); w, h = map(int, raw[:nl1].split(b","))
nl2 = raw.index(b"\n", nl1 + 1); stride = int(raw[nl1 + 1:nl2])
px = raw[nl2 + 1:]
s, out = int(sys.argv[2]), sys.argv[1]
h = min(h, len(px) // stride)
rows = bytearray()
for y in range(h):
    line = bytearray()
    for x in range(w):
        v = px[y * stride + 2 * x] | px[y * stride + 2 * x + 1] << 8   # RGB565, little end first
        r, g, b = (v >> 11) * 255 // 31, (v >> 5 & 63) * 255 // 63, (v & 31) * 255 // 31
        line += bytes((r, g, b)) * s
    rows += (b"\0" + bytes(line)) * s
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w * s, h * s, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")
open(out, "wb").write(png)
print(f"{out}: {w}x{h} at x{s}")
' "$out" "$scale"
