# Ghost Deploy

Managed application deployment, hosting commerce, and customer operations platform developed by Qubit Codes.

## Status

The MVA feature scope through controlled provisioning is implemented. Staging domain acceptance remains deliberately pending; production activation remains environment/operator work. Coolify support includes connection validation, idempotent provisioning, reconciliation, retries, runtime-backed Node/Laravel deployments, logical databases, backups, domains, and operational visibility. See `docs/SRS_TRACEABILITY.md` for the feature audit and `docs/PAYMENTS_AND_PROVISIONING.md` for the staging purchase runbook.

## Product boundary

Ghost Deploy owns the hosting landing page and authenticated panel routes on one domain by default:

```text
abc.com
  Marketing, public packages, authentication, and purchase entry points
        |
        | Same application and server-authorized context
        v
abc.com/dashboard and abc.com/admin
  Customer resources, subscriptions, usage, and platform administration
        |
        | Private provider adapter
        v
Coolify API
  Servers, applications, databases, and deployments
```

The landing page and panel normally share one domain. Platform Settings may optionally move authenticated panel routes to a separate verified origin. In either mode, this application remains the source of truth for prices, offers, subscriptions, permissions, entitlements, and resource ownership.

## Fixed MVA decisions

- Separate React Router v8 application, repository, deployment, and secrets.
- Supabase-managed PostgreSQL initially, accessed through Drizzle ORM.
- Portable database design supporting later migration to self-hosted PostgreSQL.
- Password authentication will never be implemented.
- MSG91 WhatsApp OTP for admins and customers; Firebase authentication is deferred.
- WhatsApp integration through `@qubitcodes/msg91`.
- Users may enter a registered mobile number alone or include its calling code; international input is parsed into normalized `country_code` and `mobile` fields.
- One user identity may have both platform-admin and customer/workspace access.
- Every user, including an administrator, receives a customer profile; the first workspace is created only after the first purchase.
- Workspaces are independent tenant, billing, subscription, entitlement, usage, and resource boundaries.
- Customers may own multiple workspaces; a Personal Workspace has one transferable Owner.
- Organisations are optional extensions of workspaces; multi-user organisation membership is deferred until after the MVA.
- Secure server-authorized switching between admin and workspace contexts.
- Immutable workspace billing-profile versions with authorized cross-workspace cloning and lineage.
- Admin roles, role permissions, and individual allow/deny overrides.
- Monthly, yearly, and explicit multi-year package prices.
- Offers, coupons, discounts, subscriptions, and purchased entitlement snapshots.
- Package restrictions for applications, databases, disk, storage, domains, compute, bandwidth, backups, and organisation members.
- Local development uses a mocked hosting provider; a Coolify server is required only for genuine integration testing.

## MVA delivery order

1. Repository and MVC foundation.
2. Unified OTP identity and admin authorization.
3. Packages, prices, offers, and entitlements.
4. Public landing page and customer-registration entry.
5. Customer, workspace, organisation-extension, billing, and subscription onboarding.
6. Subscription snapshots and usage enforcement.
7. Read-only Coolify staging integration.
8. Controlled, idempotent provisioning.
9. Production-readiness verification.

## Local setup

Requirements:

- Node.js 22.22 or newer.
- npm.
- PostgreSQL or a Supabase development database for migration verification.
- Published `@qubitcodes/msg91` package from the npm registry.
- PostgreSQL `pg_dump`/`pg_restore` and MySQL `mysqldump`/`mysql` clients when exercising logical-database backup and restore.

```powershell
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run dev
```

Set `DATABASE_URL` before using Drizzle:

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run db:verify
npm.cmd run jobs:process
```

Create the first Super Admin explicitly, without persisting identity details in environment configuration:

```powershell
npm.cmd run db:seed:super-admin -- --country-code=91 --mobile=9000000000 --display-name="Super Admin"
```

Authentication requires server-only `MSG91_AUTH_KEY`, `MSG91_WHATSAPP_NUMBER`, `OTP_HASH_SECRET`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` values. The MSG91 authentication template and language use the SDK's code-owned `common_otp` and `en` defaults. Each application secret must be independently generated with at least 32 characters. Never expose them through Vite-prefixed variables or commit them.

For local development only, `ENABLE_DEV_AUTH_BYPASS=true` permits a verified active database user to sign in by prefixing the login mobile with `~~`. The server additionally requires `APP_ENV=development`, `NODE_ENV=development`, and a loopback request URL. The marker is never stored, never sent to MSG91, and is rejected outside that complete guard. Keep the flag disabled in every shared, staging, and production environment.

Generate any missing application-owned secrets without replacing existing values:

```powershell
npm.cmd run env:generate-secrets
```

Per-database recovery artifacts default to `storage/database-backups`, which is runtime-only and Git-ignored. Set `DATABASE_BACKUP_STORAGE_PATH` to durable mounted storage in shared environments and configure the four native client path variables when the binaries are not available on `PATH`. Artifacts remain AES-256-GCM encrypted at rest; downloading or restoring requires workspace authorization and checksum verification.

