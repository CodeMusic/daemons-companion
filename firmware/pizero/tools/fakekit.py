#!/usr/bin/env python3
"""C-461: a stand-in for the LLM630 Kit on a computer, so the Zero's TALK and KIT pages are run with no Kit in hand.

    python3 tools/fakekit.py [--port 10001]       StackFlow on PORT, its agent (kitd's /state) on PORT+1
    ./build/window/daemons-zero --kit-at 127.0.0.1:10001 --kit
    ./build/window/daemons-zero --kit-at 127.0.0.1:10001 --kit-say "hello"

It speaks StackFlow as M5Stack's units do (docs/LLM630.md): sys ping, version and lsmode; setup answering a work_id;
the llm's answer in streamed deltas; whisper's words from a recording sent in base64 pieces; melotts' voice as 16 kHz
PCM in base64 pieces (a soft tone, one piece per sentence). It is not the Kit: nothing here proves a model works.
"""
import argparse, base64, json, math, socketserver, struct, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer

MODELS = [("qwen2.5-0.5B-p256-ax630c", "llm"), ("whisper-base", "whisper"), ("melotts-en-us", "tts")]
state = {"n": 1000, "units": {}}


def objects(sock):
    buf, depth, in_str, esc, cur = b"", 0, False, False, bytearray()
    while True:
        data = sock.recv(4096)
        if not data:
            return
        for c in data:
            ch = chr(c)
            if depth == 0 and ch != "{":
                continue
            cur.append(c)
            if in_str:
                if esc: esc = False
                elif ch == "\\": esc = True
                elif ch == '"': in_str = False
                continue
            if ch == '"': in_str = True
            elif ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    yield json.loads(cur.decode())
                    cur = bytearray()


class Flow(socketserver.BaseRequestHandler):
    def send(self, rid, work, data, obj="None", code=0):
        msg = {"request_id": rid, "work_id": work, "created": int(time.time()), "object": obj, "data": data,
               "error": {"code": code, "message": "" if code == 0 else "refused"}}
        self.request.sendall(json.dumps(msg).encode())

    def handle(self):
        heard = {}
        for q in objects(self.request):
            rid, work, act = q.get("request_id"), q.get("work_id", ""), q.get("action")
            if work == "sys":
                if act == "ping": self.send(rid, "sys", "None")
                elif act == "version": self.send(rid, "sys", "v1.10 (fake)")
                elif act == "lsmode": self.send(rid, "sys", [{"mode": m, "type": t} for m, t in MODELS], "sys.lsmode")
                else: self.send(rid, "sys", "None", code=-1)
            elif act == "setup":
                state["n"] += 1
                wid = f"{work}.{state['n']}"
                state["units"][wid] = q.get("data", {})
                time.sleep(0.5)
                self.send(rid, wid, "None")
            elif act == "exit":
                state["units"].pop(work, None)
                self.send(rid, work, "None")
            elif act == "inference" and work.startswith("llm"):
                words = q["data"] if isinstance(q["data"], str) else q["data"].get("delta", "")
                answer = f"I heard you say {words.strip()[:40]}. I am here, on the Kit."
                parts = answer.split(" ")
                for i, p in enumerate(parts):
                    time.sleep(0.05)
                    self.send(rid, work, {"delta": p + (" " if i < len(parts) - 1 else ""), "index": i, "finish": False}, "llm.utf-8.stream")
                self.send(rid, work, {"delta": "", "index": len(parts), "finish": True}, "llm.utf-8.stream")
            elif act == "inference" and work.startswith("whisper"):
                d = q["data"]
                heard.setdefault(work, []).append(base64.b64decode(d.get("delta", "")))
                if d.get("finish"):
                    wav = b"".join(heard.pop(work))
                    secs = max(0, len(wav) - 44) / 32000
                    self.send(rid, work, f"a recording of {secs:.1f} seconds", "asr.utf-8")
            elif act == "inference" and work.startswith("melotts"):
                text = q["data"] if isinstance(q["data"], str) else ""
                sentences = [s for s in text.replace("!", ".").replace("?", ".").split(".") if s.strip()] or [text]
                for i, s in enumerate(sentences):
                    n = int(16000 * min(1.2, 0.05 * len(s)))
                    pcm = b"".join(struct.pack("<h", int(2500 * math.sin(2 * math.pi * 330 * t / 16000))) for t in range(n))
                    self.send(rid, work, {"delta": base64.b64encode(pcm).decode(), "index": i, "finish": i == len(sentences) - 1}, "pcm.stream.base64")
            else:
                self.send(rid, work, "None", code=-2)


class Agent(BaseHTTPRequestHandler):
    hotspot = "off"
    def log_message(self, *a): pass
    def answer(self, d):
        b = json.dumps(d).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        self.answer({"cell": -1, "charging": False, "usb": True, "temp": 41.5, "memFreeMb": 2900, "hotspot": Agent.hotspot, "fake": True})
    def do_POST(self):
        n = int(self.headers.get("content-length", 0)); body = json.loads(self.rfile.read(n) or b"{}")
        if self.path == "/hotspot": Agent.hotspot = "on" if body.get("on") else "off"
        self.answer({"ok": True, "hotspot": Agent.hotspot})


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=10001); a = ap.parse_args()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    flow = socketserver.ThreadingTCPServer(("127.0.0.1", a.port), Flow)
    agent = HTTPServer(("127.0.0.1", a.port + 1), Agent)
    threading.Thread(target=agent.serve_forever, daemon=True).start()
    print(f"fake Kit: StackFlow on 127.0.0.1:{a.port}, agent on :{a.port + 1}", flush=True)
    flow.serve_forever()
