#!/usr/bin/env python3
"""C-26: the companion device, over its USB cable instead of Wi-Fi.

    python3 usb_bridge.py                      # finds the device's port itself
    python3 usb_bridge.py /dev/cu.usbmodem101  # or name it
    python3 usb_bridge.py --server http://127.0.0.1:4730

It speaks the device's side of the sync protocol (C-09) on the device's behalf: every few seconds it asks the server
for GET /api/device/state and sends it down the cable as one line, "STATE {...}"; when the device says "TICK <id>"
(its encoder pressed), it posts POST /api/device/ticks and sends back the new state. The device shows USB in its
corner while a bridge is talking to it.

C-32, the site and the device linked: every second it takes what the site sent the device (GET /api/device/commands)
and passes each down as "CMD {...}"; the device's "RESULT {...}" goes back to POST /api/device/results, and its
"ROUTINES {...}" (asked with LIST when the bridge starts, and every minute) to POST /api/device/routines. Needs pyserial (PlatformIO's own Python has it:
~/.platformio/penv/bin/python usb_bridge.py). Ctrl-C stops it.
"""
import argparse, glob, json, sys, time, urllib.request

try:
    import serial
except ImportError:
    sys.exit("usb_bridge: needs pyserial -- run it with ~/.platformio/penv/bin/python, or pip install pyserial")


def server_json(base, path, body=None):
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"content-type": "application/json"}, method="GET" if body is None else "POST")
    with urllib.request.urlopen(req, timeout=4) as r:
        return json.loads(r.read())


