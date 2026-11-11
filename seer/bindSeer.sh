#!/usr/bin/env bash
# The local cloud, set up on the machine it runs on (a Mac, or Linux): the always-on computer beside the hub that holds
# the house's AI -- LiteLLM (every model behind four names), n8n and the companion's workflows, and the parts you choose.
# Run it ON that machine, from a clone of daemons-companion:
#
#   seer/bindSeer.sh              asks (a Tiiny or not, which parts, keys), writes seer/.seer, installs, says what the
#                                 hub needs. Asked again later, it offers what you answered last time.
#   seer/bindSeer.sh --plan       says what it would do, installs nothing
#   seer/bindSeer.sh --yes        no questions: seer/.seer as it is
#   seer/bindSeer.sh --adopt      a machine set up by hand before this (roverbyteseer): its keys, Tiiny and running
#                                 parts taken into seer/.seer first (seer/adopt.py), so the hub's key keeps working
#   seer/bindSeer.sh PART         (re)installs one part: litellm tiiny-voice local acestep sleep-sounds comfyui commons n8n
#
# Everything it keeps is in seer/.seer (your answers and keys, mode 600) and seer/out/ (written from it by seer/make.py);
# neither is ever committed. Change an answer: run it again, or edit seer/.seer and run `seer/bindSeer.sh --yes`.
set -euo pipefail
SEER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$SEER/lib/service.sh"
CONF="$SEER/.seer"
PLAN=no; YES=no; ONLY=""; ADOPT=no
for a in "$@"; do case "$a" in --plan) PLAN=yes ;; --yes) YES=yes ;; --adopt) ADOPT=yes; YES=yes ;; -h|--help) sed -n 2,16p "$0"; exit 0 ;; *) ONLY="$a" ;; esac; done

get() { [ -f "$CONF" ] && sed -n "s/^$1=//p" "$CONF" | tail -1 | sed "s/^[\"']//; s/[\"']\$//" || true; }
put() {   # KEY VALUE -- set one line of seer/.seer, keeping the rest (written aside, then moved over it)
  local tmp="$CONF.tmp"; umask 077; { [ -f "$CONF" ] && grep -v "^$1=" "$CONF" || true; printf '%s=%s\n' "$1" "$2"; } > "$tmp"; mv "$tmp" "$CONF"; umask 022
}
ask() {   # QUESTION DEFAULT -> the answer (Enter takes the default)
  local q="$1" d="$2" r; read -r -p "$q [$d] " r; echo "${r:-$d}"
}
yn() { case "$(ask "$1" "$2")" in [yY]*) echo yes ;; *) echo no ;; esac; }
secret() { local r; read -r -s -p "$1 " r; echo >&2; echo "$r"; }
newkey() { python3 -c 'import secrets;print("sk-seer-"+secrets.token_urlsafe(24))'; }

# ---- a machine set up by hand: what it already has, first ----
[ "$ADOPT" = yes ] && { seer_say "Taking in what this machine already has"; SEER_CONFIG="$CONF" python3 "$SEER/adopt.py"; }

