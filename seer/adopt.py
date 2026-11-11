#!/usr/bin/env python3
"""A local cloud set up by hand before this package (roverbyteseer, 2026-09..11), taken into seer/.seer -- so moving it
onto the package keeps every key the hub and n8n already hold. Run by `seer/bindSeer.sh --adopt` ON that machine.

Read, if there: ~/.litellm.env (LITELLM_MASTER_KEY, OPENROUTER_API_KEY) and ~/daemons-litellm-config.yaml (the Tiiny's
address and key, from its tiiny-35b entry, and the rest of its models as the harness's, which make.py carries). The
parts already running are found by their ports. Only what seer/.seer lacks is filled; nothing is printed but names.
"""
import os, re, socket, sys

SEER = os.path.dirname(os.path.abspath(__file__))
CONF = os.environ.get("SEER_CONFIG") or os.path.join(SEER, ".seer")
HOME = os.path.expanduser("~")


def read(path):
    out = {}
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip().removeprefix("export ").strip()] = v.strip().strip("'\"")
    return out


def answers(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def main():
    have, found = read(CONF), {}
    env = read(os.path.join(HOME, ".litellm.env"))
    for k in ("LITELLM_MASTER_KEY", "OPENROUTER_API_KEY"):
        if env.get(k):
            found[k] = env[k]
    cfg = os.path.join(HOME, "daemons-litellm-config.yaml")
    if os.path.exists(cfg):
        text = open(cfg).read()
        m = re.search(r"model_name: tiiny-35b\n(.*?)(?=\n  - model_name:|\n\S)", text, re.S)
        if m:
            found["SEER_TIINY"] = "yes"
            base = re.search(r"api_base:\s*(\S+)", m.group(1))
            key = re.search(r"api_key:\s*(\S+)", m.group(1))
            if base:
                found["TIINY_URL"] = base.group(1).strip("'\"")
            if key and not key.group(1).startswith("os.environ/"):
                found["TIINY_API_KEY"] = key.group(1).strip("'\"")
            elif key:
                v = env.get(key.group(1).split("/", 1)[1])
                if v:
                    found["TIINY_API_KEY"] = v
        found["HARNESS_CONFIG"] = cfg     # its other models carried whole (make.py skips the names it writes itself)
    parts = [p for p, port in (("sleep", 4002), ("local", 1234), ("commons", 4750), ("comfyui", 8008)) if answers(port)]
    if parts:
        found["SEER_PARTS"] = ",".join(parts)
    new = {k: v for k, v in found.items() if not have.get(k)}
    if not new:
        print("   adopt: nothing new to take (seer/.seer already has it)")
        return
    lines = [l for l in (open(CONF).read().splitlines() if os.path.exists(CONF) else []) if l.split("=", 1)[0] not in new]
    lines += ["%s=%s" % kv for kv in new.items()]
    old = os.umask(0o077)
    with open(CONF + ".tmp", "w") as f:
        f.write("\n".join(lines) + "\n")
    os.umask(old)
    os.replace(CONF + ".tmp", CONF)
    os.chmod(CONF, 0o600)
    print("   adopt: took " + ", ".join(sorted(new)))


if __name__ == "__main__":
    main()
