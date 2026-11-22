#!/usr/bin/env python3
"""C-406: the boards on this computer's USB, for THE ENGINE ROOM (run by THE HANDS, server/src/jobs.ts).

    hub/boards.py look                   every board on USB, by its USB serial (an ESP32-S3's is its MAC) -- no port opened
    hub/boards.py flash SERIAL[@ENV]     the newest firmware onto the board with that serial (./updateCompanion.sh)
    hub/boards.py link SERIAL [MINUTES]  link that board to the server over its cable for a few minutes (./linkCompanion.sh)
    hub/boards.py selftest

A board is always found by its serial, never by its port (the port moves with the socket). Before anything is written:
  * a serial in NEVER_FLASH (.hub beside syncCompanion.sh, never committed -- the ESP32-S3-BOX-3 runs ESPHome) is refused;
  * the board is asked what it is (its HELLO, five seconds); a build named here that is not the board's own is refused;
  * a board that says nothing is flashed only with a build named here, or the one it had when this computer last
    flashed it (kept in ~/Library/Application Support/daemons-hands/boards.json, serial -> its id and build).
`look` prints one line, BOARDS <json>, that THE ENGINE ROOM reads.
"""
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FW = os.path.join(HERE, "firmware", "esp32")
KEPT = os.path.expanduser("~/Library/Application Support/daemons-hands/boards.json")
ENVS = {"t-embed", "t-watch-s3", "t-watch-ultra", "t-glass", "t-deck", "t-display-pro", "t-display-amoled", "m5-sticks3",
        "m5-stickc-plus", "m5-cardputer", "m5-cores3", "m5-core", "m5-dial", "m5-tab5"}


def env_for(board_id):
    """A board's id (its HELLO, without the serial tail) -> its build, as updateCompanion.sh's env_for."""
    b = re.sub(r"-[0-9a-f]{6}$", "", board_id or "")
    for prefix, env in [("t-embed", "t-embed"), ("t-watch-s3", "t-watch-s3"), ("t-watch-ultra", "t-watch-ultra"),
                        ("t-glass", "t-glass"), ("t-deck", "t-deck"), ("t-display-amoled", "t-display-amoled"),
                        ("t-display", "t-display-pro"), ("m5-sticks3", "m5-sticks3"), ("m5-stickc-pl", "m5-stickc-plus"),
                        ("m5-cardputer", "m5-cardputer"), ("m5-cores3", "m5-cores3"), ("m5-dial", "m5-dial"),
                        ("m5-core", "m5-core"), ("m5-fire", "m5-core"), ("m5go", "m5-core"), ("m5-tab5", "m5-tab5")]:
        if b.startswith(prefix):                       # the list is ordered so a longer kind is tried first
            return env
    return None


def norm(serial):
    return re.sub(r"[^0-9A-Za-z]", "", serial or "").upper()


def never():
    """NEVER_FLASH from .hub: serials (MACs) that are never written to, whatever is asked."""
    out = set()
    try:
        for line in open(os.path.join(HERE, ".hub")):
            m = re.match(r"\s*NEVER_FLASH=([^#]*)", line)      # a comment after the value is not a serial
            if m:
                out |= {norm(x) for x in re.split(r"[\s,]+", m.group(1).strip().strip("\"'")) if x}
    except OSError:
        pass
    return out


def kept():
    try:
        return json.load(open(KEPT))
    except (OSError, ValueError):
        return {}


