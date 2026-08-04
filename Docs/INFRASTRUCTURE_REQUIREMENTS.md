# Infrastructure Requirements

## Decision

A public server is not required to begin the MVA. Identity, administration, packages, onboarding, entitlements, API contracts, and a mocked provider can be built and tested locally.

A Linux server is required for genuine Coolify testing: SSH validation, Docker workloads, deployments, proxy routing, DNS, TLS, backups, and usage reconciliation.

## Local development

Required:

- Node.js, npm, Git, and an isolated PostgreSQL database.
- A Supabase development project when shared remote development is needed.
- Firebase development project and phone-auth test configuration.
- MSG91 test credentials when available.
- `MockHostingProvider` fixtures.

Docker Desktop and WSL2/Linux VM are optional. Local Coolify is not required for the first MVA phases.

## Coolify staging server

Use a fresh, dedicated 64-bit Linux VPS/VM with:

- Root SSH key access and Docker Engine 24+.
- Minimum 2 CPU cores, 2 GB RAM, and 30 GB free storage.
- Recommended 4 CPU cores, 8 GB RAM, and 80-100 GB SSD for builds.
- Static public IP.
- Ports 22, 80, and 443.
- Restricted temporary port 8000 access for initial registration.
- Staging control-plane and wildcard application domains.
- External backup destination.

Do not install Coolify on the existing aaPanel production server. Both systems manage ports, proxies, services, and resources; co-location creates conflict and outage risk.

## Coolify API

- Enable API access explicitly.
- Use separate team-scoped tokens per environment.
- Begin with `read`; add `deploy` and narrowly required `write` permissions later.
- Avoid `root` for routine operations.
- Encrypt tokens at rest and never expose them to browsers.
- Apply IP allowlisting when stable egress exists.
- Support token rotation, expiry, revocation, and health checks.

## Suggested domains

```text
qubit.codes                 Public website
panel.qubit.codes           Production panel
panel.apps-staging.qubit.codes Staging panel
coolify.qubit.codes         Production Coolify
coolify-staging.qubit.codes Staging Coolify
*.apps-staging.qubit.codes  Staging workloads
```

## Production prerequisites

- Dedicated Coolify control plane and adequate workload capacity.
- Production Supabase project or approved self-hosted PostgreSQL.
- Automated encrypted off-site backups with tested recovery.
- Monitoring, alerting, and log retention.
- Production payment account and verified webhooks.
- Firebase production configuration.
- MSG91 approved WhatsApp templates and credentials.
- Secret management and rotation process.
- Usage, cleanup, quota, and reconciliation jobs.
- Incident, maintenance, and rollback playbooks.

## Shared platform services

- One shared Traefik proxy per Coolify server.
- Approved PHP, Node.js, Python, and static base images published to GHCR and reused by isolated application containers.
- GitHub Actions build capacity so customer image builds do not exhaust the workload host.
- Shared PostgreSQL and MySQL services with private networking and persistent volumes.
- Encrypted per-database S3 backups in addition to cluster/volume backups.
- Connection, storage, CPU, memory, and process limits with noisy-neighbour monitoring.
- A migration path to dedicated database clusters or RDS for high-load tenants.
