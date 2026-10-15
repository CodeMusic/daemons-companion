#!/usr/bin/env python3
"""Every board on the cable checked in one go -- what can be seen without a finger -- one sheet per board.

    ./updateCompanion.sh                      # flash them first (from the repo root)
    python3 bench.py OUTDIR [PORT] [--server=http://localhost:4730]     every board on the cable, or only the one on PORT

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
import json, os, re, sys, time
import boardport  # beside this file
import check_keys
import shot

EXPRESSIONS = ("awake", "drowsy", "asleep", "glad", "sad")
PARTY_FIRST = ("m5go", "m5-fire", "t-display-pro", "m5-sticks3", "m5-cores3", "m5-dial")   # no radios of their own


def ready(dev, wait=90):
    """Asked with MEM until the board has its daemon's picture (art have == want) -- a board just flashed is still
    joining its Wi-Fi, and a press then finds no daemon. The answer's heap and largest block go in the board's line:
    C-121 added two tasks (a tune's, the outbox's) and the M5GO has no PSRAM, so a board short of memory shows here
    before it shows as a relay that cannot connect."""
    deadline, mem = time.time() + wait, "MEM: no answer"
    while time.time() < deadline:
        check_keys.send(dev, "MEM")
        until = time.time() + 2
        while time.time() < until:
            line = dev.readline().decode(errors="replace").strip()
            if line.startswith("MEM heap"):
                mem = " ".join(line.split()[:5])
                m = re.search(r"art have (\S*) want (\S*)", line)
                if m and m.group(2) and m.group(1) == m.group(2):
                    return mem, True
                break
        time.sleep(2)
    return mem, False


def bench(port, server, outdir):
    dev = boardport.open_port(port, timeout=1)
    kind, device = check_keys.hello(dev)
    if not device:
        return "%s: no HELLO (is it running, and the bridge stopped?)" % port
    mem, has = ready(dev)
    rows, notes = [], [mem if has else mem + " -- no daemon's picture after 90 s (hosting none, or not reaching the companion)"]
    if kind in check_keys.THREE_KEYS:
        shots, verdict = check_keys.check(dev, device, server)
        rows.append(("%s, the three buttons (C-121)" % kind, shots, verdict))
        notes.append(verdict)
    else:
        check_keys.send(dev, "KEY CANCEL", 0.4)          # awake: left alone since its flash, its screen may be asleep
        rows.append(("%s at rest" % kind, [("its own Wi-Fi", shot.take(dev))], ""))
    if kind in PARTY_FIRST:                              # ROUTINES opened: its RADIOS first (WHISPER, UPLINK), the party after
        check_keys.send(dev, "KEY CANCEL", 0.2)
        check_keys.send(dev, "GO ROUTINES", 0.4)
        check_keys.send(dev, "KEY PRESS", 0.4)
        radios = shot.take(dev)
        check_keys.send(dev, "KEY PRESS", 0.4)
        rows.append(("%s ROUTINES" % kind, [("opened: RADIOS first", radios), ("RADIOS pressed", shot.take(dev))],
                     "GO ROUTINES, then KEY PRESS twice -- as a finger: A+C, C to ROUTINES, B, B"))
        check_keys.send(dev, "GO DAEMON", 0.4)
    own = check_keys.state(server, device)
    if own is None or not own.get("daemon"):
        notes.append("no daemon hosted here (or the companion did not answer): no expressions")
    else:
        looks = []
        for name in EXPRESSIONS:
            st = check_keys.state(server, device, name)
            if st is None:
                continue
            check_keys.send(dev, "KEY CANCEL", 0.2)              # awake: a SHOT takes seconds, and left alone it sleeps
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
    ports = args[1:] or boardport.ports()
    if not ports:
        sys.exit("bench: no board on USB")
    for p in ports:
        print("bench:", bench(p, server, outdir))
