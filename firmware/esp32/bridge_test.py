"""The cable bridge files a board's own reports under its name, even those said before its first HELLO (2026-10-11).

    ~/.platformio/penv/bin/python bridge_test.py

Runs usb_bridge.py against a pretend board (a pseudo-terminal) and a stub server that records the x-device of every
report. The battery and the routines (which carry the firmware build) are said as the link opens, before the board's
first HELLO; sent then, the server could only keep them as nobody's, and the site showed a linked board's firmware and
battery from days before. Exit 0 when every report arrived named.
"""
import os, pty, subprocess, sys, time, json, threading, http.server
got = []
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.send_header("content-type","application/json"); self.end_headers()
        self.wfile.write(b'{"commands":[]}' if "commands" in self.path else b"{}")
    def do_POST(self):
        n = int(self.headers.get("content-length") or 0); body = self.rfile.read(n)
        got.append((self.path, self.headers.get("x-device"), body[:60]))
        self.send_response(200); self.send_header("content-type","application/json"); self.end_headers(); self.wfile.write(b"{}")
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
master, slave = pty.openpty(); name = os.ttyname(slave)
p = subprocess.Popen([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "usb_bridge.py"), name,
                      "--server", "http://127.0.0.1:%d" % srv.server_address[1]], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(2)
os.write(master, b"BATTERY 42 3900 1 0 1\n")
os.write(master, b'ROUTINES {"firmware":"fake 3 abc","types":[]}\n')
time.sleep(1.5)
before = list(got)
os.write(master, b"HELLO daemons-companion fake 3 fake-board-1\n")
time.sleep(1.5)
os.write(master, b"BATTERY 40 3880 1 0 1\n")
time.sleep(1.5)
p.terminate(); out = p.communicate(timeout=5)[0]
dev = [g for g in got if "battery" in g[0] or "routines" in g[0]]
print("reports before HELLO:", [g for g in before if "battery" in g[0] or "routines" in g[0]])
for g in dev: print(g)
print("--- bridge said:"); print("\n".join(l for l in out.splitlines() if "usb_bridge" in l))

named = [g for g in dev if g[1] == "fake-board-1"]
ok = len(dev) == 3 and len(named) == 3
print("bridge_test:", "ok -- every report filed under the board" if ok else "FAILED -- a report went unnamed")
sys.exit(0 if ok else 1)
