#!/usr/bin/env python3
"""C-168 Phase 4, C-170: the hub's own screen -- the companions linked, their daemons in a row, and pairing.

    python3 hub/screen.py              on the hub (needs the video and input groups; the server on 127.0.0.1:4730)
    python3 hub/screen.py --once FILE  draw the first page to a PNG instead, and stop (a check, anywhere)

Touch anywhere: a short touch turns the page (the daemons, the devices, the hub). Hold anywhere for two seconds and a
pairing code shows, with the hub's address, for the app to pair with -- held, so a passing hand does not pair a phone
(the critic's C-168 point). The panel's touch is not calibrated yet, so nothing here needs a precise tap.
Every word on it is DRAFT. Nothing personal is drawn but the daemons' names; it reads the server from its own machine.
"""
import calendar, json, os, select, sys, time, urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageMath

SERVER = os.environ.get("COMPANION_SERVER", "http://127.0.0.1:4730")
FB, TOUCH = "/dev/fb1", "/dev/input/event0"
W, H = 320, 240
HOLD_S, TAP_S, LINKED_S, REFRESH_S = 2.0, 0.6, 15 * 60, 20
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
INK, PAPER, DIM, OK, WARN = (240, 240, 232), (16, 18, 24), (120, 124, 136), (90, 200, 120), (230, 120, 80)


def font(px):
    try:
        return ImageFont.truetype(FONT, px)
    except OSError:
        return ImageFont.load_default()


F_BIG, F_MID, F_SMALL, F_TINY, F_CODE = font(40), font(16), font(12), font(10), font(46)


def get(path, method="GET"):
    req = urllib.request.Request(SERVER + path, method=method, data=b"" if method == "POST" else None)
    with urllib.request.urlopen(req, timeout=5) as r:
        body = r.read()
    return body if path.startswith("/art/") else json.loads(body)


sprites = {}


def sprite(art):
    if art not in sprites:
        try:
            im = Image.open(__import__("io").BytesIO(get(art))).convert("RGBA")
            sprites[art] = im.resize((64, 64), Image.NEAREST) if im.size != (64, 64) else im
        except Exception:
            sprites[art] = None
    return sprites[art]


def ago(iso):
    try:
        t = calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))   # the server's times are UTC
    except Exception:
        return None
    return time.time() - t


