#!/usr/bin/env python3
"""The Tab5's screen as a PNG, over its USB cable, with a page to go to and presses to make first, so a screen can be
checked without a camera.

    python3 shot.py OUT.png [--port PORT] [--go LIBRARY] [--tap X Y]... [--scroll DY]...

Steps run in order (--go, then each --tap and --scroll as given), each given a moment to draw. The Tab5 answers SHOT
with "SHOT w h 16", one "R<y> <base64>" line a row (RGB565, high byte first) and "SHOT END"; a row a log line split is
missing, and the whole screen is asked for again (up to three times), keeping every row that did arrive. The port is
opened with DTR and RTS held off: opened the usual way, the Tab5 is held in reset (or left waiting for a download).
Nothing else may hold the port. Needs pyserial and Pillow.
"""
import argparse, base64, glob, sys, time
import serial
from PIL import Image


def open_tab5(port):
    s = serial.Serial()
    s.port, s.baudrate, s.timeout = port, 115200, 2
    s.dtr = False
    s.rts = False
    s.open()
    return s


def take(dev, rows, timeout=90):
    """One SHOT: every whole row that arrives goes into `rows` (y -> bytes). Returns (w, h)."""
    dev.reset_input_buffer()
    dev.write(b"SHOT\n")
    w = h = 0
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = dev.readline().decode(errors="replace").strip()
        if line.startswith("SHOT END"):
            break
        if line.startswith("SHOT "):
            w, h = (int(x) for x in line.split()[1:3])
        elif w and line.startswith("R") and " " in line:
            y, data = line[1:].split(" ", 1)
            try:
                b = base64.b64decode(data, validate=True)
                if y.isdigit() and len(b) == w * 2:
                    rows[int(y)] = b
            except ValueError:
                pass
    return w, h


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--port")
    ap.add_argument("--go")
    ap.add_argument("--tap", nargs=2, type=int, action="append", default=[])
    ap.add_argument("--scroll", type=int, action="append", default=[])
    a = ap.parse_args()
    port = a.port or (sorted(glob.glob("/dev/cu.usbmodem*")) or [None])[0]
    if not port:
        sys.exit("shot: no Tab5 on USB")
    dev = open_tab5(port)
    time.sleep(0.3)
    steps = ([("GO " + a.go)] if a.go else []) + ["TAP %d %d" % tuple(t) for t in a.tap] + ["SCROLL %d" % d for d in a.scroll]
    for s in steps:
        dev.write((s + "\n").encode())
        time.sleep(2.0)
    rows, w, h = {}, 0, 0
    for _ in range(3):
        w, h = take(dev, rows)
        if w and len(rows) == h:
            break
    if not w or len(rows) < h:
        sys.exit("shot: %d of %d rows arrived" % (len(rows), h))
    img = Image.new("RGB", (w, h))
    px = []
    for y in range(h):
        b = rows[y]
        for i in range(0, len(b), 2):
            v = (b[i] << 8) | b[i + 1]
            px.append((((v >> 11) & 31) * 255 // 31, ((v >> 5) & 63) * 255 // 63, (v & 31) * 255 // 31))
    img.putdata(px)
    img.save(a.out)
    print("shot: %s (%dx%d)" % (a.out, w, h))


if __name__ == "__main__":
    main()
