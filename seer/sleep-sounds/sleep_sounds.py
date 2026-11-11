#!/usr/bin/env python3
"""Sleep sounds made for a daemon -- companion C-334 (the user, 2026-11-11: "if it is possible to use the tiiny or
roverbyteseer to make sleep sound tracks ... we could build output that is DAEMON-ified (using again context to steer
the output)"). Part of the local cloud: seer/bindSeer.sh installs it (seer/sleep-sounds/install.sh) when sleep sounds are
chosen, with ACE-Step (seer/acestep/install.sh).

ACE-Step 1.5 (musai-services/musaisong) already runs on this machine, on 127.0.0.1:8001 only. This is the hub's keyed
door to it, beside LiteLLM, the way tiiny_voice_stream.py is the door to the Tiiny's voice: the hub writes the
caption from the daemon's context (companion server/src/sleepsound.ts), asks for a piece here, and fetches the finished
file. Nothing is kept here past that:

    POST /v1/sleep/make   {caption, seconds 60-600, bpm, keyscale, seed?}   -> {job}
    GET  /v1/sleep/job/<job>                                                -> {state: queued|making|done|failed, ...}
    GET  /v1/sleep/file/<job>.flac                                          -> the piece, made to loop without a seam
    DELETE /v1/sleep/file/<job>                                             -> gone (the hub keeps its own copy)

A finished piece is made LOOPABLE here: its last LOOP_S seconds are faded into its first, so played round and round it
has no seam (the body runs from LOOP_S to the end, and the end is mixed back onto the beginning), and its loudness is
set gently low (-23 LUFS). ACE-Step's own file is deleted once converted; a piece nobody fetched is deleted after six
hours. Out files: ~/daemons-sleep-sounds/out (a few tens of MB at most, briefly).

Keys: whatever key LiteLLM itself takes, checked by asking LiteLLM (as tiiny_voice_stream.py does). Never printed.

    python3 sleep_sounds.py          # port 4002, ACE-Step at 127.0.0.1:8001, LiteLLM at 127.0.0.1:4000
"""
import glob, hashlib, hmac, http.client, json, os, re, shutil, subprocess, sys, threading, time, urllib.parse, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("SLEEP_SOUNDS_PORT", "4002"))
LITELLM = os.environ.get("SLEEP_SOUNDS_LITELLM", "http://127.0.0.1:4000")
ACE = os.environ.get("SLEEP_SOUNDS_ACE", "http://127.0.0.1:8001")
OUT = os.path.expanduser(os.environ.get("SLEEP_SOUNDS_OUT", "~/daemons-sleep-sounds/out"))
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
LOOP_S = 8.0          # the seam, faded across
KEEP_UNFETCHED_S = 6 * 3600
KEEP_KEY_S = 600
MOST_BODY = 16 * 1024
BAD_WORDS = re.compile(r"[^\w ,.'()/&+:-]", re.U)   # a caption is music words, nothing else

seen = {}             # sha256 of a key LiteLLM took -> when
jobs = {}             # our job -> {task, state, at, error?, seconds?}
lock = threading.Lock()


def key_ok(bearer):
    if not bearer:
        return False
    h = hashlib.sha256(bearer.encode()).hexdigest()
    now = time.time()
    for k in [k for k, t in seen.items() if now - t > KEEP_KEY_S]:
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


def ace(method, path, body=None, timeout=30):
    u = urllib.parse.urlsplit(ACE)
    c = http.client.HTTPConnection(u.hostname, u.port or 80, timeout=timeout)
    c.request(method, path, body=json.dumps(body).encode() if body is not None else None,
              headers={"content-type": "application/json"})
    r = c.getresponse()
    data = r.read()
    c.close()
    return r.status, data


def loopable(src, dst):
    """src (ACE-Step's wav) -> dst (FLAC, 44.1 kHz stereo) that loops without a seam, quiet and even."""
    probe = subprocess.run([FFMPEG, "-i", src], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe)
    if not m:
        raise RuntimeError("no duration")
    d = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    x = min(LOOP_S, d / 4)
    graph = ("[0]loudnorm=I=-23:TP=-3:LRA=9,aresample=44100,asplit=3[a][b][c];"
             "[a]atrim=%.3f:%.3f,asetpts=PTS-STARTPTS[body];"
             "[b]atrim=%.3f:%.3f,asetpts=PTS-STARTPTS,afade=t=out:d=%.3f[tail];"
             "[c]atrim=0:%.3f,asetpts=PTS-STARTPTS,afade=t=in:d=%.3f[head];"
             "[tail][head]amix=inputs=2:normalize=0[seam];"
             "[body][seam]concat=n=2:v=0:a=1[out]") % (x, d - x, d - x, d, x, x, x)
    subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", src, "-filter_complex", graph, "-map", "[out]",
                    "-ac", "2", "-c:a", "flac", dst], check=True, timeout=300)
    return d - x