def colour(hexs, fallback=(70, 90, 140)):
    try:
        return tuple(int(hexs.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return fallback


def header(d, title, day):
    d.rectangle((0, 0, W, 26), fill=colour(day.get("colour", "")) if day else (70, 90, 140))
    d.text((8, 5), title, font=F_MID, fill=(16, 16, 16))
    if day:
        d.text((W - 8, 6), day.get("day", "").upper(), font=F_SMALL, fill=(16, 16, 16), anchor="ra")


def page_daemons(data):
    im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
    header(d, "DAEMONS", data["day"])
    devs = data["devices"]
    linked = [x for x in devs if (ago(x.get("lastSeen") or "") or 1e9) < LINKED_S]
    d.text((10, 30), str(len(linked)), font=F_BIG, fill=INK)
    x0 = 18 + int(d.textlength(str(len(linked)), font=F_BIG))
    d.text((x0, 38), "COMPANIONS LINKED", font=F_SMALL, fill=INK)
    d.text((x0, 54), f"of {len(devs)} known", font=F_TINY, fill=DIM)
    shown = sorted([x for x in devs if x.get("daemon")], key=lambda x: (x not in linked, x["id"]))[:8]
    for i, x in enumerate(shown):
        sx, sy = 16 + (i % 4) * 74, 74 + (i // 4) * 70
        sp = sprite(x["daemon"].get("art", ""))
        if sp is not None:
            if x not in linked:                                  # asleep: dimmed, still there
                sp = Image.blend(Image.new("RGBA", sp.size, (0, 0, 0, 0)), sp, 0.35)
            im.paste(sp, (sx, sy), sp)
        d.text((sx + 32, sy + 62), (x["daemon"].get("name") or "")[:10], font=F_TINY,
               fill=INK if x in linked else DIM, anchor="ma")
    footer(d, "HOLD TO PAIR A PHONE")
    return im


def page_devices(data):
    im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
    header(d, "DEVICES", data["day"])
    devs = sorted(data["devices"], key=lambda x: (ago(x.get("lastSeen") or "") or 1e9))
    for i, x in enumerate(devs[:10]):
        y = 32 + i * 17
        a = ago(x.get("lastSeen") or "")
        on = a is not None and a < LINKED_S
        d.ellipse((8, y + 3, 16, y + 11), fill=OK if on else (60, 62, 70))
        d.text((22, y), x.get("kind") or x["id"], font=F_SMALL, fill=INK if on else DIM)
        when = "now" if a is not None and a < 120 else (f"{int(a // 60)}m" if a and a < 3600 else
               f"{int(a // 3600)}h" if a and a < 172800 else f"{int(a // 86400)}d" if a else "")
        d.text((W - 8, y), f"{x.get('via') or ''}  {when}", font=F_SMALL, fill=DIM, anchor="ra")
    if len(devs) > 10:
        d.text((W - 8, H - 36), f"+{len(devs) - 10} more", font=F_TINY, fill=DIM, anchor="ra")
    footer(d, "HOLD TO PAIR A PHONE")
    return im


def page_hub(data):
    im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
    header(d, "THE HUB", data["day"])
    rows = [("address", f"{data['address'] or '?'}:4730"), ("server", "answering" if data["ok"] else "NOT ANSWERING")]
    try:
        up = float(open("/proc/uptime").read().split()[0])
        rows.append(("up", f"{int(up // 86400)}d {int(up % 86400 // 3600)}h {int(up % 3600 // 60)}m"))
        rows.append(("heat", f"{int(open('/sys/class/thermal/thermal_zone0/temp').read()) // 1000} C"))
        mem = dict(l.split(":", 1) for l in open("/proc/meminfo"))
        rows.append(("memory free", f"{int(mem['MemAvailable'].split()[0]) // 1024} MB"))
    except Exception:
        pass
    if data["day"]:
        rows.append(("today", data["day"].get("cue", "")))
    for i, (k, v) in enumerate(rows):
        d.text((12, 36 + i * 26), k.upper(), font=F_TINY, fill=DIM)
        d.text((110, 33 + i * 26), v, font=F_MID, fill=OK if v == "answering" else WARN if v == "NOT ANSWERING" else INK)
    footer(d, "HOLD TO PAIR A PHONE")
    return im


def page_holding(frac):
    im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
    d.text((W // 2, 80), "KEEP HOLDING", font=F_MID, fill=INK, anchor="ma")
    d.text((W // 2, 104), "to show a pairing code", font=F_SMALL, fill=DIM, anchor="ma")
    d.rectangle((40, 140, W - 40, 156), outline=INK)
    d.rectangle((42, 142, 42 + int((W - 84) * min(1, frac)), 154), fill=OK)
    return im


def page_code(code, address, until):
    im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
    header(d, "PAIR A PHONE", None)
    d.text((W // 2, 40), "ON THE APP, ENTER", font=F_SMALL, fill=DIM, anchor="ma")
    d.text((W // 2, 60), f"{address}:4730", font=F_MID, fill=INK, anchor="ma")
    d.text((W // 2, 92), code, font=F_CODE, fill=INK, anchor="ma")
    left = max(0, int(until - time.time()))
    d.text((W // 2, 168), f"good for {left // 60}:{left % 60:02d}", font=F_SMALL, fill=DIM, anchor="ma")
    footer(d, "TOUCH TO CLOSE")
    return im


def page_down():
    im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
    header(d, "DAEMONS", None)
    d.text((W // 2, 96), "THE COMPANION IS NOT ANSWERING", font=F_SMALL, fill=WARN, anchor="ma")
    d.text((W // 2, 118), "it restarts by itself; this screen keeps trying", font=F_TINY, fill=DIM, anchor="ma")
    return im


def footer(d, words):
    d.rectangle((0, H - 22, W, H), fill=(32, 36, 46))
    d.text((W // 2, H - 17), words, font=F_SMALL, fill=INK, anchor="ma")


def rgb565(im):
    """RGB to the panel's 16-bit RGB565, little-endian, with Pillow alone (no numpy on the hub)."""
    r, g, b = im.convert("RGB").split()
    hi = ImageMath.eval("convert((r & 248) | (g >> 5), 'L')", r=r, g=g)
    lo = ImageMath.eval("convert(((g << 3) & 224) | (b >> 3), 'L')", g=g, b=b)
    return Image.merge("LA", (lo, hi)).tobytes()


def show(im, out=None):
    if out:
        im.save(out); return
    with open(FB, "r+b") as fb:
        fb.write(rgb565(im))


def fetch():
    data = {"ok": False, "devices": [], "day": None, "address": None}
    try:
        devs = get("/api/devices")
        data["devices"] = devs["devices"] if isinstance(devs, dict) else devs
        data["devices"] = list(data["devices"].values()) if isinstance(data["devices"], dict) else data["devices"]
        data["day"] = get("/api/today").get("day")
        data["address"] = get("/api/settings/network").get("address")
        data["ok"] = True
    except Exception:
        pass
    return data


PAGES = [page_daemons, page_devices, page_hub]


def digest(data, page):
    """What a page shows, coarsely: drawing costs the one core about a second, so it is done only when this moves."""
    devs = [(x["id"], x.get("via"), (x.get("daemon") or {}).get("art"),
             int((ago(x.get("lastSeen") or "") or 1e9) // (60 if page == 1 else LINKED_S))) for x in data["devices"]]
    extra = int(time.time() // 60) if page == 2 else 0          # the hub page's uptime and heat, once a minute
    return json.dumps([data["ok"], data["day"], data["address"], sorted(devs, key=str), extra])


def main():
    if "--once" in sys.argv:
        show(PAGES[0](fetch()), sys.argv[sys.argv.index("--once") + 1]); return
    import evdev
    touch = evdev.InputDevice(TOUCH)
    page, data, fetched, down_at, code, last = 0, fetch(), time.time(), None, None, None
    while True:
        now = time.time()
        if now - fetched > REFRESH_S:
            data, fetched = fetch(), now
        frame_key = None
        if code and now > code[2]:
            code = None
        if down_at is not None and now - down_at >= HOLD_S and not code:
            try:
                r = get("/api/pair/code", "POST")
                code = (r["code"], r["lan"]["address"], now + r.get("minutes", 10) * 60)
            except Exception:
                code = None
            down_at = None
        if down_at is not None and now - down_at > TAP_S:
            im, frame_key = page_holding((now - down_at) / HOLD_S), ("hold", int((now - down_at) * 10))
        elif code:
            im, frame_key = page_code(*code), ("code", code[0], int(code[2] - now))
        elif not data["ok"]:
            im, frame_key = page_down(), ("down",)
        else:
            im = None
            frame_key = ("page", page, digest(data, page))   # redrawn only when what it shows has changed
        if frame_key != last:
            show(im if im is not None else PAGES[page](data))
            last = frame_key
        r, _, _ = select.select([touch.fd], [], [], 0.1)
        if r:
            for ev in touch.read():
                if ev.type == evdev.ecodes.EV_KEY and ev.code == evdev.ecodes.BTN_TOUCH:
                    if ev.value == 1:
                        down_at = time.time()
                    elif down_at is not None:
                        held = time.time() - down_at
                        down_at = None
                        if code:
                            code = None                         # a touch closes the code
                        elif held < TAP_S:
                            page = (page + 1) % len(PAGES)
                        last = None


if __name__ == "__main__":
    main()
