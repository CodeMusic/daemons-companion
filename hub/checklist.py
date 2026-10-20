#!/usr/bin/env python3
"""C-168: after the cut-over, which devices have found the hub -- asked of the hub itself, so it is never stale.

    python3 hub/checklist.py

Reads .hub (HUB=, and CUTOVER=, the moment the hub became the server, ISO UTC). A device is ticked once the hub has
heard from it since then. The rest need one of: a cable link here (./linkCompanion.sh, through the tunnel), the relay
(a board with a key, on its next call), or -- phones and the Tab5 -- opening the app and pairing again if it asks.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = {}
for line in open(os.path.join(HERE, ".hub")):
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.strip().split("=", 1); cfg[k] = v
hub, cut = cfg.get("HUB"), cfg.get("CUTOVER", "")
if not hub or not cut:
    sys.exit("checklist: .hub needs HUB= and CUTOVER= (ISO UTC)")

def ask(path):
    out = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", hub,
                          f"curl -s -m 8 http://127.0.0.1:4730{path}"], capture_output=True, text=True)
    if out.returncode or not out.stdout.strip():
        sys.exit(f"checklist: the hub did not answer {path}")
    return json.loads(out.stdout)

devices = ask("/api/devices"); devices = devices.get("devices", devices)
devices = list(devices.values()) if isinstance(devices, dict) else devices
phones = ask("/api/pair/phones")

rows = []
for d in devices:
    seen = d.get("lastSeen") or ""
    rows.append((seen >= cut, d["id"], d.get("via") or "", seen[:16].replace("T", " ")))
for p in phones:
    seen = p.get("seen") or ""
    rows.append((seen >= cut, "phone: " + p.get("name", "?"), "paired", seen[:16].replace("T", " ")))
rows.sort(key=lambda r: (not r[0], r[1]))
done = sum(r[0] for r in rows)
print(f"On the hub since the cut-over ({cut[:16].replace('T', ' ')} UTC): {done} of {len(rows)}\n")
for ok, name, via, seen in rows:
    print(f"  [{'x' if ok else ' '}] {name:34s} {via:7s} last heard {seen or 'never'}")
print("\n  [ ] the hub's address reserved on the router (its pinned MAC)\n"
      "  [ ] the relay's first call answered by the hub\n"
      "  [ ] the BOX-3's companion address, and Home Assistant's /ollama URL")
