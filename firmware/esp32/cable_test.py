"""The cable's start and its states (C-178, C-179, 2026-10-31).

    ~/.platformio/penv/bin/python cable_test.py

Runs usb_bridge.py against a pretend board (a pseudo-terminal) and a stub server whose state can be changed. Checks that
nothing goes down the cable before the board's HELLO; that a state goes again only when it has changed (the clock aside),
or as a keepalive; that a board saying HELLO ... 4 is sent its daemon's INDEX entry only when the artKey changes, and the
whole state again when it says ENTRY? or UNREAD; and that a board saying 3 (older firmware) always gets its entry.
Exit 0 when every check holds.
"""
import os, pty, subprocess, sys, time, json, threading, http.server, select

STATE = {"day": {"name": "Saturday"}, "step": None, "clock": {"epoch": 0},
         "daemon": {"species": 1, "artKey": "1-a", "entry": "A long INDEX entry.", "name": "PIP"}}


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        STATE["clock"]["epoch"] = int(time.time() * 1000)          # changes every time, as the real one does
        body = json.dumps(STATE).encode() if "state" in self.path else b'{"commands":[]}'
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        self.rfile.read(int(self.headers.get("content-length") or 0))
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(b"{}")


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
fails = []


def check(what, ok):
    print(("ok   " if ok else "FAIL ") + what)
    if not ok: fails.append(what)


def run(version):
    master, slave = pty.openpty()
    p = subprocess.Popen([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "usb_bridge.py"),
                          os.ttyname(slave), "--server", "http://127.0.0.1:%d" % srv.server_address[1], "--every", "0.5"],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    buf = b""

    def states(seconds):
        nonlocal buf
        out, end = [], time.time() + seconds
        while time.time() < end:
            r, _, _ = select.select([master], [], [], 0.1)
            if r: buf += os.read(master, 65536)
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                if line.startswith(b"STATE "): out.append(json.loads(line[6:]))
        return out

    def say(line): os.write(master, (line + "\n").encode())
    try:
        check("v%d: no state before HELLO" % version, states(2.0) == [])
        say("HELLO daemons-companion fake %d fake-board-1" % version)
        first = states(1.5)
        check("v%d: a state at once after HELLO" % version, len(first) == 1 and first[0]["daemon"].get("entry"))
        check("v%d: nothing again while unchanged (the clock aside)" % version, states(3.0) == [])
        STATE["step"] = {"id": 7}
        changed = states(1.5)
        check("v%d: a changed state goes" % version, len(changed) == 1)
        if version >= 4:
            check("v4: its entry left out, the artKey unchanged", changed and "entry" not in changed[0]["daemon"])
            say("ENTRY?")
            again = states(1.5)
            check("v4: ENTRY? brings the whole state", len(again) == 1 and again[0]["daemon"].get("entry"))
            STATE["daemon"] = dict(STATE["daemon"], artKey="1-b", entry="Another entry.")
            new = states(1.5)
            check("v4: a new artKey brings its entry", len(new) == 1 and new[0]["daemon"].get("entry") == "Another entry.")
            say("UNREAD 4605 ART")                  # a picture unread: the state need not go again
            check("v4: an unread ART sends no state", states(1.5) == [])
            say("UNREAD 4090 STATE")
            STATE["step"] = {"id": 8}
            after = states(1.5)
            check("v4: after an unread STATE the whole state", len(after) == 1 and after[0]["daemon"].get("entry"))
        else:
            check("v3: its entry always sent (older firmware keeps none)", changed and changed[0]["daemon"].get("entry"))
        keep = states(11.0)
        check("v%d: a keepalive within 15 s" % version, len(keep) >= 1)
    finally:
        p.terminate(); log = p.communicate(timeout=5)[0]
        STATE.update(step=None, daemon={"species": 1, "artKey": "1-a", "entry": "A long INDEX entry.", "name": "PIP"})
    if version >= 4:
        check("v4: an unread STATE is logged with what was sent", "4090 bytes arrived of " in log and " sent" in log)


run(4)
run(3)
print("cable_test:", "ok" if not fails else "FAILED -- " + "; ".join(fails))
sys.exit(1 if fails else 0)