def find_port(wait=False):
    while True:
        ports = sorted(glob.glob("/dev/cu.usbmodem*") + glob.glob("/dev/ttyACM*"))
        if ports:
            return ports[0]
        if not wait:
            sys.exit("usb_bridge: no device found -- is the T-Embed plugged in? Name its port if it is elsewhere.")
        time.sleep(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("port", nargs="?")
    ap.add_argument("--server", default="http://127.0.0.1:4730")
    ap.add_argument("--every", type=float, default=5.0, help="seconds between state updates")
    a = ap.parse_args()
    # The board can be unplugged at any time: say so, wait for it, and carry on when it is back.
    while True:
        port = a.port or find_port(wait=True)
        try:
            bridge(a, port)
        except serial.SerialException:
            print("usb_bridge: the board was unplugged -- waiting for it to come back (Ctrl-C to stop)", flush=True)
            time.sleep(2)


def bridge(a, port):
    dev = serial.Serial(port, 115200, timeout=0.2)
    print("usb_bridge: %s <-> %s" % (port, a.server), flush=True)
    last, sent, listed, polled = 0.0, None, 0.0, 0.0
    buf = b""
    while True:
        now = time.time()
        if now - listed > 60:                       # C-32: what routines the device has, for the site
            listed = now
            dev.write(b"LIST\n")
        if now - polled > 1.0:                      # C-32: what the site sent the device
            polled = now
            try:
                for cmd in server_json(a.server, "/api/device/commands?via=usb")["commands"]:
                    dev.write(("CMD " + json.dumps(cmd, separators=(",", ":")) + "\n").encode())
                    print("usb_bridge: the site -> device: %s %s" % (cmd["type"], cmd.get("routine") or cmd.get("label") or ""), flush=True)
            except Exception:
                pass                                # the state below says when the server is away
        if now - last > a.every:
            last = now
            try:
                state = server_json(a.server, "/api/device/state?via=usb")
                line = json.dumps(state, separators=(",", ":"))
                dev.write(("STATE " + line + "\n").encode())
                if line != sent:
                    print("usb_bridge: state -> device: %s, step %s" % (state["day"]["name"],
                          state["step"]["id"] if state.get("step") else "none"), flush=True)
                    sent = line
            except Exception as e:
                print("usb_bridge: the server did not answer (%s)" % e, flush=True)
        buf += dev.read(256)
        while b"\n" in buf:
            raw, buf = buf.split(b"\n", 1)
            msg = raw.decode(errors="replace").strip()
            if msg.startswith("TICK "):
                step = int(msg.split()[1])
                try:
                    r = server_json(a.server, "/api/device/ticks", {"steps": [step]})
                    if r.get("celebrate"):              # C-50: a step, a milestone or the whole goal -- the board plays it
                        dev.write(("CELEBRATE %s\n" % r["celebrate"]).encode())
                    dev.write(("STATE " + json.dumps(r["state"], separators=(",", ":")) + "\n").encode())
                    print("usb_bridge: step %d done on the device%s" % (step, " -- " + r["celebrate"] if r.get("celebrate") else ""), flush=True)
                except Exception as e:
                    print("usb_bridge: could not tick step %d (%s)" % (step, e), flush=True)
            elif msg.startswith("UNTICK "):             # C-49: undone on the device
                step = int(msg.split()[1])
                try:
                    r = server_json(a.server, "/api/device/untick", {"step": step})
                    dev.write(("STATE " + json.dumps(r["state"], separators=(",", ":")) + "\n").encode())
                    print("usb_bridge: step %d undone on the device" % step, flush=True)
                except Exception as e:
                    print("usb_bridge: could not undo step %d (%s)" % (step, e), flush=True)
            elif msg == "ART?":
                # C-36: the device asks for its daemon's art when the state names art it does not have
                try:
                    art = server_json(a.server, "/api/device/art")
                    dev.write(("ART " + json.dumps(art, separators=(",", ":")) + "\n").encode())
                    print("usb_bridge: art -> device (%d bytes)" % len(art["pixels"]), flush=True)
                except Exception as e:
                    print("usb_bridge: no art for the device (%s)" % e, flush=True)
            elif msg.startswith("UNREAD "):
                print("usb_bridge: the device could not read the state it was sent (%s bytes arrived)" % msg.split()[1],
                      flush=True)
            elif msg.startswith("INTERACT "):
                # C-13: a routine was run on the device -- tending the daemon. Passed on as the device would over Wi-Fi.
                parts = msg.split(" ", 2)
                try:
                    server_json(a.server, "/api/device/interact", {"kind": parts[1], "detail": parts[2] if len(parts) > 2 else ""})
                    print("usb_bridge: the device %s" % ("ran " + parts[2] if parts[1] == "routine" else "-- " + parts[1]), flush=True)
                    # C-13: its life changed -- send the new state now, not in five seconds
                    state = server_json(a.server, "/api/device/state?via=usb")
                    dev.write(("STATE " + json.dumps(state, separators=(",", ":")) + "\n").encode())
                except Exception as e:
                    print("usb_bridge: could not pass on an interaction (%s)" % e, flush=True)
            elif msg.startswith("RESULT "):
                try:
                    r = json.loads(msg[7:])
                    server_json(a.server, "/api/device/results", r)
                    print("usb_bridge: device -> the site: %s" % r.get("text", "").split("\n")[0], flush=True)
                except Exception as e:
                    print("usb_bridge: could not pass on a result (%s)" % e, flush=True)
            elif msg.startswith("REMOTES ") or msg.startswith("NETWORKS "):   # C-51, C-52: what the board has learned
                kind, _, rest = msg.partition(" ")
                try:
                    server_json(a.server, "/api/device/" + kind.lower(), json.loads(rest))
                except Exception as e:
                    print("usb_bridge: could not pass on the %s (%s)" % (kind.lower(), e), flush=True)
            elif msg.startswith("LISTEN "):                 # C-15: one listen of the meeting radio, for the check
                try:
                    n = [int(x) for x in msg.split()[1:]]
                    server_json(a.server, "/api/device/listen", {"started": n[0], "devices": n[1], "beacons": n[2],
                                                                 "mode": n[3] if len(n) > 3 else 0})
                except Exception as e:
                    print("usb_bridge: could not pass on a listen (%s)" % e, flush=True)
            elif msg.startswith("MET ") or msg.startswith("BEACON "):   # C-15: a companion heard nearby; this board's tag
                word, _, rest = msg.partition(" ")
                try:
                    if word == "MET":
                        species, tag = rest.split()
                        r = server_json(a.server, "/api/device/met", {"species": species, "peer": tag})
                        print("usb_bridge: met a companion nearby (species %s): %s" % (species,
                              "counted" if r.get("counted") else r.get("why", "not counted")), flush=True)
                    else:
                        server_json(a.server, "/api/device/beacon", {"peer": rest.strip()})
                except Exception as e:
                    print("usb_bridge: could not pass on %s (%s)" % (word, e), flush=True)
            elif msg.startswith("ROUTINES "):
                try:
                    server_json(a.server, "/api/device/routines", json.loads(msg[9:]))
                except Exception as e:
                    print("usb_bridge: could not pass on the routines (%s)" % e, flush=True)
            elif msg and not msg.startswith("HELLO"):
                print("device: " + msg, flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
