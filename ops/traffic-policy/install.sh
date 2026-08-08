#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d -m 0755 /usr/local/lib/ghostdeploy /etc/ghostdeploy /data/coolify/proxy/dynamic
install -m 0755 "${SOURCE_DIR}/ghostdeploy-traffic-policy-sync.py" /usr/local/lib/ghostdeploy/ghostdeploy-traffic-policy-sync.py
install -m 0644 "${SOURCE_DIR}/ghostdeploy-traffic-policy.service" /etc/systemd/system/ghostdeploy-traffic-policy.service
install -m 0644 "${SOURCE_DIR}/ghostdeploy-traffic-policy.timer" /etc/systemd/system/ghostdeploy-traffic-policy.timer

if [[ ! -f /etc/ghostdeploy/traffic-policy.env ]]; then
	install -m 0600 /dev/null /etc/ghostdeploy/traffic-policy.env
	printf '%s\n' 'GHOSTDEPLOY_POLICY_CONFIG_URL=https://ghostdeploy.com/api/v1/internal/traffic-policy/config' >> /etc/ghostdeploy/traffic-policy.env
	printf '%s\n' 'INTERNAL_JOB_SECRET=' >> /etc/ghostdeploy/traffic-policy.env
fi
chmod 0600 /etc/ghostdeploy/traffic-policy.env
systemctl daemon-reload

if grep -Eq '^INTERNAL_JOB_SECRET=.+$' /etc/ghostdeploy/traffic-policy.env; then
	systemctl enable --now ghostdeploy-traffic-policy.timer
	printf '%s\n' 'Ghost Deploy traffic-policy timer installed and enabled.'
else
	printf '%s\n' 'Installed but not enabled. Add INTERNAL_JOB_SECRET to /etc/ghostdeploy/traffic-policy.env, then enable the timer.'
fi
