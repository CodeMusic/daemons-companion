#!/usr/bin/env python3
"""The local cloud's configuration, written from one file (seer/.seer) so every part agrees with every other.

    python3 seer/make.py            # writes seer/out/: litellm.yaml, n8n.env, services.env, the n8n workflows, hub.txt
    python3 seer/make.py --print    # says what it would write, and the names, without writing

The one rule that keeps them in step: LiteLLM always answers by the same four names, whatever machine is behind them --

    seer-talk    a daemon's talk, dreams, write-ups        the Tiiny's big thinker, or a local model, or OpenRouter
    seer-quick   a quick line, someone waiting             the Tiiny's quick thinker, or the local quick model
    seer-hear    speech to text                            the Tiiny's ASR, or Whisper on this machine (seer/stt)
    seer-voice   a voice                                   the Tiiny's voice design; none without one (the hub's own)

so n8n's workflows (DAEMONS_LLM_MODEL=seer-talk, DAEMONS_STT_MODEL=seer-hear) and the hub's MIND settings never change
when the set-up does. With a Tiiny the old names stay too (tiiny-35b, tiiny-9b, tiiny-hear, tiiny-voice), so a hub set
up before this keeps working. Without a Tiiny: local models first, then OpenRouter if a key is given (the user's pick,
2026-11-11). No secret is written into any file here except seer/.seer itself: the configs name them by environment.
Stdlib only.
"""
import json, os, re, subprocess, sys

SEER = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SEER, "out")


def read(path):
    out = {}
    if not os.path.exists(path):
        return out
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip("'\"")
    return out


def conf():
    c = read(os.environ.get("SEER_CONFIG") or os.path.join(SEER, ".seer"))
    d = {  # the defaults: roverbyteseer's own as of 2026-11-11
        "SEER_TIINY": "no", "TIINY_URL": "http://openai.api.tiiny/v1",
        "TIINY_TALK_MODEL": "Qwen/Qwen3.6-35B-A3B", "TIINY_QUICK_MODEL": "Qwen/Qwen3.5-9B",
        "TIINY_HEAR_MODEL": "Qwen/Qwen3-ASR-1.7B", "TIINY_VOICE_MODEL": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "SEER_PARTS": "", "LOCAL_URL": "http://127.0.0.1:1234/v1",
        "LOCAL_TALK_MODEL": "google/gemma-3-4b", "LOCAL_QUICK_MODEL": "", "STT_URL": "http://127.0.0.1:8770/v1",
        "OPENROUTER_MODEL": "meta-llama/llama-3.1-8b-instruct", "SEER_HOST": "", "LITELLM_PORT": "4000",
        "HARNESS_CONFIG": "", "N8N_PUBLIC_URL": "", "DEXTER_TTS_URL": "",
    }
    d.update({k: v for k, v in c.items() if v != ""})
    d["parts"] = {p.strip() for p in d["SEER_PARTS"].split(",") if p.strip()}
    d["tiiny"] = d["SEER_TIINY"].lower() in ("yes", "y", "true", "1")
    d["openrouter"] = bool(c.get("OPENROUTER_API_KEY"))
    d["local"] = "local" in d["parts"]
    if not d["SEER_HOST"]:
        d["SEER_HOST"] = host()
    return d


def host():
    """This machine's tailnet name if it has one (roverbyteseer is always called by its plain name), else its own name."""
    try:
        j = json.loads(subprocess.run(["tailscale", "status", "--json"], capture_output=True, text=True, timeout=5).stdout)
        return j["Self"]["DNSName"].split(".")[0]
    except Exception:  # noqa: BLE001
        return os.uname().nodename.split(".")[0]


def entry(name, model, base=None, key=None, bridge=False, mode=None, note=None):
    lines = []
    if note:
        lines += ["  # " + n for n in note.split("\n")]
    lines += ["  - model_name: %s" % name, "    litellm_params:", "      model: %s" % model]
    if base:
        lines.append("      api_base: %s" % base)
    if key:
        lines.append("      api_key: %s" % key)
    if bridge:
        lines.append("      use_chat_completions_api: true")
    if mode:
        lines += ["    model_info:", "      mode: %s" % mode]
    return "\n".join(lines) + "\n"