For Supabase direct connections in environments with a private/self-signed intermediary certificate chain, use encrypted libpq-compatible SSL parameters: `sslmode=require&uselibpqcompat=true`. Do not commit the resulting connection string.

The Supabase GitHub integration expects real migration files beneath `supabase/migrations`; it does not reliably traverse the current Git-tracked symbolic link to `src/db/migrations`. Drizzle's live ledger is also older than the deployed schema. Until those histories are reconciled, review and apply each new canonical migration deliberately, verify the live schema, and remind the developer to push the migration with its code. Do not assume `drizzle-kit migrate` can safely replay the drifted production ledger.

Migration `0015_fluffy_odin.sql` establishes the Phase 3 tenancy foundation: one-to-one customer profiles, independent Personal or Organisation Workspaces, extensible workspace memberships, and optional organisation extensions. Customer and workspace URLs use database-generated six-digit public IDs; UUIDs remain internal primary keys.

Local endpoints:

- `/` - responsive public landing page with live published plans, billing terms, platform overview, FAQ, theme control, and sign-in entry.
- `/login` - request a WhatsApp OTP.
- `/login/verify/:challengeId` - verify a deep-linked OTP challenge.
- `/admin/overview` - authenticated Phase 1 overview.
- `/admin/administrators` - administrator management workspace.
- `/admin/packages` - searchable and sortable package catalogue administration.
- `/admin/packages/create` - focused initial package creation form.
- `/admin/packages/:packageSlug/:section` - URL-addressed package details and audit history.
- `/admin/packages/:packageSlug/pricing` - versioned INR monthly/yearly pricing and immutable price history.
- `/admin/packages/:packageSlug/entitlements` - package limits and SES transactional-email allowances.
- `/admin/packages/:packageSlug/cost-review` - AWS cost evidence, calculated margins, and publication approval.
- `/admin/offers` - offers, coupons, eligibility, dates, and redemption policies.
- `/admin/operations/payments` - payment attempts and verification state.
- `/admin/operations/provisioning` - provisioning jobs, failures, and manual retries.
- `/admin/operations/providers` - configured hosting-provider health.
- `/api/v1/public/catalogue` - published packages with current public prices and visible entitlements.
- `/api/v1/public/checkout-quotes` - server-calculated, signed, short-lived checkout quote.

Initial publication policy: Launch, Growth, and Business may be public after their pooled-capacity cost reviews; Managed Cloud tiers stay draft until exact dedicated AWS quotations are approved.

- `/admin/administrators/create` - URL-addressed create drawer.
- `/admin/administrators/:adminId/:section` - URL-addressed administrator detail section.
- `/settings/profile` - identity and context settings.
- `/settings/security` - authentication security settings.
- `/api/v1/health` - standardized process health.
- `/api/v1/openapi.json` - OpenAPI 3.1 contract.
- `/api/docs` - Scalar API reference.
- `/api/v1/auth/otp/request` - request an enumeration-safe WhatsApp OTP challenge.
- `/api/v1/auth/otp/verify` - verify a challenge and create a session.
- `/api/v1/workspaces` - list the authenticated customer's workspace memberships.
- `/api/v1/workspaces/:workspaceId` - view an authorized workspace by six-digit public ID.
- `/api/v1/checkouts` - persist an awaiting-payment checkout or explicitly eligible trial from a signed server quote.
- `/api/v1/checkouts/:checkoutId` - retrieve a checkout or configure its first workspace after verified payment/trial approval.
- `/api/v1/checkouts/:checkoutId/payment` - initiate an enabled provider payment session.
- `/api/v1/webhooks/payments/:provider` - verify and idempotently reconcile provider webhooks.
- `/api/v1/workspaces/:workspaceId/resources` - customer-authorized provisioning/resource state.
- `/api/v1/workspaces/:workspaceId/applications` - list and queue runtime-backed public or GitHub App-authorized private deployments.
- `/api/v1/workspaces/:workspaceId/applications/analyze-source` - inspect approved manifests and environment templates to suggest stack, framework, branch, directories, and variables.
- `/api/v1/workspaces/:workspaceId/applications/github-connections` - connect and list workspace-owned GitHub App installations.
- `/api/v1/workspaces/:workspaceId/applications/github-connections/:connectionId/repositories` - list repositories explicitly granted to that installation.
- `/api/v1/workspaces/:workspaceId/applications/:applicationId` - update deployable configuration and queue a fresh deployment.
- `/api/v1/workspaces/:workspaceId/applications/options` - workspace-authorized runtime and database choices.
- `/api/v1/workspaces/:workspaceId/applications/:applicationId/logs` - workspace-authorized provider logs.
- `/api/v1/workspaces/:workspaceId/applications/:applicationId/domains` - custom-domain registration and domain/TLS state.
- `/api/v1/workspaces/:workspaceId/applications/:applicationId/domains/:domainId` - primary selection, platform-domain toggle, TLS refresh, and custom-domain removal.
- `/api/v1/workspaces/:workspaceId/domains/:domainId/dns` - root-domain DNS draft, Cloudflare provisioning, and delegation refresh.
- `/api/v1/workspaces/:workspaceId/domains/:domainId/dns/import` - credential-free public scan, BIND import, or GoDaddy/Hostinger capture using a one-time customer token or the platform connection.
- `/api/v1/workspaces/:workspaceId/domains/:domainId/dns/records` - customer DNS record creation and management.
- `/api/v1/auth/profile` - server-authorized profile and dashboard capabilities.
- `/api/v1/auth/handoff` - short-lived, single-use session transfer to an optional separate panel origin.
- `/api/v1/public/platform` - effective public, panel, and application-domain URL configuration.
- `/api/v1/operations/platform-settings` - permission-protected platform-domain configuration.
- `/api/v1/operations/platform-settings/dns-providers` - masked, permission-protected Cloudflare, GoDaddy, and Hostinger connection management. Tokens are encrypted at rest; database connections take precedence over Cloudflare environment fallback.
- `/api/v1/workspaces/:workspaceId/databases/:databaseId/backups` - list and create encrypted logical-database recovery points.
- `/api/v1/workspaces/:workspaceId/databases/:databaseId/backups/:backupId/restore` - exact-name-confirmed destructive restore.
- `/api/v1/workspaces/:workspaceId/databases/:databaseId/backups/:backupId/download` - authorized, audited decrypted dump download.
- `/api/v1/auth/refresh` - rotate a refresh token.
- `/api/v1/auth/logout` - revoke the bearer session.
- `/api/v1/auth/context` - switch between personal and authorized admin context.
- `/api/v1/auth/sessions` - list the current user's device sessions.

