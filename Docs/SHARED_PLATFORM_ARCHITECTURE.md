# Shared Application Platform

## Product model

Ghost Deploy combines shared-hosting economics with isolated, Vercel-style application deployments.

```text
Coolify server
  Shared Traefik proxy
  Shared PostgreSQL cluster
    Workspace database + restricted login
    Workspace database + restricted login
  Shared MySQL cluster
    Workspace database + restricted login
  Shared immutable runtime images
    PHP versions
    Node.js versions
    Python versions
    Static/nginx runtime
  Isolated customer application containers
    Workspace application
    Workspace application
```

Applications remain isolated containers. Customers sharing a runtime version reuse immutable Docker image layers; they do not share a writable runtime installation, dependency directory, process, or filesystem. This provides independent deploys, health checks, rollbacks, and resource limits without duplicating base image layers on disk.

## Runtime catalogue

`runtime_images` is the panel-owned catalogue of approved base images. A catalogue entry records:

- Stable code presented to APIs and UI.
- Language and supported version.
- Registry, repository, tag, and optional immutable digest.
- Default internal HTTP port used by Coolify exposure and health checks.
- Active, deprecated, or disabled lifecycle state.
- Default selection per product policy.

Initial target images are maintained in GitHub Container Registry as `ghcr.io/qubitcodes/runtime-{node,php,python,static}`. The approved versions are Node.js 22.23.1 and 24.18.0, PHP 8.3.32 and 8.5.8, Python 3.12.13 and 3.13.14, and nginx 1.30.4. Node.js 22.23.1 replaces the requested 22.23.2 because the latter is not an upstream release.

The runtime workflow builds `linux/amd64` images for the current EC2 architecture, performs version smoke checks and fixable-critical vulnerability scanning, and publishes exact, channel, and source-revision tags only from `main` or manual dispatch. GitHub Actions dependencies are pinned to immutable commits. Published artifacts include provenance and an SBOM. Customer deployments should pin an approved digest when reproducibility is required. Runtime removal is a staged lifecycle: stop new selections, mark deprecated, notify affected workspaces, rebuild or migrate applications, then disable.

`application_builds` records source repository/ref, commit, selected runtime, build status, generated image reference, provider build identifier, and failure state. GitHub Actions should build and publish customer images so the Coolify host spends its capacity running workloads rather than compiling them.

Customers configure public Git or workspace-owned GitHub App sources under `/dashboard/applications`. Approved repository manifests drive suggestions for stack, version, framework, project/output directories and environment-template keys; users review every suggestion. The panel validates the repository, branch, build method, commands, directories, runtime and port; encrypts application variables at rest; enforces workspace entitlements; rejects domain conflicts; persists database bindings without copying plaintext credentials; and queues an idempotent deployment. Private repositories use short-lived GitHub installation tokens for inspection. Each GitHub installation is idempotently synchronized to its own Coolify Source UUID using the shared platform App credentials and private-key record; failed provider synchronization remains retryable and blocks private deployment without weakening repository isolation. Dockerfile deployment remains disabled until package-scoped isolation policy is available.

## Application isolation

- One deployable customer application is one Coolify application/container.
- Docker Compose is reserved for an explicitly supported multi-container customer stack.
- The shared proxy routes public domains to healthy containers.
- Each container receives package-specific CPU, memory, process, and storage limits.
- Customer code cannot mutate shared runtime images or another workspace filesystem.
- S3 owns supported object/file storage; SES owns outbound email delivery.

## Shared database clusters

`database_clusters` represents one long-running PostgreSQL or MySQL engine managed as a shared platform service. Coolify owns the engine container and persistent volume; the panel owns tenant allocation and credentials.

`logical_databases` represents a workspace database inside a cluster. Creation must:

1. Authorize the workspace actor and enforce the subscription database entitlement.
2. Select an active cluster with capacity for the requested engine.
3. Generate collision-resistant database and username identifiers.
4. Create the database and a login restricted to that database only.
5. Apply connection and storage policies supported by the engine/platform.
6. Encrypt the generated credential before persistence.
7. Create/link the customer-visible `workspace_resources` record.
8. Write an audit record without plaintext credentials.

The Coolify hosting provider does not create a new database container for this operation. A dedicated `SharedDatabaseProvisioner` executes engine-specific SQL against an existing registered cluster.

Customer database management is available under `/dashboard/databases`. Creation checks the workspace subscription snapshot for `databases.count`, chooses the least-used active cluster with remaining capacity, creates a collision-resistant database/login pair, and returns its credential only after encrypted persistence. Reveal and rotation are workspace-authorized, audited actions. PostgreSQL roles own only their logical database; MySQL users receive privileges only on their logical database namespace.

Each logical database also exposes workspace-scoped recovery points. PostgreSQL custom-format and MySQL SQL dumps are produced with native clients, encrypted with authenticated AES-256-GCM before durable storage, checksummed, and retained according to the workspace entitlement snapshot. Downloads are decrypted only after authorization and audit logging. Restore requires the exact database name, verifies the artifact checksum and authentication tag, overwrites only the selected logical database, and records success or failure evidence.

Administrators manage cluster infrastructure at `/admin/operations/database-clusters`. Creating a cluster provisions an exact-version private Coolify database, generates the administrator password inside the panel, encrypts it before persistence, and records only non-sensitive provider metadata in API responses and audit logs. Detail URLs expose health reconciliation, capacity/lifecycle settings, and backup policy configuration without exposing cluster credentials.

## Credential and network rules

- Cluster administrator credentials are encrypted with `CREDENTIAL_ENCRYPTION_KEY` and never returned to customers.
- Each cluster retains its private Coolify hostname and may separately define a management host, port, and TLS mode for local staging administration.
- `DATABASE_CLUSTER_CONNECTION_MODE=internal` is the production default. Local development may use `management` only with an IP-restricted endpoint.
- A management endpoint is an operator connection path, not customer-level public database isolation. Customer remote access requires a later per-database gateway and allowlist workflow.
- Workspace credentials are unique per logical database and encrypted at rest.
- Plaintext passwords may exist only during creation, controlled reveal/rotation, and connection delivery.
- Database ports remain private by default.
- Application containers connect through an explicitly approved internal Docker network.
- Future external database access requires TLS, IP allowlisting, rate limits, and separate audit controls.
- No customer receives cluster-level role creation, replication, extension-management, filesystem, or superuser privileges.

## Backups and recovery

Shared-volume snapshots protect the cluster but are not sufficient for customer-level recovery. Operations must also create encrypted per-logical-database dumps in S3 with workspace ownership, retention, checksum, and restore-test metadata. A customer restore must target only their database and must not rewind another tenant.

## Capacity and noisy-neighbour controls

- Maximum logical databases per cluster.
- Per-database connection limits.
- Storage quota observations and alerts.
- Slow-query and connection saturation monitoring.
- Cluster maintenance and unavailable states block new allocations.
- Placement policy supports adding clusters without changing customer APIs.
- High-load tenants can later migrate to dedicated clusters or AWS RDS.

## Delivery sequence

1. Apply migration `0021` and seed the approved runtime catalogue.
2. Publish the first signed/versioned Ghost Deploy runtime images through GitHub Actions and record their verified digests.
3. Add admin runtime-catalogue and database-cluster management. Both management surfaces are complete.
4. Provision one shared PostgreSQL 18.4 and one shared MySQL 8.0.46 staging service after migration `0022` is applied and the deployed Coolify token has read/write scope.
5. Implement encrypted cluster registration and engine-specific logical database provisioners.
6. Add customer application/runtime selection and database management UI/API.
7. Add quotas, backups, credential rotation, audit logs, and reconciliation.
8. Verify cross-workspace isolation and duplicate-request idempotency before production.
