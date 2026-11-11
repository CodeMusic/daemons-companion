#!/usr/bin/env python3
"""Put a workflow file onto one of the user's n8n servers, and switch it on (2026-10-07).

    python3 seer/n8n/push.py internal "seer/out/n8n/DAEMONS - daemon_talk (internal).json"
    python3 seer/n8n/push.py public   "seer/out/n8n/public-relay/DAEMONS Public - daemon_talk relay.json"
    ... --off        import or update it, but leave it switched off

A workflow already there under the same name is UPDATED in place (its id, and so its webhook, stays); otherwise it is
created. The servers and their API keys come from the local cloud's settings, seer/.seer (gitignored; bindSeer.sh writes
it): N8N_INTERNAL_URL and N8N_INTERNAL_KEY are this machine's n8n, N8N_PUBLIC_URL and N8N_PUBLIC_KEY a public relay's if
there is one. SEER_CONFIG names another file. The keys never leave it.
"""
import json, os, sys, urllib.request

SEER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYS = os.environ.get("SEER_CONFIG") or os.path.join(SEER, ".seer")
ALLOWED_SETTINGS = {"executionOrder", "saveDataErrorExecution", "saveDataSuccessExecution", "saveManualExecutions",
                    "saveExecutionProgress", "executionTimeout", "errorWorkflow", "timezone", "callerPolicy"}


def keys():
    out = {}
    for line in open(KEYS):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k] = v
    return out


def call(base, key, method, path, body=None):
    req = urllib.request.Request(base + "/api/v1" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-N8N-API-KEY": key, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit("push: %s %s -> %s %s" % (method, path, e.code, e.read().decode()[:400]))


def main():
    args = [a for a in sys.argv[1:] if a != "--off"]
    if len(args) != 2 or args[0] not in ("internal", "public"):
        sys.exit(__doc__)
    k = keys()
    side = args[0].upper()
    base, key = k.get("N8N_%s_URL" % side, "").strip("'\""), k.get("N8N_%s_KEY" % side, "").strip("'\"")
    if not base or not key:
        sys.exit("push: no N8N_%s_URL and N8N_%s_KEY in %s -- n8n's own page: Settings > n8n API > create a key" % (side, side, KEYS))
    wf = json.load(open(args[1]))
    body = {"name": wf["name"], "nodes": wf["nodes"], "connections": wf["connections"],
            "settings": {s: v for s, v in (wf.get("settings") or {}).items() if s in ALLOWED_SETTINGS}}
    there = [w for w in call(base, key, "GET", "/workflows?limit=250").get("data", []) if w["name"] == wf["name"]]
    if there:
        wid = there[0]["id"]
        call(base, key, "PUT", "/workflows/%s" % wid, body)
        print("updated  %s  (%s on %s)" % (wf["name"], wid, args[0]))
    else:
        wid = call(base, key, "POST", "/workflows", body)["id"]
        print("created  %s  (%s on %s)" % (wf["name"], wid, args[0]))
    # every workflow made for DAEMONS carries the servers' "daemons" tag (the user, 2026-10-07)
    tags = [t for t in call(base, key, "GET", "/tags?limit=100").get("data", []) if t["name"] == "daemons"]
    tag = tags[0]["id"] if tags else call(base, key, "POST", "/tags", {"name": "daemons"})["id"]
    call(base, key, "PUT", "/workflows/%s/tags" % wid, [{"id": tag}])
    print("tagged   daemons")
    if "--off" not in sys.argv:
        call(base, key, "POST", "/workflows/%s/activate" % wid)
        print("active")


if __name__ == "__main__":
    main()
