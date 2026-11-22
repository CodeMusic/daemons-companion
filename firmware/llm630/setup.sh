#!/bin/bash
# C-453 (docs/ZEROKIT.md): the LLM630 Compute Kit made the Zero's other half. Run ON the Kit, as root (from a computer:
# `./install.sh` beside this pushes it over ADB or SSH and runs it). Safe to run again; each step says what it did.
#
#   bash setup.sh                 update StackFlow and install the talk set (below); the gadget, kitd, the limits
#   bash setup.sh models          list every model M5Stack's repository offers, and which are installed
#   bash setup.sh add NAME...     install more models (llm-model-NAME)
#
# The talk set (C-461): the thinker qwen2.5-0.5B-p256-ax630c (256 tokens held, 10 a second), qwen3-0.6B-ax630c beside
# it to compare, whisper-base and whisper-tiny to hear, sense-voice-small to hear in one pass, melotts-en-us to speak,
# and llm-openai-api on port 8000 for the hub's mind (C-466). Vision (yolo, vlm, camera) is the next sprint (C-463).
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo "run as root on the Kit"; exit 1; }

REPO="https://repo.llm.m5stack.com/m5stack-apt-repo"
LIST=/etc/apt/sources.list.d/StackFlow.list
KEY=/etc/apt/keyrings/StackFlow.gpg
UNITS="lib-llm llm-sys llm-llm llm-whisper llm-asr llm-melotts llm-audio llm-openai-api"
MODELS="llm-model-qwen2.5-0.5B-p256-ax630c llm-model-qwen3-0.6B-ax630c llm-model-whisper-base llm-model-whisper-tiny
        llm-model-sense-voice-small-10s llm-model-melotts-en-us"

say() { printf '\n== %s\n' "$*"; }

repo() {
  mkdir -p /etc/apt/keyrings
  [ -s $KEY ] || wget -qO $KEY "$REPO/key/StackFlow.gpg"
  [ -s $LIST ] || echo "deb [arch=arm64 signed-by=$KEY] $REPO jammy ax630c" > $LIST
  apt-get update -o Acquire::Retries=3 | tail -n 3
}

case "${1:-}" in
  models)
    repo >/dev/null
    printf '%-58s %-10s %s\n' MODEL OFFERED INSTALLED
    apt-cache search --names-only '^llm-model-' | awk '{print $1}' | sort | while read -r p; do
      have=$(dpkg-query -W -f='${Version}' "$p" 2>/dev/null || true)
      printf '%-58s %-10s %s\n' "${p#llm-model-}" "$(apt-cache policy "$p" | awk '/Candidate/{print $2}')" "${have:--}"
    done
    exit 0 ;;
  add)
    shift
    repo
    for m in "$@"; do apt-get install -y "llm-model-${m#llm-model-}"; done
    systemctl restart llm-openai-api 2>/dev/null || true   # it lists models only as it starts
    exit 0 ;;
esac

say "the clock (apt refuses lists from the future or the past)"
date

say "M5Stack's StackFlow repository"
repo

say "StackFlow's units, brought up to date"
apt-get install -y $UNITS
apt-get install -y --only-upgrade $(dpkg-query -W -f='${Package}\n' 'llm-*' 'lib-llm' 2>/dev/null | tr '\n' ' ') || true

say "the talk set's models"
apt-get install -y $MODELS

say "llm-llm leaks file handles a setup: its limit raised, and the units restarted at 04:00 (as the hub's module)"
mkdir -p /etc/systemd/system/llm-llm.service.d
printf '[Service]\nLimitNOFILE=65536\n' > /etc/systemd/system/llm-llm.service.d/nofile.conf
cat > /etc/systemd/system/llm-nightly.service <<'EOF'
[Unit]
Description=StackFlow's units restarted together (llm-llm leaks; C-453)
[Service]
Type=oneshot
ExecStart=/bin/systemctl restart llm-sys llm-llm llm-melotts llm-whisper llm-asr llm-openai-api
EOF
cat > /etc/systemd/system/llm-nightly.timer <<'EOF'
[Unit]
Description=StackFlow's units restarted at 04:00
[Timer]
OnCalendar=*-*-* 04:00:00
[Install]
WantedBy=timers.target
EOF

say "the cable's network (USB gadget) and kitd"
mkdir -p /opt/daemons-kit /etc/daemons-kit
install -m 755 gadget.sh /opt/daemons-kit/gadget.sh
install -m 755 kitd.py /opt/daemons-kit/kitd.py
[ -s /etc/daemons-kit/hotspot.key ] || { head -c 64 /dev/urandom | tr -dc 'a-km-z2-9' | head -c 12 > /etc/daemons-kit/hotspot.key; echo >> /etc/daemons-kit/hotspot.key; }
chmod 600 /etc/daemons-kit/hotspot.key
[ -s /etc/daemons-kit/hotspot.ssid ] || echo "DAEMONS-KIT" > /etc/daemons-kit/hotspot.ssid
cat > /etc/systemd/system/daemons-kit-gadget.service <<'EOF'
[Unit]
Description=The Kit's OTG port as a network to the Zero (C-458)
After=local-fs.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStartPre=/bin/sleep 3
ExecStart=/opt/daemons-kit/gadget.sh
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/daemons-kitd.service <<'EOF'
[Unit]
Description=kitd: the Kit's cell, heat and hotspot for the Zero (C-453)
After=daemons-kit-gadget.service network.target
[Service]
ExecStart=/usr/bin/python3 /opt/daemons-kit/kitd.py
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now llm-nightly.timer daemons-kit-gadget.service daemons-kitd.service
systemctl restart llm-sys llm-llm llm-melotts llm-whisper llm-asr llm-openai-api || true

say "what is installed"
dpkg-query -W -f='${Package} ${Version}\n' 'lib-llm' 'llm-*' 2>/dev/null | sort
df -h / | tail -n 1
echo
echo "done. The hotspot's key is in /etc/daemons-kit/hotspot.key (the Zero's KIT page shows it while the hotspot is on)."
