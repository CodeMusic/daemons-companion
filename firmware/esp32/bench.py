#!/usr/bin/env python3
"""Every board on the cable checked in one go -- what can be seen without a finger -- one sheet per board.

    ./updateCompanion.sh                      # flash them first (from the repo root)
    python3 bench.py OUTDIR [--server=http://localhost:4730]

For each board it finds (boardport.py; opened without restarting it):
  - its screen at rest, as it is on its own Wi-Fi;
  - on the M5GO, the Fire and the T-Display-S3 Pro, the three buttons (C-121, check_keys.py): held, let go, and the
    care heard by the companion through the board's outbox;
  - its daemon in five expressions (C-119): awake, drowsy, asleep, glad, sad -- the companion's state for that board,
    asked for in each (GET /api/device/state?expression=) and handed down the cable as the bridge hands it, then its
    own state again.
OUTDIR/bench-<board>.png for each, and a line per board on what it found. The buttons come first: once a STATE line
has come down the cable the board counts itself bridged for fifteen seconds, and its care would go that way instead.
Stop linkCompanion.sh's bridge first: it holds the ports.
"""
import json, os, sys, time
import boardport  # beside this file
import check_keys
import shot

EXPRESSIONS = ("awake", "drowsy", "asleep", "glad", "sad")


def bench(port, server, outdir):
    dev = boardport.open_port(port, timeout=1)
    kind, device = check_keys.hello(dev)
    if not device:
        return "%s: no HELLO (is it running, and the bridge stopped?)" % port
    rows, notes = [], []
    if kind in check_keys.THREE_KEYS:
        shots, verdict = check_keys.check(dev, device, server)
        rows.append(("%s, the three buttons (C-121)" % kind, shots, verdict))
        notes.append(verdict)
    else:
        rows.append(("%s at rest" % kind, [("its own Wi-Fi", shot.take(dev))], ""))
    own = check_keys.state(server, device)
    if own is None or not own.get("daemon"):
        notes.append("no daemon hosted here (or the companion did not answer): no expressions")
    else:
        looks = []
        for name in EXPRESSIONS:
            st = check_keys.state(server, device, name)
            if st is None:
                continue
            check_keys.send(dev, "STATE " + json.dumps(st, separators=(",", ":")), 0.6)
            looks.append((name, shot.take(dev)))
        check_keys.send(dev, "STATE " + json.dumps(check_keys.state(server, device) or own, separators=(",", ":")), 0.3)
        rows.append(("%s in each expression (C-119)" % own["daemon"].get("nickname", "its daemon"), looks,
                     "handed down the cable as the bridge would; its own state given back after"))
    out = os.path.join(outdir, "bench-%s.png" % kind)
    made = check_keys.sheet(rows, out)
    dev.close()
    return "%s (%s): %s%s" % (kind, device, out if made else "no screen came back", "".join("; " + n for n in notes))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    server = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--server=")), "http://localhost:4730")
    outdir = args[0] if args else "."
    os.makedirs(outdir, exist_ok=True)
    ports = boardport.ports()
    if not ports:
        sys.exit("bench: no board on USB")
    for p in ports:
        print("bench:", bench(p, server, outdir))