def litellm(c):
    t, tb, tk = c["tiiny"], c["TIINY_URL"], "os.environ/TIINY_API_KEY"
    asr = lambda m: "hosted_vllm/" + m   # not openai/: LiteLLM's openai route asks the Tiiny for verbose_json, a 400 (2026-11-05)
    out, fallbacks = [], []
    if t:
        out.append("\n  # ---- the Tiiny, by its own names (a hub set up before seer/ asks for these) ----\n")
        out += [entry("tiiny-35b", "openai/" + c["TIINY_TALK_MODEL"], tb, tk), entry("tiiny-9b", "openai/" + c["TIINY_QUICK_MODEL"], tb, tk),
                entry("tiiny-hear", asr(c["TIINY_HEAR_MODEL"]), tb, tk, mode="audio_transcription"),
                entry("tiiny-voice", "openai/" + c["TIINY_VOICE_MODEL"], tb, tk, mode="audio_speech")]
    out.append("\n  # ---- the four names everything else asks for (seer/make.py) ----\n")
    lb, lk = c["LOCAL_URL"], "none"
    quick_local = c["LOCAL_QUICK_MODEL"] or c["LOCAL_TALK_MODEL"]
    if t:
        out += [entry("seer-talk", "openai/" + c["TIINY_TALK_MODEL"], tb, tk), entry("seer-quick", "openai/" + c["TIINY_QUICK_MODEL"], tb, tk),
                entry("seer-hear", asr(c["TIINY_HEAR_MODEL"]), tb, tk, mode="audio_transcription"),
                entry("seer-voice", "openai/" + c["TIINY_VOICE_MODEL"], tb, tk, mode="audio_speech")]
        if c["local"]:   # a Tiiny that stops answering falls back to this machine's own models
            out += [entry("seer-talk-here", "openai/" + c["LOCAL_TALK_MODEL"], lb, lk, bridge=True),
                    entry("seer-hear-here", "openai/whisper-1", c["STT_URL"], lk, mode="audio_transcription")]
            fallbacks += [{"seer-talk": ["seer-talk-here"]}, {"seer-quick": ["seer-talk-here"]}, {"seer-hear": ["seer-hear-here"]}]
    elif c["local"]:
        out += [entry("seer-talk", "openai/" + c["LOCAL_TALK_MODEL"], lb, lk, bridge=True),
                entry("seer-quick", "openai/" + quick_local, lb, lk, bridge=True),
                entry("seer-hear", "openai/whisper-1", c["STT_URL"], lk, mode="audio_transcription")]
    if c["openrouter"]:
        away = entry("seer-talk-away", "openrouter/" + c["OPENROUTER_MODEL"], key="os.environ/OPENROUTER_API_KEY",
                     note="OpenRouter: only when nothing in the house answers (words leave the house)")
        if not t and not c["local"]:
            out += [entry("seer-talk", "openrouter/" + c["OPENROUTER_MODEL"], key="os.environ/OPENROUTER_API_KEY"),
                    entry("seer-quick", "openrouter/" + c["OPENROUTER_MODEL"], key="os.environ/OPENROUTER_API_KEY")]
        else:
            out.append(away)
            fallbacks += [{"seer-talk-here" if t and c["local"] else "seer-talk": ["seer-talk-away"]}]
            if not t:
                fallbacks.append({"seer-quick": ["seer-talk-away"]})
    harness = ""
    if c["HARNESS_CONFIG"] and os.path.exists(os.path.expanduser(c["HARNESS_CONFIG"])):
        # DAEMONS' AI-play harness models (ai/litellm/config.yaml), carried whole: its model_list entries only
        text = open(os.path.expanduser(c["HARNESS_CONFIG"])).read()
        body = text.split("model_list:", 1)[1].split("\nlitellm_settings:", 1)[0]
        # its entries one by one, leaving out any name written above (a hand-made config adopted whole has the Tiiny's)
        mine = set(re.findall(r"model_name: (\S+)", "".join(out)))
        blocks = re.split(r"(?m)^(?=  - model_name: )", body)
        kept = [b for b in blocks if not (re.match(r"  - model_name: (\S+)", b) and re.match(r"  - model_name: (\S+)", b).group(1) in mine)]
        harness = "\n  # ---- the harness's own models (%s) ----\n%s" % (c["HARNESS_CONFIG"], "".join(kept).rstrip() + "\n")
    head = ("# Written by seer/make.py from seer/.seer -- edit those, never this (it is written again).\n"
            "# Keys are named by environment: LITELLM_MASTER_KEY, TIINY_API_KEY, OPENROUTER_API_KEY.\n\nmodel_list:\n")
    tail = ("\nlitellm_settings:\n  drop_params: true\n  request_timeout: 600\n" +
            ("  fallbacks: %s\n" % json.dumps(fallbacks) if fallbacks else "") +
            "\ngeneral_settings:\n  master_key: os.environ/LITELLM_MASTER_KEY\n")
    return head + "".join(out) + harness + tail