### GitHub App setup

Create one public GitHub App with repository `Contents: Read-only` and `Metadata: Read-only` permissions. Set its setup URL to `/api/v1/github/callback`, enable installation on user and organisation accounts, and configure the `GITHUB_APP_*` values plus `COOLIFY_GITHUB_PRIVATE_KEY_UUID`. Each workspace installation is reconciled idempotently to its own Coolify GitHub Source; no Source UUID is shared globally. PKCS#1 keys downloaded by GitHub are normalized internally. Repository access remains selectable and reviewable in GitHub. Real `.env` files are never fetched; only environment templates such as `.env.example` are inspected.

Dockerfile deployments are intentionally disabled until package entitlements and workload isolation policies are enabled.

- `/api/v1/auth/sessions/:sessionId` - inspect, label, or revoke one owned session.
- `/api/v1/auth/sessions/others` - revoke every other active session.
- `/settings/sessions` - mobile-first Devices & Sessions management page.
- `/api/v1/admins` - permission-scoped administrator listing and creation.
- `/api/v1/admins/:adminId` - detail, lifecycle updates, and soft deletion.
- `/api/v1/admins/:adminId/roles` - replace reviewed role assignments.
- `/api/v1/admins/:adminId/overrides` - replace explicit permission overrides.
- `/api/v1/packages` - permission-scoped package listing and creation.
- `/api/v1/packages/:packageSlug` - package detail, publishing updates, and soft deletion.
- `/api/v1/package-categories` - active category options and permission-controlled inline creation.

## Application structure

```text
app/
  api/v1/          Thin API route entrypoints
  components/      Reusable view components
  pages/           Website, customer, admin, and documentation views
  routes.ts        Central React Router route map
src/
  config/          Validated runtime configuration
  controllers/     Request orchestration and business logic
  db/              Drizzle client, schemas, migrations, and seeders
  services/        Audit, OTP, billing, entitlement, and provider services
  schemas/         Shared validation and OpenAPI contracts
tests/             Automated unit and contract tests
storage/           Runtime directory; contents ignored by Git
```

The application uses native React Router routing and Web `Request` parsing. API responses use `@qubitcodes/qcresp`; WhatsApp integration uses `@qubitcodes/msg91`. The current qcresp release installs Next transitively for `NextResponse`, but this application has no direct Next.js dependency or Next.js application code.

## Documentation

- [Documentation index](Docs/README.md)
- [Product architecture](Docs/PRODUCT_ARCHITECTURE.md)
- [MVA requirements](Docs/MVA_REQUIREMENTS.md)
- [Authentication and access](Docs/AUTHENTICATION_AND_ACCESS.md)
- [Packages, billing, and entitlements](Docs/PACKAGE_BILLING_AND_ENTITLEMENTS.md)
- [Customers, workspaces, and organisations](Docs/WORKSPACES_CUSTOMERS_AND_ORGANISATIONS.md)
- [Database and portability](Docs/DATABASE_AND_PORTABILITY.md)
- [Infrastructure requirements](Docs/INFRASTRUCTURE_REQUIREMENTS.md)
- [Implementation plan](Docs/IMPLEMENTATION_PLAN.md)
- [Original Coolify integration reference](Docs/COOLIFY_INTEGRATION_DOCS.md)

## Development rule

Before starting application code, review the documentation and obtain approval for the exact repository structure, dependencies, database domains, and initial files. Do not provision live infrastructure or mutate production systems as part of local application setup.