# ---- the questions ----
if [ -z "$ONLY" ] && [ "$YES" = no ] && [ -t 0 ]; then
  seer_say "The local cloud: a few questions (Enter keeps what is in brackets)"
  T=$(yn "Is a Tiiny plugged into THIS machine (by USB-C or on its network)?" "$( [ "$(get SEER_TIINY)" = yes ] && echo y || echo n)")
  put SEER_TIINY "$T"
  if [ "$T" = yes ]; then
    echo "   The Tiiny's address and key: TiinyOS > 'tiiny auth key' prints them (http://<its address>/openai/v1)."
    put TIINY_URL "$(ask "   its address" "$(get TIINY_URL || true)")"
    [ -n "$(get TIINY_API_KEY)" ] && [ "$(yn "   keep the Tiiny key you gave before?" y)" = yes ] || put TIINY_API_KEY "$(secret "   its key (hidden; Enter if it has none):")"
  else
    echo "   Without a Tiiny: this machine's own models answer first, then OpenRouter if you give it a key."
  fi
  have() { case ",$(get SEER_PARTS)," in *",$1,"*) echo y ;; *) echo n ;; esac; }
  P=""
  [ "$(yn "Sleep sounds, made by ACE-Step here (downloads ~19 GB the first time)?" "$(have sleep)")" = yes ] && P="$P,sleep"
  [ "$(yn "Local models on this machine (a chat model and Whisper for hearing)?" "$( [ "$T" = no ] && echo y || have local)")" = yes ] && P="$P,local"
  [ "$(yn "THE COMMONS (households trading and meeting, over Tailscale)?" "$(have commons)")" = yes ] && P="$P,commons"
  [ "$(yn "ComfyUI, for the DAEMONS art tools?" "$(have comfyui)")" = yes ] && P="$P,comfyui"
  put SEER_PARTS "${P#,}"
  if [ -n "$(get OPENROUTER_API_KEY)" ]; then
    [ "$(yn "Keep the OpenRouter key you gave before (used only when nothing in the house answers)?" y)" = yes ] || put OPENROUTER_API_KEY "$(secret "OpenRouter key (hidden; Enter for none):")"
  else
    put OPENROUTER_API_KEY "$(secret "OpenRouter key, used only when nothing in the house answers (hidden; Enter for none):")"
  fi
  H=$(dirname "$SEER")/../DAEMONS/ai/litellm/config.yaml
  if [ -f "$H" ] && [ -z "$(get HARNESS_CONFIG)" ]; then
    [ "$(yn "DAEMONS is beside this clone: include its AI-play harness models in LiteLLM?" y)" = yes ] && put HARNESS_CONFIG "$(cd "$(dirname "$H")" && pwd)/config.yaml"
  fi
fi
[ -f "$CONF" ] || { echo "No seer/.seer yet: run seer/bindSeer.sh in a terminal to answer its questions." >&2; exit 1; }
[ -n "$(get LITELLM_MASTER_KEY)" ] || put LITELLM_MASTER_KEY "$(newkey)"     # made once, kept
[ -n "$(get N8N_SHARED_SECRET)" ] || put N8N_SHARED_SECRET "$(newkey)"
[ -n "$(get SEER_HOST)" ] || put SEER_HOST "$(SEER_CONFIG="$CONF" python3 -c 'import sys;sys.path.insert(0,"'"$SEER"'");import make;print(make.host())')"
chmod 600 "$CONF"

# ---- what will be installed ----
TIINY=$(get SEER_TIINY); PARTS=",$(get SEER_PARTS),"
has() { case "$PARTS" in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
STEPS="litellm"
[ "$TIINY" = yes ] && STEPS="$STEPS tiiny-voice"
has local && STEPS="$STEPS local"
has sleep && STEPS="$STEPS acestep sleep-sounds"
has comfyui && STEPS="$STEPS comfyui"
has commons && STEPS="$STEPS commons"
STEPS="$STEPS n8n"
[ -n "$ONLY" ] && STEPS="$ONLY"

seer_say "The configuration (seer/make.py)"
SEER_CONFIG="$CONF" python3 "$SEER/make.py" --print
if [ "$PLAN" = yes ]; then seer_say "Would install, in order: $STEPS"; exit 0; fi
SEER_CONFIG="$CONF" python3 "$SEER/make.py"

for s in $STEPS; do
  seer_say "$s"
  case "$s" in
    commons)
      if [ "$(uname)" = Darwin ]; then zsh "$SEER/../hub/commons.sh" install
      else echo "   THE COMMONS' installer is a Mac launch agent today (hub/commons.sh); on Linux run its server by hand"; fi ;;
    litellm|tiiny-voice|local|acestep|sleep-sounds|comfyui|n8n) bash "$SEER/$s/install.sh" ;;
    *) echo "no part called $s (litellm tiiny-voice local acestep sleep-sounds comfyui commons n8n)" >&2; exit 1 ;;
  esac
done

seer_say "Done. Now tell the hub"
cat "$SEER/out/hub.txt"
