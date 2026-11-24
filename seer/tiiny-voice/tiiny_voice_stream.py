#!/usr/bin/env python3
# BRAIN: none -- a keyed proxy to the Tiiny's voice and models
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

THE GATE (companion C-370, C-371, C-374; 2026-11-15, the Tiiny's update): a few more of the Tiiny's own routes, the same
key, and nothing else -- the Tiiny's HTTP API (dev.tiiny.ai) can also delete and download models, and none of that is let
through. Allowed:

    GET  /tiiny/models                      the models on the device     (api/v1/models/)
    GET  /tiiny/store                       the Tiiny's model store      (api/v1/models/online_models)
    GET  /tiiny/npu                         the NPU's use                (api/v1/npu/status)
    POST /tiiny/models/<model id>/start     load one                     (api/v1/models/<id>/start)
    POST /tiiny/models/<model id>/stop      unload one                   (api/v1/models/<id>/stop)
    GET  /v1/music/info?model=...           a music model's defaults
    POST /v1/music/generate[/wav]           a song: lyrics and a caption (LiteLLM has no music route)
    POST /v1/audio/transcriptions           heard, with the Tiiny's whole answer (LiteLLM keeps only its text);
                                            ?native=1 asks the Tiiny's own API (v1/audio/transcriptions), not its OpenAI one

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
MOST_UPLOAD = 48 * 1024 * 1024  # a meeting's audio, a song's style reference
# the Tiiny's own API beside its OpenAI one: the same box, by its other name (both reach the TiinyOS proxy)
NATIVE = os.environ.get("TIINY_NATIVE", "")
MODEL_ID = re.compile(r"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)?$")
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
if not NATIVE:
    _u = urllib.parse.urlsplit(BASE)
    NATIVE = "%s://%s%s" % (_u.scheme, (_u.hostname or "").replace("openai.api.", "api.", 1), (":%d" % _u.port) if _u.port else "")
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

    def keyed(self):
        auth = self.headers.get("authorization", "")
        if key_ok(auth[7:].strip() if auth.lower().startswith("bearer ") else ""):
            return True
        self.say(401, "a key LiteLLM takes")
        return False

    def forward(self, method, base, path, body=None, ctype=None, timeout=60):
        """One allowed call sent on to the Tiiny with its key, and its answer streamed back as it comes."""
        u = urllib.parse.urlsplit(base)
        try:
            c = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=timeout)
            h = {"Authorization": "Bearer " + KEY} if KEY else {}
            if ctype:
                h["content-type"] = ctype
            c.request(method, u.path.rstrip("/") + path, body=body, headers=h)
            r = c.getresponse()
        except OSError as e:
            return self.say(502, "the Tiiny: %s" % e.__class__.__name__)
        self.send_response(r.status)
        for k in ("content-type", "x-session-id"):
            if r.getheader(k):
                self.send_header(k, r.getheader(k))
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
            pass
        finally:
            c.close()

    def body(self, most):
        n = int(self.headers.get("content-length") or 0)
        if n <= 0 or n > most:
            self.say(413, "a body up to %d MB" % (most // (1024 * 1024)) if most >= 1024 * 1024 else "a body up to 64 KB")
            return None
        return self.rfile.read(n)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        path = path.rstrip("/")
        if path == "/health":
            return self.say(200, "")  # {"error": ""}: up
        if path in ("/tiiny/models", "/tiiny/store", "/tiiny/npu", "/v1/music/info"):
            if not self.keyed():
                return
            to = {"/tiiny/models": "/api/v1/models/", "/tiiny/store": "/api/v1/models/online_models", "/tiiny/npu": "/api/v1/npu/status",
                  "/v1/music/info": "/v1/music/info" + ("?" + query if query else "")}[path]
            return self.forward("GET", NATIVE, to, timeout=20)
        return self.say(404, "not a route here")

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        if path.startswith("/tiiny/models/") and (path.endswith("/start") or path.endswith("/stop")):
            model, act = path[len("/tiiny/models/"):].rsplit("/", 1)
            if not MODEL_ID.match(model):
                return self.say(400, "a model id")
            if not self.keyed():
                return
            return self.forward("POST", NATIVE, "/api/v1/models/%s/%s" % (model, act), timeout=300)
        if path in ("/v1/music/generate", "/v1/music/generate/wav"):
            if not self.keyed():
                return
            b = self.body(MOST_UPLOAD)
            return None if b is None else self.forward("POST", NATIVE, path, b, "application/json", timeout=900)
        if path == "/v1/audio/transcriptions":
            if not self.keyed():
                return
            b = self.body(MOST_UPLOAD)
            if b is None:
                return None
            # C-370: the Tiiny's own API, as dev.tiiny.ai documents it (does it say who spoke?), or its OpenAI one
            if "native=1" in self.path.partition("?")[2].split("&"):
                return self.forward("POST", NATIVE, "/v1/audio/transcriptions", b, self.headers.get("content-type"), timeout=600)
            return self.forward("POST", BASE, "/audio/transcriptions", b, self.headers.get("content-type"), timeout=600)
        if path != "/v1/audio/speech":
            return self.say(404, "not a route here")
        if not self.keyed():
            return
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
