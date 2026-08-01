# Database and Portability Strategy

## 1. Initial decision

Use Supabase-managed PostgreSQL initially. The panel accesses it through Drizzle ORM and a server-side PostgreSQL connection. Supabase is a managed database provider, not the application architecture.

## 2. Portability rules

- All schema changes are versioned Drizzle migrations.
- Commit generated raw SQL.
- Do not make untracked production schema changes in Supabase Studio.
- Keep core business logic in controllers/services, not Supabase Edge Functions.
- Avoid direct browser access to commercial and administrative tables.
- Do not require Supabase-specific SDKs in domain services.
- Review PostgreSQL extensions before adoption.
- Use `DATABASE_URL` and environment-specific configuration.
- Maintain separate local, staging, and production databases.

## 3. Authentication boundary

Firebase supplies external identity verification. The application owns users, access relationships, sessions, contexts, roles, permissions, and audit state in PostgreSQL. This avoids coupling panel authorization to Supabase Auth.

## 4. Storage boundary

Use S3-compatible object storage for durable files, backups, and customer objects unless a specific reviewed requirement justifies Supabase Storage. Database backups do not include storage objects.

## 5. Backup requirements

- Schedule logical exports using Supabase CLI `db dump` or a compatible reviewed process.
- Store exports outside the Supabase project.
- Encrypt backups and restrict access.
- Define retention for development, staging, and production.
- Test restores regularly.
- Record backup and restore evidence.

## 6. Future migration to self-hosted PostgreSQL

1. Inventory PostgreSQL version, extensions, roles, schemas, row counts, and dependencies.
2. Provision and secure the target PostgreSQL server.
3. Match compatible extensions and settings.
4. Perform a rehearsal restore from a recent logical export.
5. Validate migrations, schema metadata, constraints, and representative application flows.
6. Schedule a maintenance/read-only window.
7. Take a final source export.
8. Restore into the target within a transaction where practical.
9. Compare table counts and critical aggregates.
10. Update secrets and `DATABASE_URL`.
11. Run API, authentication, billing, entitlement, and job verification.
12. Keep the source read-only for an agreed rollback window.
13. Decommission only after formal acceptance.

Never treat approval to migrate as proof that migration completed. Record dump, restore, verification, cutover, and rollback status separately.

## 7. Initial schema domains

- Identity and sessions.
- Platform roles, permissions, assignments, and overrides.
- Organisations, memberships, and organisation roles.
- Packages, prices, offers, and redemptions.
- Subscriptions, price snapshots, and entitlement snapshots.
- Provider connections and encrypted credentials.
- Desired resources, provider resources, usage observations, and reservations.
- Provisioning jobs and reconciliation findings.
- Audit logs.

Persistent business entities use UUID primary keys and soft-delete fields where applicable.
