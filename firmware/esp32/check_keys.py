#!/usr/bin/env python3
"""C-121: the three buttons checked from the computer -- on the M5GO, the Fire or the T-Display-S3 Pro, at home.

    python3 check_keys.py OUT.png [PORT] [--server=http://localhost:4730]

Five screens side by side in OUT.png: the board at rest; A held (its word drawn pressed, the moment it went down);
A tapped, which opens CARE (C-149: at home A CARE, B ROUTINES, C INDEX); there A tapped -- DRINK, or B, FEED, if it
has drunk its three today -- with the word and the day's count drawn at once, and home; and the board a few seconds on. Then whether the companion heard it: nothing here sends a STATE line, so the board is not
bridged and the care goes out through its OUTBOX over Wi-Fi, and the companion's count for that device moves on.

The press is the firmware's own (KEY DOWN, KEY UP; KEY CANCEL forgets the held one, as a SHOT takes seconds and a
button held that long would go back when let go). The care is real: the daemon on that board has one more drink.
Opens the port without restarting the board (boardport.py). Stop linkCompanion.sh's bridge first: it holds the port.
bench.py runs this as one of its checks.
"""
import json, re, sys, threading, time, urllib.request
import boardport  # beside this file
import shot
from PIL import Image, ImageDraw

THREE_KEYS = ("m5go", "m5-fire", "t-display-pro")        # the boards whose buttons tend it (C-117)


def hello(dev, wait=8):
    """The board's HELLO (every 3 s): its kind and its device id."""
    deadline = time.time() + wait
    while time.time() < deadline:
        m = re.match(r"HELLO daemons-companion (\S+) \d+ (\S+)", dev.readline().decode(errors="replace").strip())
        if m:
            return m.group(1), m.group(2)
    return None, None


def state(server, device, expression=""):
    """The companion's state for that device (in an expression of the check's choosing), or None."""
    try:
        req = urllib.request.Request(server + "/api/device/state" + ("?expression=" + expression if expression else ""),
                                     headers={"x-device": device})
        return json.load(urllib.request.urlopen(req, timeout=4))
    except Exception:
        return None


def life(server, device):
    """The day for the daemon on that device: (fed, watered) today, or None if the companion does not answer."""
    st = state(server, device)
    if st is None:
        return None
    lf = (st.get("daemon") or {}).get("life") or {}
    return (lf.get("fed") or {}).get("today", 0), (lf.get("watered") or {}).get("today", 0)


def send(dev, line, then=0.0):
    dev.write((line + "\n").encode())
    time.sleep(then)


def ask(dev, line, wait=3):
    """A question down the cable, and the first line of its answer (which starts with the question's word)."""
    send(dev, line)
    deadline = time.time() + wait
    while time.time() < deadline:
        got = dev.readline().decode(errors="replace").strip()
        if got.startswith(line.split()[0]):
            return got
    return line + ": no answer"


def check(dev, device, server):
    """The press, the release and the companion hearing it: [(title, image)], and what the companion said."""
    before = life(server, device)
    key, said = ("B", "FEED") if before and before[1] >= 3 and before[0] < 3 else ("A", "DRINK")
    send(dev, "KEY CANCEL", 0.4)                         # awake: left alone since its flash, its screen may be asleep
    shots = [("at rest", shot.take(dev))]
    send(dev, "KEY DOWN A", 0.3)
    shots.append(("CARE held", shot.take(dev)))
    send(dev, "KEY CANCEL", 0.5)
    send(dev, "KEY DOWN A", 0.15)                        # C-149: A opens CARE, whose own A, B and C do each care
    send(dev, "KEY UP A", 0.4)
    shots.append(("CARE open", shot.take(dev)))
    send(dev, "KEY DOWN " + key, 0.15)
    heard = []                                           # the companion, asked twice a second from the release on --

    def listen(t0):                                      # beside the SHOTs, which hold the board's loop (not its outbox)
        for _ in range(60):
            now = life(server, device)
            if before and now and now != before:
                heard.append(time.time() - t0)
                return
            time.sleep(0.5)
    ear = threading.Thread(target=listen, args=(time.time(),), daemon=True)
    send(dev, "KEY UP " + key)
    ear.start()
    time.sleep(0.25)
    shots.append((said + " let go", shot.take(dev)))
    shots.append(("a moment on", shot.take(dev)))
    ear.join()
    sent = ask(dev, "OUTBOX")                            # the board's own account: its answer, how long, which way, tries
    if heard:
        return shots, "the companion heard it %.1f s after the release (fed/watered %s -> %s); %s" % (heard[0], before, life(server, device), sent)
    return shots, "the companion's count did not move (%s): at 3/3 already, the board off Wi-Fi, or the outbox not sending; %s" % (before, sent)


def sheet(rows, out, k=2):
    """Rows of (title, [(caption, image)], note) into one PNG, each screen at k times its size."""
    rows = [(t, [(c, im) for c, im in shots if im is not None], note) for t, shots, note in rows]
    rows = [r for r in rows if r[1]]
    if not rows:
        return False
    w, h = rows[0][1][0][1].size
    cols = max(len(r[1]) for r in rows)
    rh = h * k + 64
    img = Image.new("RGB", (cols * (w * k + 12) + 12, len(rows) * rh + 8), (24, 26, 34))
    d = ImageDraw.Draw(img)
    for j, (title, shots, note) in enumerate(rows):
        y = j * rh + 8
        for i, (caption, im) in enumerate(shots):
            x = 12 + i * (w * k + 12)
            d.text((x, y), (title + " -- " if i == 0 else "") + caption, fill=(255, 220, 80))
            img.paste(im.resize((w * k, h * k), Image.NEAREST), (x, y + 16))
        d.text((12, y + 20 + h * k), note, fill=(200, 200, 210))
    img.save(out)
    return True


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    server = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--server=")), "http://localhost:4730")
    out = args[0] if args else "keys.png"
    port = args[1] if len(args) > 1 else (boardport.ports() or [None])[0]
    if not port:
        sys.exit("check_keys: no board on USB")
    dev = boardport.open_port(port, timeout=1)
    kind, device = hello(dev)
    if not device:
        sys.exit("check_keys: no HELLO from the board on %s" % port)
    print("check_keys: %s (%s) on %s" % (kind, device, port))
    shots, verdict = check(dev, device, server)
    print("check_keys:", verdict)
    if not sheet([("%s, the three buttons (C-121)" % kind, shots, verdict)], out):
        sys.exit("check_keys: no screen came back")
    print("check_keys: %s" % out)
