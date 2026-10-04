#!/usr/bin/env python3
"""C-26: the companion device, over its USB cable instead of Wi-Fi.

    python3 usb_bridge.py                      # finds the device's port itself
    python3 usb_bridge.py /dev/cu.usbmodem101  # or name it
    python3 usb_bridge.py --server http://127.0.0.1:4730

It speaks the device's side of the sync protocol (C-09) on the device's behalf: every few seconds it asks the server
for GET /api/device/state and sends it down the cable as one line, "STATE {...}"; when the device says "TICK <id>"
(its encoder pressed), it posts POST /api/device/ticks and sends back the new state. The device shows USB in its
corner while a bridge is talking to it. Needs pyserial (PlatformIO's own Python has it:
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


def find_port():
    ports = sorted(glob.glob("/dev/cu.usbmodem*") + glob.glob("/dev/ttyACM*"))
    if not ports:
        sys.exit("usb_bridge: no device found -- is the T-Embed plugged in? Name its port if it is elsewhere.")
    return ports[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("port", nargs="?")
    ap.add_argument("--server", default="http://127.0.0.1:4730")
    ap.add_argument("--every", type=float, default=5.0, help="seconds between state updates")
    a = ap.parse_args()
    port = a.port or find_port()
    dev = serial.Serial(port, 115200, timeout=0.2)
    print("usb_bridge: %s <-> %s" % (port, a.server), flush=True)
    last, sent = 0.0, None
    buf = b""
    while True:
        now = time.time()
        if now - last > a.every:
            last = now
            try:
                state = server_json(a.server, "/api/device/state")
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
                    state = server_json(a.server, "/api/device/ticks", {"steps": [step]})["state"]
                    dev.write(("STATE " + json.dumps(state, separators=(",", ":")) + "\n").encode())
                    print("usb_bridge: step %d ticked off on the device" % step, flush=True)
                except Exception as e:
                    print("usb_bridge: could not tick step %d (%s)" % (step, e), flush=True)
            elif msg.startswith("UNREAD "):
                print("usb_bridge: the device could not read the state it was sent (%s bytes arrived)" % msg.split()[1],
                      flush=True)
            elif msg.startswith("INTERACT "):
                # C-13: a routine was run on the device -- tending the daemon. Passed on as the device would over Wi-Fi.
                parts = msg.split(" ", 2)
                try:
                    server_json(a.server, "/api/device/interact", {"kind": parts[1], "detail": parts[2] if len(parts) > 2 else ""})
                    print("usb_bridge: the device ran %s" % (parts[2] if len(parts) > 2 else parts[1]), flush=True)
                except Exception as e:
                    print("usb_bridge: could not pass on an interaction (%s)" % e, flush=True)
            elif msg and not msg.startswith("HELLO"):
                print("device: " + msg, flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