def n8n_env(c, secrets):
    lite = "http://host.docker.internal:%s" % c["LITELLM_PORT"]   # n8n runs in docker; LiteLLM on the machine itself
    has_talk = c["tiiny"] or c["local"] or c["openrouter"]
    env = {
        "DEX_SHARED_SECRET": secrets.get("N8N_SHARED_SECRET", ""),
        "DAEMONS_LLM_URL": lite if has_talk else "", "DAEMONS_LLM_MODEL": "seer-talk", "DAEMONS_LLM_KEY": secrets.get("LITELLM_MASTER_KEY", ""),
        "DAEMONS_STT_URL": lite if (c["tiiny"] or c["local"]) else "", "DAEMONS_STT_MODEL": "seer-hear",
        "OPENROUTER_API_KEY": secrets.get("OPENROUTER_API_KEY", ""), "DAEMONS_OPENROUTER_MODEL": c["OPENROUTER_MODEL"],
        "DEXTER_TTS_URL": c["DEXTER_TTS_URL"],
        "GENERIC_TIMEZONE": secrets.get("TZ", "") or "UTC", "N8N_SECURE_COOKIE": "false", "N8N_PORT": "5678",
        "N8N_BLOCK_ENV_ACCESS_IN_NODE": "false",   # the workflows read their settings as $env
        "WEBHOOK_URL": "http://%s:5678/" % c["SEER_HOST"],
    }
    return "# Written by seer/make.py -- n8n's environment (docker compose reads it). Holds keys: never commit it.\n" + \
        "".join("%s=%s\n" % kv for kv in env.items())


def hub_txt(c):
    h, p = c["SEER_HOST"], c["LITELLM_PORT"]
    lines = ["What to give the hub (the app: THE MIND -> the Tiiny; or the hub's settings), for this local cloud:", "",
             "  address      http://%s:%s/v1      (LiteLLM: every model below)" % (h, p),
             "  key          LITELLM_MASTER_KEY from seer/.seer (or a virtual key made from it)"]
    if c["tiiny"] or c["local"] or c["openrouter"]:
        lines += ["  thinker      seer-talk", "  quick        seer-quick"]
    if c["tiiny"] or c["local"]:
        lines.append("  hearing      seer-hear")
    if c["tiiny"]:
        lines += ["  voice        seer-voice", "  stream       http://%s:4001/v1   (the Tiiny's voice, streamed: seer/tiiny-voice)" % h]
    if "sleep" in c["parts"]:
        lines.append("  sleep sounds http://%s:4002        (found by itself from the address above; or the setting sleep.url)" % h)
    if "commons" in c["parts"]:
        lines.append("  THE COMMONS  http://<this machine's tailnet address>:4750   (seer/bindSeer.sh says it)")
    lines += ["  n8n relay    http://%s:5678/webhook/daemon/talk  and  /daemon/hear   (x-dex-secret: N8N_SHARED_SECRET)" % h, ""]
    return "\n".join(lines)


def main():
    c = conf()
    secrets = read(os.environ.get("SEER_CONFIG") or os.path.join(SEER, ".seer"))
    files = {"litellm.yaml": litellm(c), "n8n.env": n8n_env(c, secrets), "hub.txt": hub_txt(c),
             # the keys the services read as their environment (LiteLLM, the Tiiny's voice): mode 600, never committed
             "services.env": "".join("%s=%s\n" % (k, secrets[k]) for k in ("LITELLM_MASTER_KEY", "TIINY_API_KEY", "OPENROUTER_API_KEY")
                                     if secrets.get(k))}
    if "--print" in sys.argv:
        names = re.findall(r"model_name: (\S+)", files["litellm.yaml"])
        print("Tiiny: %s   parts: %s   OpenRouter: %s   host: %s" % ("yes" if c["tiiny"] else "no", ",".join(sorted(c["parts"])) or "none",
                                                                 "yes" if c["openrouter"] else "no", c["SEER_HOST"]))
        print("LiteLLM names: " + " ".join(names))
        if not (c["tiiny"] or c["local"] or c["openrouter"]):
            print("NOTE: nothing here can talk -- no Tiiny, no local models, no OpenRouter key. Add one (run bindSeer.sh again).")
        print(files["hub.txt"])
        return
    os.makedirs(OUT, exist_ok=True)
    for name, text in files.items():
        path = os.path.join(OUT, name)
        with open(path + ".tmp", "w") as f:
            f.write(text)
        os.chmod(path + ".tmp", 0o600)
        os.replace(path + ".tmp", path)
        print("wrote  seer/out/%s" % name)
    subprocess.run([sys.executable, os.path.join(SEER, "n8n", "make_workflows.py"), os.path.join(OUT, "n8n"), "http://%s:5678" % c["SEER_HOST"]], check=True)
    print("wrote  seer/out/n8n/  (daemon/talk and daemon/hear, internal and public relay)")


if __name__ == "__main__":
    main()
