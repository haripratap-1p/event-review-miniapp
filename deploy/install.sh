#!/usr/bin/env bash
# Installs and enables the event review system units on thor01 (run with sudo); starting is a separate step.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
env_file=/etc/event-review.env
units=(event-review-tunnel.service event-review-api.service)

if [[ ! -f "$env_file" ]]; then
  echo "missing $env_file (see deploy/review.env.example)" >&2
  exit 1
fi
if [[ "$(stat -c %a "$env_file")" != "600" ]]; then
  echo "$env_file must be chmod 600" >&2
  exit 1
fi

install -d -o thor01 -g thor01 /home/thor01/event_review
for unit in "${units[@]}"; do
  install -m 644 "$here/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload
systemctl enable "${units[@]}"
echo "installed and enabled: ${units[*]}"
echo "start: sudo systemctl start ${units[*]}"