def follow(job):
    """Waits on ACE-Step for one job, then makes its file loopable."""
    j = jobs[job]
    deadline = time.time() + 1800
    while time.time() < deadline:
        time.sleep(4)
        try:
            st, data = ace("POST", "/query_result", {"task_id_list": [j["task"]]})
            row = json.loads(data.decode(), strict=False)["data"][0]
        except (OSError, ValueError, KeyError, IndexError) as e:
            j.update(state="failed", error="ACE-Step: %s" % e.__class__.__name__)
            return
        if row["status"] == 0:
            j["state"] = "making"
            continue
        if row["status"] != 1:
            j.update(state="failed", error="ACE-Step failed")
            return
        try:
            res = json.loads(row["result"], strict=False)[0]
            path = urllib.parse.parse_qs(urllib.parse.urlsplit(res["file"]).query)["path"][0]
            dst = os.path.join(OUT, job + ".flac")
            j["seconds"] = round(loopable(path, dst), 1)
            j["metas"] = {k: res.get("metas", {}).get(k) for k in ("bpm", "keyscale", "timesignature")}
            j["seed"] = res.get("seed_value")
            j["state"] = "done"
            j["at"] = time.time()
            for f in glob.glob(os.path.join(os.path.dirname(path), os.path.basename(path).rsplit(".", 1)[0] + ".*")):
                os.remove(f)   # ACE-Step's own copy: kept nowhere
        except Exception as e:  # noqa: BLE001 -- any failure is this job's, reported, never the server's
            j.update(state="failed", error="converting: %s" % e.__class__.__name__)
        return
    j.update(state="failed", error="took too long")


def sweep():
    while True:
        now = time.time()
        with lock:
            for job in [k for k, v in jobs.items() if now - v["at"] > KEEP_UNFETCHED_S]:
                try:
                    os.remove(os.path.join(OUT, job + ".flac"))
                except OSError:
                    pass
                del jobs[job]
        for f in glob.glob(os.path.join(OUT, "*.flac")):
            if now - os.path.getmtime(f) > KEEP_UNFETCHED_S:
                os.remove(f)
        time.sleep(600)


class Sleep(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), fmt % a))

    def json(self, status, obj):
        b = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def keyed(self):
        auth = self.headers.get("authorization", "")
        if key_ok(auth[7:].strip() if auth.lower().startswith("bearer ") else ""):
            return True
        self.json(401, {"error": "a key LiteLLM takes"})
        return False

    def job_of(self, prefix, suffix=""):
        p = self.path.split("?")[0]
        job = p[len(prefix):]
        if suffix:
            if not job.endswith(suffix):
                return None
            job = job[: -len(suffix)]
        return job if re.fullmatch(r"[0-9a-f]{32}", job) and job in jobs else None

    def do_GET(self):
        p = self.path.split("?")[0].rstrip("/")
        if p == "/health":
            return self.json(200, {"error": "", "jobs": len(jobs)})
        if not self.keyed():
            return
        if p.startswith("/v1/sleep/job/"):
            job = self.job_of("/v1/sleep/job/")
            if not job:
                return self.json(404, {"error": "no such job"})
            j = jobs[job]
            return self.json(200, {k: j.get(k) for k in ("state", "error", "seconds", "metas", "seed")} | {"job": job})
        if p.startswith("/v1/sleep/file/"):
            job = self.job_of("/v1/sleep/file/", ".flac")
            f = job and os.path.join(OUT, job + ".flac")
            if not f or not os.path.exists(f):
                return self.json(404, {"error": "no such file"})
            self.send_response(200)
            self.send_header("content-type", "audio/flac")
            self.send_header("content-length", str(os.path.getsize(f)))
            self.end_headers()
            with open(f, "rb") as fh:
                shutil.copyfileobj(fh, self.wfile)
            return
        return self.json(404, {"error": "POST /v1/sleep/make, GET /v1/sleep/job/<job>, GET /v1/sleep/file/<job>.flac"})

    def do_DELETE(self):
        if not self.keyed():
            return
        job = self.job_of("/v1/sleep/file/")
        if not job:
            return self.json(404, {"error": "no such job"})
        with lock:
            try:
                os.remove(os.path.join(OUT, job + ".flac"))
            except OSError:
                pass
            jobs.pop(job, None)
        return self.json(200, {"gone": job})

    def do_POST(self):
        if self.path.split("?")[0].rstrip("/") != "/v1/sleep/make":
            return self.json(404, {"error": "only POST /v1/sleep/make"})
        if not self.keyed():
            return
        n = int(self.headers.get("content-length") or 0)
        if n <= 0 or n > MOST_BODY:
            return self.json(413, {"error": "a body up to 16 KB"})
        try:
            b = json.loads(self.rfile.read(n))
            caption = BAD_WORDS.sub("", str(b["caption"]))[:600].strip()
            seconds = max(60, min(600, float(b.get("seconds", 300))))
            bpm = max(30, min(120, int(b.get("bpm", 60))))
            keyscale = str(b.get("keyscale", "")).strip()
            keyscale = keyscale if re.fullmatch(r"[A-G][#b]? (major|minor)", keyscale, re.I) else ""
        except (ValueError, KeyError, TypeError):
            return self.json(400, {"error": "a JSON body with a caption"})
        if not caption:
            return self.json(400, {"error": "a caption"})
        ask = {"prompt": caption, "lyrics": "[Instrumental]", "audio_duration": seconds, "bpm": bpm,
               "audio_format": "wav", "inference_steps": 8, "batch_size": 1, "thinking": False, "use_cot_caption": False,
               "time_signature": "3"}
        if keyscale:
            ask["key_scale"] = keyscale
        if isinstance(b.get("seed"), int):
            ask.update(use_random_seed=False, seed=b["seed"])
        try:
            st, data = ace("POST", "/release_task", ask)
            task = json.loads(data.decode(), strict=False)["data"]["task_id"]
        except (OSError, ValueError, KeyError, TypeError):
            return self.json(502, {"error": "ACE-Step did not take it"})
        job = uuid.uuid4().hex
        with lock:
            jobs[job] = {"task": task, "state": "queued", "at": time.time()}
        threading.Thread(target=follow, args=(job,), daemon=True).start()
        return self.json(202, {"job": job})


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    threading.Thread(target=sweep, daemon=True).start()
    print("sleep sounds on :%d -> ACE-Step %s, keys checked by %s, out %s" % (PORT, ACE, LITELLM, OUT), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Sleep).serve_forever()