def keep(serial, board_id, env):
    k = kept()
    k[norm(serial)] = {"id": board_id, "env": env, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    os.makedirs(os.path.dirname(KEPT), exist_ok=True)
    tmp = KEPT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(k, f, indent=1)
    os.replace(tmp, KEPT)


def usb():
    """Every USB serial port with a serial number -- read from the system, no port opened (opening one resets the board)."""
    from serial.tools import list_ports
    return [{"port": p.device, "serial": p.serial_number, "vid": p.vid, "pid": p.pid, "product": p.product or p.description}
            for p in list_ports.comports() if p.vid and p.serial_number]


def hello(port, wait=5.0):
    """Ask a port what it is: the id in its HELLO, or None if it says nothing."""
    import serial
    sys.path.insert(0, FW)
    import boardport
    end, got = time.time() + wait, b""
    try:
        with boardport.open_port(port, timeout=0.3) as s:
            while time.time() < end:
                got += s.read(512)
                m = re.search(rb"HELLO daemons-companion (\S+)", got)
                if m:
                    return m.group(1).decode()
    except (serial.SerialException, OSError):
        pass
    return None


def decide(serial, asked_env, said_id, never_set, kept_map):
    """What to flash, or why not: (env, None) or (None, reason). Pure, so selftest can try every case."""
    if norm(serial) in never_set:
        return None, "refused: this board is in NEVER_FLASH (.hub) -- it is never written to"
    if asked_env and asked_env not in ENVS:
        return None, f"refused: there is no build called {asked_env}"
    own = env_for(said_id) if said_id else None
    if said_id and not own:
        return None, f"refused: it says it is {said_id}, which no build here is for"
    if own and asked_env and asked_env != own:
        return None, f"refused: it says it is {said_id} (build {own}), not {asked_env}"
    if own:
        return own, None
    remembered = (kept_map.get(norm(serial)) or {}).get("env")
    if asked_env and remembered and asked_env != remembered:
        return None, f"refused: it says nothing, and was last flashed here as {remembered}, not {asked_env}"
    if asked_env or remembered:
        return asked_env or remembered, None
    return None, "refused: it says nothing (no companion firmware yet?) -- name which board it is"


def find(serial):
    hits = [b for b in usb() if norm(b["serial"]) == norm(serial)]
    if len(hits) != 1:
        sys.exit(f"boards: {'no' if not hits else len(hits)} board on USB with serial {serial}")
    return hits[0]


def look():
    ns, k = never(), kept()
    boards = [{**b, "known": k.get(norm(b["serial"])), "never": norm(b["serial"]) in ns} for b in usb()]
    for b in boards:
        print(f"  {b['port']}  {b['serial']}  {(b['known'] or {}).get('id') or 'not flashed here yet'}{'  NEVER FLASHED' if b['never'] else ''}")
    print("BOARDS " + json.dumps(boards))


def flash(arg):
    serial, _, asked = arg.partition("@")
    b = find(serial)
    if norm(serial) in never():                      # before the port is even opened
        sys.exit("boards: refused: this board is in NEVER_FLASH (.hub) -- it is never written to")
    said = hello(b["port"])
    print(f"boards: {b['port']} ({b['serial']}) says {said or 'nothing'}")
    env, why = decide(serial, asked or None, said, never(), kept())
    if not env:
        sys.exit(f"boards: {why}")
    cmd = [os.path.join(HERE, "updateCompanion.sh"), "--port", b["port"]] + ([] if said else ["--board", env])
    print("boards: " + " ".join(cmd[1:]), flush=True)
    p = subprocess.Popen(cmd, cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    last_id = None
    for line in p.stdout:
        print(line, end="", flush=True)
        m = re.search(r" says (\S+)", line)
        if m and env_for(m.group(1)):
            last_id = m.group(1)
    if p.wait() != 0:
        sys.exit(f"boards: the flash did not finish (exit {p.returncode})")
    keep(serial, last_id or said or env, env)
    print(f"boards: done -- {b['serial']} kept as {last_id or said or env} ({env})")


def link(serial, minutes):
    b = find(serial)
    if norm(serial) in never():
        sys.exit("boards: refused: this board is in NEVER_FLASH (.hub)")
    print(f"boards: linking {b['port']} ({b['serial']}) for {minutes} minutes", flush=True)
    p = subprocess.Popen([os.path.join(HERE, "linkCompanion.sh"), "--port", b["port"]], cwd=HERE)
    try:
        p.wait(timeout=minutes * 60)
    except subprocess.TimeoutExpired:
        p.terminate()                                  # the bridge lets the board go without restarting it (C-179)
        try:
            p.wait(timeout=15)
        except subprocess.TimeoutExpired:
            p.kill()
        print("boards: the link's time is up; the board was let go")


def selftest():
    n, k = {"24EC4A52AF30"}, {"AABBCCDDEEFF": {"env": "m5-dial"}}
    cases = [
        (("24:EC:4A:52:AF:30", None, None), None, "NEVER_FLASH"),
        (("24:ec:4a:52:af:30", "t-embed", "t-embed-cc1101-36f484"), None, "NEVER_FLASH"),
        (("68:9D:D2:F3:51:D4", None, "t-watch-ultra-f351d4"), "t-watch-ultra", None),
        (("68:9D:D2:F3:51:D4", "t-embed", "t-watch-ultra-f351d4"), None, "not t-embed"),
        (("01:02:03:04:05:06", None, None), None, "name which board"),
        (("01:02:03:04:05:06", "m5-dial", None), "m5-dial", None),
        (("AA:BB:CC:DD:EE:FF", None, None), "m5-dial", None),
        (("AA:BB:CC:DD:EE:FF", "t-deck", None), None, "last flashed here as m5-dial"),
        (("01:02:03:04:05:06", "rm -rf", None), None, "no build called"),
        (("01:02:03:04:05:06", None, "m5go-606748"), "m5-core", None),
        (("01:02:03:04:05:06", None, "mystery-123456"), None, "no build here is for"),
    ]
    bad = 0
    for args, want_env, want_why in cases:
        env, why = decide(*args, n, k)
        ok = env == want_env and (want_why is None) == (why is None) and (want_why is None or want_why in why)
        bad += not ok
        print(("ok  " if ok else "BAD ") + f"{args} -> {env} {why or ''}")
    for bid, env in [("t-display-amoled-d373b4", "t-display-amoled"), ("t-display-pro-8770a8", "t-display-pro"),
                     ("m5-cardputer-adv-e80a9c", "m5-cardputer"), ("t-deck-plus-0a0b0c", "t-deck"),
                     ("m5-stickc-plus-80cfdc", "m5-stickc-plus"), ("t-embed-si4732-8a1508", "t-embed"), ("m5-tab5-fb02fe", "m5-tab5")]:
        ok = env_for(bid) == env
        bad += not ok
        print(("ok  " if ok else "BAD ") + f"{bid} -> {env_for(bid)}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["look"]:
        look()
    elif a[:1] == ["flash"] and len(a) == 2:
        flash(a[1])
    elif a[:1] == ["link"] and len(a) in (2, 3):
        link(a[1], max(1, min(30, int(a[2]) if len(a) == 3 and a[2].isdigit() else 3)))
    elif a[:1] == ["selftest"]:
        selftest()
    else:
        sys.exit(__doc__)
