#!/usr/bin/env python3
"""Atomically reconciles Ghost Deploy's isolated Traefik dynamic configuration."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

try:
    import fcntl
except ImportError:  # pragma: no cover - the host agent itself is Linux-only.
    fcntl = None


DEFAULT_CONFIG_URL = "https://ghostdeploy.com/api/v1/internal/traffic-policy/config"
DEFAULT_OUTPUT = "/data/coolify/proxy/dynamic/ghostdeploy-policies.json"
DEFAULT_ENV_FILE = "/etc/ghostdeploy/traffic-policy.env"
HOSTNAME = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", re.I)
SERVICE_LABEL = re.compile(r"^traefik\.http\.services\.([A-Za-z0-9_.-]+)\.loadbalancer\.server\.port$")


def read_environment(path: Path) -> dict[str, str]:
    """Reads the dedicated root-owned environment file without shell evaluation."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def request_contract(url: str, secret: str) -> dict:
    """Fetches and validates the response envelope from the panel."""
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "GhostDeploy-TrafficPolicySync/1.0",
            "X-Internal-Job-Secret": secret,
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
    if payload.get("status") is not True or not isinstance(payload.get("data"), dict):
        raise RuntimeError("Panel returned an invalid traffic-policy response.")
    return payload["data"]


def docker_service_map() -> dict[str, str]:
    """Maps provider application UUID prefixes to current Traefik Docker services."""
    listed = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        check=True,
        capture_output=True,
        text=True,
    )
    names = [line.strip() for line in listed.stdout.splitlines() if line.strip()]
    if not names:
        return {}
    inspected = subprocess.run(
        ["docker", "inspect", *names],
        check=True,
        capture_output=True,
        text=True,
    )
    containers = json.loads(inspected.stdout)
    services: dict[str, str] = {}
    for container in containers:
        name = str(container.get("Name", "")).lstrip("/")
        provider_id = name.split("-", 1)[0]
        labels = container.get("Config", {}).get("Labels", {}) or {}
        candidates = []
        for key in labels:
            match = SERVICE_LABEL.match(key)
            if match:
                candidates.append(match.group(1))
        if not candidates:
            continue
        candidates.sort(key=lambda value: (not value.startswith("https-"), value))
        services[provider_id] = candidates[0]
    return services


def safe_name(prefix: str, value: str) -> str:
    """Creates a deterministic Traefik identifier from an untrusted value."""
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:14]
    return f"{prefix}-{digest}"


def build_dynamic_config(contract: dict, services: dict[str, str]) -> tuple[dict, dict[str, int]]:
    """Builds an isolated file-provider config while preserving Coolify's Docker routers."""
    if contract.get("enabled") is not True:
        return {"http": {}}, {"applications": 0, "domains": 0, "skipped": 0}

    policy_endpoint = str(contract.get("policyEndpoint", ""))
    system_base_url = str(contract.get("systemPageBaseUrl", "")).rstrip("/")
    if not policy_endpoint.startswith("https://") or not system_base_url.startswith("https://"):
        raise RuntimeError("Traffic-policy URLs must use HTTPS.")

    middlewares: dict = {
        "ghostdeploy-policy": {
            "forwardAuth": {
                "address": policy_endpoint,
                "trustForwardHeader": True,
            }
        },
        "ghostdeploy-application-errors": {
            "errors": {
                "query": "/system/application-error?status={status}",
                "service": "ghostdeploy-system-pages",
                "status": ["500-599"],
            }
        },
        "ghostdeploy-suspended-fallback": {
            "replacePath": {"path": "/system/suspended-fallback"}
        },
    }
    routers: dict = {}
    dynamic_services: dict = {
        "ghostdeploy-system-pages": {
            "loadBalancer": {
                "passHostHeader": False,
                "servers": [{"url": system_base_url}],
            }
        }
    }
    application_count = 0
    domain_count = 0
    skipped = 0

    for application in contract.get("applications", []):
        provider_id = str(application.get("providerApplicationId", ""))
        operational_status = application.get("operationalStatus")
        docker_service = services.get(provider_id)
        if operational_status != "suspended" and not docker_service:
            skipped += 1
            continue

        application_count += 1
        application_key = safe_name("gd-app", str(application.get("applicationId", provider_id)))
        buffer_name = f"{application_key}-buffer"
        maximum_mb = max(1, min(20480, int(application.get("uploadMaxRequestSizeMb", 100))))
        middlewares[buffer_name] = {
            "buffering": {
                "maxRequestBodyBytes": maximum_mb * 1024 * 1024,
                "memRequestBodyBytes": min(maximum_mb * 1024 * 1024, 2 * 1024 * 1024),
            }
        }

        for domain in sorted(set(application.get("domains", []))):
            hostname = str(domain).strip().lower().rstrip(".")
            if not HOSTNAME.fullmatch(hostname):
                skipped += 1
                continue
            domain_count += 1
            router_name = safe_name("gd-route", hostname)
            host_name = f"{router_name}-host"
            middlewares[host_name] = {
                "headers": {
                    "customRequestHeaders": {
                        "X-GhostDeploy-Application-Host": hostname,
                    }
                }
            }
            chain = [host_name, "ghostdeploy-policy", buffer_name]
            service = f"{docker_service}@docker" if docker_service else "ghostdeploy-system-pages"
            if operational_status == "suspended" and not docker_service:
                chain.append("ghostdeploy-suspended-fallback")
            elif application.get("returnErrors") is False:
                chain.append("ghostdeploy-application-errors")
            routers[router_name] = {
                "entryPoints": ["https"],
                "middlewares": chain,
                "priority": 10000,
                "rule": f"Host(`{hostname}`)",
                "service": service,
                "tls": {"certResolver": "letsencrypt"},
            }

    return {
        "http": {
            "middlewares": middlewares,
            "routers": routers,
            "services": dynamic_services,
        }
    }, {"applications": application_count, "domains": domain_count, "skipped": skipped}


def atomic_write(path: Path, payload: dict) -> bool:
    """Writes a deterministic JSON document atomically and retains one rollback copy."""
    encoded = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
    if path.exists() and path.read_bytes() == encoded:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)
    return True


def main() -> int:
    """Runs one locked reconciliation and leaves the last valid file untouched on failure."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--env-file", default=DEFAULT_ENV_FILE)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    if fcntl is None:
        raise RuntimeError("The traffic-policy host agent requires Linux file locking.")
    environment = read_environment(Path(arguments.env_file))
    secret = environment.get("INTERNAL_JOB_SECRET", "")
    if not secret:
        raise RuntimeError("INTERNAL_JOB_SECRET is required in the dedicated environment file.")
    url = environment.get("GHOSTDEPLOY_POLICY_CONFIG_URL", DEFAULT_CONFIG_URL)

    Path("/run/lock").mkdir(parents=True, exist_ok=True)
    with Path("/run/lock/ghostdeploy-traffic-policy.lock").open("w", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        contract = request_contract(url, secret)
        payload, counts = build_dynamic_config(contract, docker_service_map())
        changed = False if arguments.dry_run else atomic_write(Path(arguments.output), payload)
        print(json.dumps({
            **counts,
            "changed": changed,
            "dryRun": arguments.dry_run,
            "enabled": contract.get("enabled") is True,
            "revision": contract.get("revision"),
        }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BlockingIOError:
        print('{"status":"skipped","reason":"sync_already_running"}')
        raise SystemExit(0)
    except Exception as error:
        print(json.dumps({"status": "failed", "message": str(error)}), file=sys.stderr)
        raise SystemExit(1)
