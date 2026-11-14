#!/usr/bin/env python3
"""C-168 Phase 3: the boards on the hub's own USB, each linked by its own cable bridge.

    python3 hub/bridges.py                 # what the hub's unit runs (daemons-companion-bridges.service)
    python3 hub/bridges.py --once          # say what is plugged in and what would be linked, then stop

Every few seconds it lists the serial ports. A board whose USB serial number is on the allow-list gets ONE bridge
(firmware/esp32/usb_bridge.py, named by its port) -- the bridge already follows that same board by its serial when it
is unplugged and comes back on another port, so a board is never bridged twice. A board NOT on the list is left alone:
it is noted once in boards.seen (its serial and the port's description) and never opened, so a visitor's board, or
anything else with a USB serial port, is not restarted or spoken to.

The allow-list is boards.allow beside the server's store (/var/lib/daemons-companion): one serial per line, a '#' starts
a comment. Edited while running, it is read again on the next scan. Each bridge's output is passed on with the board's
serial in front, so the journal says which board said what (journalctl -u daemons-companion-bridges).

Stopped (SIGTERM, as systemd does), it stops every bridge with SIGTERM and waits for them: each lets its board go
cleanly (boardport.close_port), which a killed bridge does not -- the T-Watch Ultra came back up waiting for a download.
"""
import argparse, os, signal, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
FIRMWARE = os.path.join(os.path.dirname(HERE), "firmware", "esp32")
BRIDGE = os.path.join(FIRMWARE, "usb_bridge.py")
STATE = os.environ.get("DAEMONS_STATE", "/var/lib/daemons-companion")

try:
    import serial.tools.list_ports as list_ports
except ImportError:
    sys.exit("bridges: needs pyserial (apt: python3-serial)")
sys.path.insert(0, FIRMWARE)
import boardport  # noqa: E402  (which ports are boards' -- the same globs the Mac's bridge uses)


def allowed(path):
    """The allow-list's serials, upper case. A missing file allows nothing."""
    try:
        with open(path) as f:
            return {ln.split("#", 1)[0].strip().upper() for ln in f} - {""}
    except FileNotFoundError:
        return set()


def boards():
    """{serial: (port, description)} for every board-like port with a serial number."""
    ours = set(boardport.ports())
    out = {}
    for p in list_ports.comports():
        sn = (p.serial_number or "").strip().upper()
        if p.device in ours and sn:
            out.setdefault(sn, (p.device, p.description or ""))
    return out


def note_seen(path, sn, port, desc, known):
    """A board not on the list, noted once a run (and once in the file) so it can be added by hand or from the screen."""
    if sn in known:
        return
    known.add(sn)
    print("bridges: %s on %s (%s) is not on the allow-list -- left alone. To link it: echo %s >> %s"
          % (sn, port, desc, sn, os.path.join(STATE, "boards.allow")), flush=True)
    try:
        have = set()
        if os.path.exists(path):
            with open(path) as f:
                have = {ln.split()[0].upper() for ln in f if ln.strip()}
        if sn not in have:
            with open(path, "a") as f:
                f.write("%s %s %s\n" % (sn, time.strftime("%Y-%m-%dT%H:%M:%S"), desc))
    except OSError as e:
        print("bridges: could not note it in %s (%s)" % (path, e), flush=True)


def pass_on(sn, proc):
    for line in proc.stdout:
        print("[%s] %s" % (sn, line.rstrip()), flush=True)


def start(sn, port, server):
    proc = subprocess.Popen([sys.executable, "-u", BRIDGE, port, "--server", server],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    threading.Thread(target=pass_on, args=(sn, proc), daemon=True).start()
    print("bridges: %s on %s -- bridge started (pid %d)" % (sn, port, proc.pid), flush=True)
    return proc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", default="http://127.0.0.1:4730")
    ap.add_argument("--every", type=float, default=3.0, help="seconds between scans")
    ap.add_argument("--once", action="store_true", help="report what is plugged in and stop")
    a = ap.parse_args()
    allow_path, seen_path = os.path.join(STATE, "boards.allow"), os.path.join(STATE, "boards.seen")

    if a.once:
        allow = allowed(allow_path)
        found = boards()
        for sn, (port, desc) in sorted(found.items()):
            print("%-20s %-16s %-28s %s" % (sn, port, desc[:28], "linked" if sn in allow else "not on the list"))
        if not found:
            print("bridges: no board on the hub's USB")
        return

    running = {}          # serial -> Popen
    told = set()
    stopping = threading.Event()

    def stop(*_):
        stopping.set()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print("bridges: watching the hub's USB for the boards in %s" % allow_path, flush=True)
    while not stopping.is_set():
        allow = allowed(allow_path)
        for sn, proc in list(running.items()):
            if proc.poll() is not None:
                print("bridges: %s's bridge ended (%s)" % (sn, proc.returncode), flush=True)
                del running[sn]
            elif sn not in allow:                       # taken off the list: let the board go
                print("bridges: %s is off the allow-list -- stopping its bridge" % sn, flush=True)
                proc.terminate()
        for sn, (port, desc) in boards().items():
            if sn in running:
                continue                                # its bridge follows it, even to another port
            if sn in allow:
                running[sn] = start(sn, port, a.server)
            else:
                note_seen(seen_path, sn, port, desc, told)
        stopping.wait(a.every)

    for proc in running.values():
        if proc.poll() is None:
            proc.terminate()
    for sn, proc in running.items():
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
    print("bridges: stopped", flush=True)


if __name__ == "__main__":
    main()
