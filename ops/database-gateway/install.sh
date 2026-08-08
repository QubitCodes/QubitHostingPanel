#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
	echo 'Run this installer as root.' >&2
	exit 1
fi

install -d -m 0755 /usr/local/lib/ghostdeploy /etc/ghostdeploy /var/lib/ghostdeploy
apt-get update
apt-get install -y --no-install-recommends socat iptables
install -m 0755 ./ghostdeploy-database-gateway-sync.py /usr/local/lib/ghostdeploy/ghostdeploy-database-gateway-sync.py
install -m 0644 ./ghostdeploy-database-gateway.service /etc/systemd/system/ghostdeploy-database-gateway.service
install -m 0644 ./ghostdeploy-database-gateway.timer /etc/systemd/system/ghostdeploy-database-gateway.timer
if [ ! -f /etc/ghostdeploy/database-gateway.env ]; then
	install -m 0600 ./database-gateway.env.example /etc/ghostdeploy/database-gateway.env
fi
systemctl daemon-reload
echo 'Edit /etc/ghostdeploy/database-gateway.env, run the service once, then enable the timer.'
