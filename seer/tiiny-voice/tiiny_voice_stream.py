#!/usr/bin/env python3
"""The Tiiny's voice, streamed -- C-317 (the user, 2026-11-10: "set up the LiteLLM pass-through").

LiteLLM hands a voice on only once it is whole (measured: the first byte at 13 s for 20 s of speech), while the Tiiny,
asked straight, sends its first audio in 1.8 s. A LiteLLM pass-through would stream it, but in LiteLLM 1.83 a
pass-through can ask for a key only with an Enterprise licence -- without one it is open to the whole network. So this
is the pass-through, keyed: one route, POST /v1/audio/speech, sent on to the Tiiny and its answer streamed back as it
comes.

The key: whatever key LiteLLM itself takes (the master key, or a virtual key). A key never seen is checked by asking
LiteLLM (GET /v1/models with it); one it accepts is remembered, as a hash, for ten minutes. Nothing here holds or reads
LiteLLM's master key.

The Tiiny's address, model and key are read from LiteLLM's own config (its `tiiny-voice` model) when this starts, so
there is one place to change them. Never printed.

    python3 tiiny_voice_stream.py            # port 4001, LiteLLM at 127.0.0.1:4000, ~/daemons-litellm-config.yaml

Part of the local cloud: seer/bindSeer.sh installs it with a Tiiny (seer/tiiny-voice/install.sh), its config
seer/out/litellm.yaml (TIINY_VOICE_CONFIG), whose tiiny-voice key is named by TIINY_API_KEY.
"""
import hashlib, hmac, http.client, json, os, re, sys, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("TIINY_VOICE_PORT", "4001"))
LITELLM = os.environ.get("TIINY_VOICE_LITELLM", "http://127.0.0.1:4000")
CONFIG = os.path.expanduser(os.environ.get("TIINY_VOICE_CONFIG", "~/daemons-litellm-config.yaml"))
ALIAS = os.environ.get("TIINY_VOICE_ALIAS", "tiiny-voice")
MOST_BODY = 64 * 1024
KEEP_S = 600


def tiiny_route():
    """The `tiiny-voice` model's api_base, model and api_key, from LiteLLM's config (a plain read: no yaml module)."""
    text = open(CONFIG).read()
    at = text.find("model_name: %s\n" % ALIAS)
    if at < 0:
        sys.exit("no model_name: %s in %s" % (ALIAS, CONFIG))
    block = text[at:].split("- model_name:", 1)[0]
    get = lambda k: (re.search(r"^\s*%s:\s*(\S+)" % k, block, re.M) or [None, ""])[1].strip("'\"")
    base, model, key = get("api_base"), get("model"), get("api_key")
    if key.startswith("os.environ/"):
        key = os.environ.get(key.split("/", 1)[1], "")
    return base.rstrip("/"), model.split("/", 1)[1] if model.startswith("openai/") else model, key


BASE, MODEL, KEY = tiiny_route()
seen = {}  # sha256 of a key LiteLLM took -> when


def key_ok(bearer):
    if not bearer:
        return False
    h = hashlib.sha256(bearer.encode()).hexdigest()
    now = time.time()
    for k in [k for k, t in seen.items() if now - t > KEEP_S]:
        del seen[k]
    if any(hmac.compare_digest(h, k) for k in seen):
        return True
    u = urllib.parse.urlsplit(LITELLM)
    try:
        c = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=5)
        c.request("GET", "/v1/models", headers={"Authorization": "Bearer " + bearer})
        ok = c.getresponse().status == 200
        c.close()
    except OSError:
        return False
    if ok:
        seen[h] = now
    return ok


class Voice(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):  # a line per request, never a header
        sys.stderr.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), fmt % a))

    def say(self, status, msg):
        b = json.dumps({"error": msg}).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            return self.say(200, "")  # {"error": ""}: up
        return self.say(404, "only POST /v1/audio/speech")

    def do_POST(self):
        if self.path.split("?")[0].rstrip("/") != "/v1/audio/speech":
            return self.say(404, "only POST /v1/audio/speech")
        auth = self.headers.get("authorization", "")
        if not key_ok(auth[7:].strip() if auth.lower().startswith("bearer ") else ""):
            return self.say(401, "a key LiteLLM takes")
        n = int(self.headers.get("content-length") or 0)
        if n <= 0 or n > MOST_BODY:
            return self.say(413, "a body up to 64 KB")
        try:
            body = json.loads(self.rfile.read(n))
        except ValueError:
            return self.say(400, "a JSON body")
        body["model"] = MODEL  # whatever it was called here, the Tiiny's own name for it
        u = urllib.parse.urlsplit(BASE)
        try:
            c = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=60)
            c.request("POST", u.path + "/audio/speech", body=json.dumps(body).encode(),
                      headers={"content-type": "application/json", **({"Authorization": "Bearer " + KEY} if KEY else {})})
            r = c.getresponse()
        except OSError as e:
            return self.say(502, "the Tiiny: %s" % e.__class__.__name__)
        self.send_response(r.status)
        self.send_header("content-type", r.getheader("content-type") or "application/octet-stream")
        self.send_header("transfer-encoding", "chunked")
        self.send_header("cache-control", "no-store")
        self.end_headers()
        try:
            while True:
                piece = r.read1(16384) if hasattr(r, "read1") else r.read(16384)
                if not piece:
                    break
                self.wfile.write(b"%x\r\n%s\r\n" % (len(piece), piece))
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
        except (BrokenPipeError, ConnectionResetError):
            pass  # the hub hung up
        finally:
            c.close()


if __name__ == "__main__":
    print("tiiny voice stream on :%d -> %s (%s), keys checked by %s" % (PORT, BASE, MODEL, LITELLM), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Voice).serve_forever()
