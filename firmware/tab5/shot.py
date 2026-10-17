#!/usr/bin/env python3
"""The Tab5's screen as a PNG, over its USB cable -- as firmware/esp32/shot.py takes the handhelds', with a page to go to
and presses to make first, so a screen can be checked without a camera.

    python3 shot.py OUT.png [--port PORT] [--go LIBRARY] [--tap X Y]... [--scroll DY]...

Steps run in order (--go, then each --tap and --scroll as given), each given a moment to draw. The port is opened with
DTR and RTS held off: opened the usual way, the Tab5 is held in reset (or left waiting for a download). Nothing else may
hold the port. Needs pyserial and Pillow.
"""
import argparse, glob, os, sys, time
import serial
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "esp32"))
from shot import take  # noqa: E402  (the handhelds' decoder: the same SHOT lines)


def open_tab5(port):
    s = serial.Serial()
    s.port, s.baudrate, s.timeout = port, 115200, 2
    s.dtr = False
    s.rts = False
    s.open()
    return s


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
        time.sleep(1.5)
    img = take(dev, timeout=90)
    if img is None:
        sys.exit(1)
    img.save(a.out)
    print("shot: %s (%dx%d)" % (a.out, *img.size))


if __name__ == "__main__":
    main()
