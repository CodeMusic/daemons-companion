#!/usr/bin/env python3
"""C-453 (docs/ZEROKIT.md): kitd, the LLM630 Compute Kit's own agent -- what StackFlow does not say about the board.

It answers the Zero over the cable only (10.77.0.2, and 127.0.0.1), on StackFlow's port plus one, 10002:

    GET  /state          {"cell": 0-100 or -1, "charging", "usb", "temp", "memFreeMb", "hotspot": "on"|"off", "ssid", "key",
                          "auto": the hotspot's charge rule on or off}
    POST /hotspot        {"on": true|false}   on or off now (the charge rule then waits for its next crossing)
    POST /auto           {"on": true|false}   the charge rule: on at 70% and above, off below 65% (C-460)
    POST /clock          {"epoch": seconds}   the Zero's clock, when the Kit has no internet to set its own

Python 3's standard library only. Installed by setup.sh as the systemd unit daemons-kitd. Every word DRAFT.
"""
import glob, json, os, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 10002
CONF = "/etc/daemons-kit"
ON_AT, OFF_BELOW = 70, 65
HOTSPOT_CON = "daemons-kit-hotspot"
lock = threading.Lock()


def read(path, default=""):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return default


def setting(name, default=""):
    return read(os.path.join(CONF, name), default)


def keep(name, value):
    os.makedirs(CONF, exist_ok=True)
    tmp = os.path.join(CONF, name + ".tmp")
    with open(tmp, "w") as f:
        f.write(value + "\n")
    os.replace(tmp, os.path.join(CONF, name))


def cell():
    """The Kit's own cell from its BQ27220 (power_supply), or -1 when none is fitted or it cannot be read."""
    for d in glob.glob("/sys/class/power_supply/*"):
        if read(os.path.join(d, "type")) != "Battery":
            continue
        if read(os.path.join(d, "present"), "1") == "0":
            return -1, False
        cap = read(os.path.join(d, "capacity"))
        status = read(os.path.join(d, "status")).lower()
        if cap.isdigit():
            return int(cap), status in ("charging", "full")
    return -1, False


def usb_power():
    for d in glob.glob("/sys/class/power_supply/*"):
        if read(os.path.join(d, "type")) in ("USB", "Mains") and read(os.path.join(d, "online")) == "1":
            return True
    return False


def temp():
    best = -1.0
    for z in glob.glob("/sys/class/thermal/thermal_zone*/temp"):
        t = read(z)
        if t.lstrip("-").isdigit():
            best = max(best, int(t) / 1000.0)
    return best


def mem_free_mb():
    for line in read("/proc/meminfo").splitlines():
        if line.startswith("MemAvailable:"):
            return int(line.split()[1]) // 1024
    return -1


def nmcli(*args):
    return subprocess.run(["nmcli", *args], capture_output=True, text=True, timeout=30)


def hotspot_on():
    r = nmcli("-t", "-f", "NAME", "connection", "show", "--active")
    return HOTSPOT_CON in r.stdout.split()


def hotspot(on):
    """The Kit's Wi-Fi as an access point (WPA2), its name and key kept in /etc/daemons-kit. No internet is shared."""
    with lock:
        if on == hotspot_on():
            return True
        if not on:
            return nmcli("connection", "down", HOTSPOT_CON).returncode == 0
        ssid, key = setting("hotspot.ssid", "DAEMONS-KIT"), setting("hotspot.key")
        if len(key) < 8:
            return False
        if nmcli("connection", "show", HOTSPOT_CON).returncode != 0:
            ifname = setting("hotspot.ifname", "wlan0")
            r = nmcli("connection", "add", "type", "wifi", "ifname", ifname, "con-name", HOTSPOT_CON, "autoconnect", "no",
                      "ssid", ssid, "802-11-wireless.mode", "ap", "802-11-wireless.band", "bg",
                      "ipv4.method", "shared", "ipv4.addresses", "10.78.0.1/24",
                      "wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", key)
            if r.returncode != 0:
                return False
        return nmcli("connection", "up", HOTSPOT_CON).returncode == 0


def state():
    pct, charging = cell()
    on = hotspot_on()
    d = {"cell": pct, "charging": charging, "usb": usb_power(), "temp": temp(), "memFreeMb": mem_free_mb(),
         "hotspot": "on" if on else "off", "auto": setting("hotspot.auto", "on") == "on"}
    if on:
        d["ssid"], d["key"] = setting("hotspot.ssid", "DAEMONS-KIT"), setting("hotspot.key")
    return d


def charge_rule():
    """C-460: on at 70% and above, off below 65% -- only on a cell of its own; on USB power alone it is left as set."""
    last = None
    while True:
        try:
            pct, charging = cell()
            if setting("hotspot.auto", "on") == "on" and pct >= 0:
                want = True if pct >= ON_AT or charging else False if pct < OFF_BELOW else last
                if want is not None and want != last:
                    hotspot(want)
                    last = want
        except Exception:
            pass
        time.sleep(60)


class Agent(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def answer(self, code, d):
        b = json.dumps(d).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/state":
            return self.answer(200, state())
        self.answer(404, {"error": "no such thing"})

    def do_POST(self):
        n = int(self.headers.get("content-length", 0) or 0)
        try:
            body = json.loads(self.rfile.read(min(n, 4096)) or b"{}")
        except ValueError:
            return self.answer(400, {"error": "not JSON"})
        if self.path == "/hotspot":
            ok = hotspot(bool(body.get("on")))
            return self.answer(200 if ok else 500, {"ok": ok, **state()})
        if self.path == "/auto":
            keep("hotspot.auto", "on" if body.get("on") else "off")
            return self.answer(200, state())
        if self.path == "/clock" and isinstance(body.get("epoch"), (int, float)):
            if abs(time.time() - body["epoch"]) > 60:   # only when it has drifted: NTP wins when there is internet
                subprocess.run(["date", "-s", "@%d" % int(body["epoch"])], capture_output=True)
            return self.answer(200, {"ok": True})
        self.answer(404, {"error": "no such thing"})


if __name__ == "__main__":
    threading.Thread(target=charge_rule, daemon=True).start()
    addrs = [a for a in os.environ.get("KITD_LISTEN", "10.77.0.2,127.0.0.1").split(",") if a]
    servers = []
    for a in addrs:
        for _ in range(30):   # the cable's address may come up after this does
            try:
                servers.append(ThreadingHTTPServer((a, PORT), Agent))
                break
            except OSError:
                time.sleep(2)
    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    if servers:
        servers[0].serve_forever()
