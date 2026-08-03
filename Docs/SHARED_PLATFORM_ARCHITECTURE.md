# Shared Application Platform

## Product model

Qubit Hosting combines shared-hosting economics with isolated, Vercel-style application deployments.

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
- Active, deprecated, or disabled lifecycle state.
- Default selection per product policy.

Initial target images are maintained in GitHub Container Registry under `ghcr.io/qubitcodes/runtimes`. Customer builds should pin an approved digest when reproducibility is required. Runtime removal is a staged lifecycle: stop new selections, mark deprecated, notify affected workspaces, rebuild or migrate applications, then disable.

`application_builds` records source repository/ref, commit, selected runtime, build status, generated image reference, provider build identifier, and failure state. GitHub Actions should build and publish customer images so the Coolify host spends its capacity running workloads rather than compiling them.

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

## Credential and network rules

- Cluster administrator credentials are encrypted with `CREDENTIAL_ENCRYPTION_KEY` and never returned to customers.
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

1. Apply migration `0020` and verify the new schema.
2. Build and publish signed/versioned Qubit runtime images through GitHub Actions.
3. Add admin runtime-catalogue and database-cluster management.
4. Provision one shared PostgreSQL and one shared MySQL staging service.
5. Implement encrypted cluster registration and engine-specific logical database provisioners.
6. Add customer application/runtime selection and database management UI/API.
7. Add quotas, backups, credential rotation, audit logs, and reconciliation.
8. Verify cross-workspace isolation and duplicate-request idempotency before production.
