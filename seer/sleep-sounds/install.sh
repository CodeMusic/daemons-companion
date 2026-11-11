#!/usr/bin/env bash
# Sleep sounds (companion C-334): the keyed door to ACE-Step, :4002. ACE-Step itself is seer/acestep/install.sh.
set -euo pipefail
SEER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; . "$SEER/lib/service.sh"
command -v ffmpeg >/dev/null || { echo "   sleep sounds need ffmpeg (brew install ffmpeg / apt install ffmpeg)" >&2; exit 1; }
seer_service sleepsounds "" /usr/bin/env python3 "$SEER/sleep-sounds/sleep_sounds.py"
seer_wait http://127.0.0.1:4002/health 20 && echo "   sleep sounds: up on :4002" || { echo "   sleep sounds: not answering"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:4002/v1/sleep/make -d '{}')
[ "$code" = 401 ] && echo "   sleep sounds: refuses a request with no key" || { echo "   sleep sounds: answered $code with no key"; exit 1; }
