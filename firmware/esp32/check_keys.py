#!/usr/bin/env python3
"""C-121: the three buttons checked from the computer -- on the M5GO, the Fire or the T-Display-S3 Pro, at home.

    python3 check_keys.py OUT.png [PORT] [--server http://localhost:4730]

Four screens side by side in OUT.png: the board at rest; A held (its word drawn pressed, the moment it went down);
A tapped -- DRINK, or FEED if it has drunk its three today -- with the word and the day's count drawn at once; and the
board a few seconds on. Then whether the companion heard it: nothing here sends a STATE line, so the board is not
bridged and the care goes out through its OUTBOX over Wi-Fi, and the companion's count for that device moves on.

The press is the firmware's own (KEY DOWN, KEY UP; KEY CANCEL forgets the held one, as a SHOT takes seconds and a
button held that long would go back when let go). The care is real: the daemon on that board has one more drink.
Opens the port without restarting the board (boardport.py). Stop linkCompanion.sh's bridge first: it holds the port.
"""
import json, re, sys, threading, time, urllib.request
import boardport  # beside this file
import shot
from PIL import Image, ImageDraw

args = [a for a in sys.argv[1:] if not a.startswith("--")]
server = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--server=")), "http://localhost:4730")
out = args[0] if args else "keys.png"
port = args[1] if len(args) > 1 else (boardport.ports() or [None])[0]
if not port:
    sys.exit("check_keys: no board on USB")
dev = boardport.open_port(port, timeout=1)


def hello(wait=8):
    """The board's HELLO (every 3 s): its kind and its device id."""
    deadline = time.time() + wait
    while time.time() < deadline:
        m = re.match(r"HELLO daemons-companion (\S+) \d+ (\S+)", dev.readline().decode(errors="replace").strip())
        if m:
            return m.group(1), m.group(2)
    return None, None


def life(device):
    """The companion's day for the daemon on that device: (fed, watered) today, or None if it does not answer."""
    try:
        req = urllib.request.Request(server + "/api/device/state", headers={"x-device": device})
        d = json.load(urllib.request.urlopen(req, timeout=4)).get("daemon") or {}
        lf = d.get("life") or {}
        return (lf.get("fed") or {}).get("today", 0), (lf.get("watered") or {}).get("today", 0)
    except Exception:
        return None


def send(line, then=0.0):
    dev.write((line + "\n").encode())
    time.sleep(then)


kind, device = hello()
if not device:
    sys.exit("check_keys: no HELLO from the board on %s" % port)
before = life(device)
print("check_keys: %s (%s) on %s; the companion says fed/watered %s" % (kind, device, port, before))
key, said = ("B", "FEED") if before and before[1] >= 3 and before[0] < 3 else ("A", "DRINK")

shots = []
shots.append(("at rest", shot.take(dev)))
send("KEY DOWN " + key, 0.3)
shots.append((said + " held", shot.take(dev)))
send("KEY CANCEL", 0.5)
send("KEY DOWN " + key, 0.15)
heard = []                                               # the companion, asked twice a second from the release on --
def listen(t0):                                          # beside the SHOTs, which hold the board's loop (not its outbox)
    for _ in range(60):
        now = life(device)
        if before and now and now != before:
            heard.append(time.time() - t0)
            return
        time.sleep(0.5)
ear = threading.Thread(target=listen, args=(time.time(),), daemon=True)
send("KEY UP " + key)
ear.start()
time.sleep(0.25)
shots.append((said + " let go", shot.take(dev)))
shots.append(("a moment on", shot.take(dev)))
ear.join()
heard = heard[0] if heard else None

verdict = ("the companion heard it %.1f s after the release (fed/watered %s -> %s)" % (heard, before, life(device))
           if heard is not None else
           "the companion's count did not move (%s): at 3/3 already, the board off Wi-Fi, or the outbox not sending" % (before,))
print("check_keys:", verdict)

good = [(t, im) for t, im in shots if im is not None]
if not good:
    sys.exit("check_keys: no screen came back")
w, h = good[0][1].size
k = 2
sheet = Image.new("RGB", (len(good) * (w * k + 12) + 12, h * k + 64), (24, 26, 34))
d = ImageDraw.Draw(sheet)
for i, (title, im) in enumerate(good):
    x = 12 + i * (w * k + 12)
    d.text((x, 10), title, fill=(255, 220, 80))
    sheet.paste(im.resize((w * k, h * k), Image.NEAREST), (x, 28))
d.text((12, h * k + 40), "%s: %s" % (kind, verdict), fill=(200, 200, 210))
sheet.save(out)
print("check_keys: %s" % out)
