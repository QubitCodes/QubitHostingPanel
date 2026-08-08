#!/usr/bin/env python3
"""Reconciles customer database gateway listeners and their host INPUT allowlist."""

import ipaddress
import json
import os
import pathlib
import subprocess
import tempfile
import urllib.request

ENV_FILE = pathlib.Path('/etc/ghostdeploy/database-gateway.env')
STATE_FILE = pathlib.Path('/var/lib/ghostdeploy/database-gateway-state.json')
UNIT_ROOT = pathlib.Path('/etc/systemd/system')
UNIT_PREFIX = 'ghostdeploy-db-gateway-'
CHAIN = 'GHOSTDEPLOY_DB_ACCESS'


def command(arguments: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
	return subprocess.run(arguments, check=check, text=True, capture_output=True)


def environment() -> dict[str, str]:
	values: dict[str, str] = {}
	for line in ENV_FILE.read_text(encoding='utf-8').splitlines():
		line = line.strip()
		if not line or line.startswith('#') or '=' not in line:
			continue
		key, value = line.split('=', 1)
		values[key.strip()] = value.strip()
	return values


def request_config(values: dict[str, str]) -> dict:
	url = values['PANEL_URL'].rstrip('/') + '/api/v1/internal/database-gateway/config'
	request = urllib.request.Request(url, headers={'x-internal-job-secret': values['INTERNAL_JOB_SECRET']})
	with urllib.request.urlopen(request, timeout=30) as response:
		body = json.load(response)
	if not body.get('status') or not isinstance(body.get('data'), dict):
		raise RuntimeError('Panel returned an invalid database gateway response.')
	return body['data']


def acknowledge(values: dict[str, str], results: list[dict]) -> None:
	url = values['PANEL_URL'].rstrip('/') + '/api/v1/internal/database-gateway/config'
	payload = json.dumps({'results': results}).encode('utf-8')
	request = urllib.request.Request(url, data=payload, method='POST', headers={'content-type': 'application/json', 'x-internal-job-secret': values['INTERNAL_JOB_SECRET']})
	with urllib.request.urlopen(request, timeout=30) as response:
		body = json.load(response)
	if not body.get('status'):
		raise RuntimeError('Panel rejected the database gateway acknowledgement.')


def container_ipv4(container: str) -> str:
	result = command(['docker', 'inspect', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}', container])
	addresses = [value for value in result.stdout.split() if value]
	if not addresses:
		raise RuntimeError('Database container has no reachable Docker IPv4 address.')
	return addresses[0]


def unit_content(rule_id: str, port: int, target_ip: str, target_port: int, ipv6: bool) -> str:
	listener = f'TCP6-LISTEN:{port},bind=[::],fork,reuseaddr,ipv6only=1' if ipv6 else f'TCP4-LISTEN:{port},bind=0.0.0.0,fork,reuseaddr'
	return '\n'.join([
		'[Unit]',
		f'Description=Ghost Deploy database gateway {rule_id} ({"IPv6" if ipv6 else "IPv4"})',
		'After=docker.service network-online.target',
		'Requires=docker.service',
		'',
		'[Service]',
		'Type=simple',
		f'ExecStart=/usr/bin/socat {listener} TCP4:{target_ip}:{target_port}',
		'Restart=always',
		'RestartSec=3',
		'NoNewPrivileges=true',
		'PrivateTmp=true',
		'ProtectHome=true',
		'ProtectSystem=strict',
		'',
		'[Install]',
		'WantedBy=multi-user.target',
		'',
	])


def reconcile_units(targets: list[dict]) -> list[dict]:
	desired: set[str] = set()
	results: list[dict] = []
	for target in targets:
		rule_id = str(target['ruleId'])
		short = rule_id.replace('-', '')[:16]
		try:
			target_ip = container_ipv4(str(target['providerDatabaseUuid']))
			families = {ipaddress.ip_network(value, strict=False).version for value in target['allowedCidrs']}
			for family, ipv6 in ([('v4', False)] if 4 in families else []) + ([('v6', True)] if 6 in families else []):
				name = f'{UNIT_PREFIX}{short}-{family}.service'
				desired.add(name)
				path = UNIT_ROOT / name
				content = unit_content(rule_id, int(target['gatewayPort']), target_ip, int(target['targetPort']), ipv6)
				if not path.exists() or path.read_text(encoding='utf-8') != content:
					path.write_text(content, encoding='utf-8')
					command(['systemctl', 'daemon-reload'])
					command(['systemctl', 'enable', '--now', name])
					command(['systemctl', 'restart', name])
				elif command(['systemctl', 'is-active', '--quiet', name], check=False).returncode != 0:
					command(['systemctl', 'start', name])
			results.append({'ruleId': rule_id, 'revision': target['revision'], 'success': True})
		except Exception as error:  # noqa: BLE001 - per-rule failure must be acknowledged without aborting other rules.
			results.append({'ruleId': rule_id, 'revision': target.get('revision', ''), 'success': False, 'failureReason': str(error)[:1000]})
	for path in UNIT_ROOT.glob(f'{UNIT_PREFIX}*.service'):
		if path.name in desired:
			continue
		command(['systemctl', 'disable', '--now', path.name], check=False)
		path.unlink(missing_ok=True)
	command(['systemctl', 'daemon-reload'])
	return results


def reconcile_firewall(targets: list[dict], binary: str, version: int) -> None:
	command([binary, '-w', '-N', CHAIN], check=False)
	if command([binary, '-w', '-C', 'INPUT', '-j', CHAIN], check=False).returncode != 0:
		command([binary, '-w', '-I', 'INPUT', '1', '-j', CHAIN])
	command([binary, '-w', '-F', CHAIN])
	for target in targets:
		port = str(int(target['gatewayPort']))
		for value in target['allowedCidrs']:
			network = ipaddress.ip_network(value, strict=False)
			if network.version == version:
				command([binary, '-w', '-A', CHAIN, '-p', 'tcp', '--dport', port, '-s', str(network), '-j', 'ACCEPT'])
		command([binary, '-w', '-A', CHAIN, '-p', 'tcp', '--dport', port, '-j', 'REJECT'])
	command([binary, '-w', '-A', CHAIN, '-j', 'RETURN'])


def save_state(config: dict) -> None:
	STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
	with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=STATE_FILE.parent, delete=False) as handle:
		json.dump({'revision': config.get('revision'), 'targetCount': len(config.get('targets', []))}, handle)
		temporary = pathlib.Path(handle.name)
	os.chmod(temporary, 0o600)
	temporary.replace(STATE_FILE)


def main() -> None:
	values = environment()
	config = request_config(values)
	targets = config.get('targets', []) if config.get('enabled') else []
	results = reconcile_units(targets)
	reconcile_firewall(targets, 'iptables', 4)
	if command(['sh', '-c', 'command -v ip6tables'], check=False).returncode == 0:
		reconcile_firewall(targets, 'ip6tables', 6)
	acknowledge(values, results)
	save_state(config)
	print(json.dumps({'revision': config.get('revision'), 'targetCount': len(targets), 'successCount': sum(1 for item in results if item['success'])}))


if __name__ == '__main__':
	main()
