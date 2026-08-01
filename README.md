# Qubit Hosting Panel

Standalone hosting commerce and management application for Qubit Codes.

## Status

Phase 0 is complete. Phase 1 identity infrastructure now includes WhatsApp OTP challenges, access/refresh sessions, platform authorization models, controlled seeding, and secure context switching. Live MSG91 sender verification and admin management views remain pending.

## Product boundary

Qubit Hosting Panel is separate from the public Qubit Codes website:

```text
qubit.codes
  Marketing, public packages, and purchase entry points
        |
        | Versioned APIs and signed checkout handoff
        v
panel.qubit.codes
  Authentication, organisations, purchases, subscriptions,
  entitlements, usage, administration, and customer resources
        |
        | Private provider adapter
        v
Coolify API
  Servers, applications, databases, and deployments
```

The public website may display packages and initiate purchases, but the panel remains the source of truth for prices, offers, subscriptions, permissions, entitlements, and resource ownership.

## Fixed MVA decisions

- Separate React Router v8 application, repository, deployment, and secrets.
- Supabase-managed PostgreSQL initially, accessed through Drizzle ORM.
- Portable database design supporting later migration to self-hosted PostgreSQL.
- Password authentication will never be implemented.
- MSG91 WhatsApp OTP for admins and customers; Firebase authentication is deferred.
- WhatsApp integration through `@qubitcodes/msg91`.
- Users normally enter only their local mobile number; the stored country code is resolved by the server.
- One user identity may have both platform-admin and customer/organisation access.
- Secure server-authorized switching between admin and organisation contexts.
- Admin roles, role permissions, and individual allow/deny overrides.
- Monthly, yearly, and explicit multi-year package prices.
- Offers, coupons, discounts, subscriptions, and purchased entitlement snapshots.
- Package restrictions for applications, databases, disk, storage, domains, compute, bandwidth, backups, and organisation members.
- Local development uses a mocked hosting provider; a Coolify server is required only for genuine integration testing.

## MVA delivery order

1. Repository and MVC foundation.
2. Unified OTP identity and admin authorization.
3. Packages, prices, offers, and entitlements.
4. Customer and organisation onboarding.
5. Subscription snapshots and usage enforcement.
6. Read-only Coolify staging integration.
7. Controlled, idempotent provisioning.
8. Production-readiness verification.

## Local setup

Requirements:

- Node.js 22.22 or newer.
- npm.
- PostgreSQL or a Supabase development database for migration verification.
- Published `@qubitcodes/msg91` package from the npm registry.

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
```

Create the first Super Admin explicitly, without persisting identity details in environment configuration:

```powershell
npm.cmd run db:seed:super-admin -- --country-code=91 --local-mobile=9400143527 --display-name="Super Admin"
```

Authentication requires server-only `MSG91_AUTH_KEY`, `MSG91_WHATSAPP_NUMBER`, `OTP_HASH_SECRET`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` values. The MSG91 authentication template and language use the SDK's code-owned `common_otp` and `en` defaults. Each application secret must be independently generated with at least 32 characters. Never expose them through Vite-prefixed variables or commit them.

Generate any missing application-owned secrets without replacing existing values:

```powershell
npm.cmd run env:generate-secrets
```

For Supabase direct connections in environments with a private/self-signed intermediary certificate chain, use encrypted libpq-compatible SSL parameters: `sslmode=require&uselibpqcompat=true`. Do not commit the resulting connection string.

The Supabase GitHub integration expects migrations beneath a repository `supabase/` directory. Drizzle migrations currently live under `src/db/migrations`, so repository-to-Supabase deployment is not considered active until a reviewed migration synchronization strategy is added. Direct Drizzle migration execution remains the verified Phase 0 workflow.

Local endpoints:

- `/` - foundation page.
- `/api/v1/health` - standardized process health.
- `/api/v1/openapi.json` - OpenAPI 3.1 contract.
- `/api/docs` - Scalar API reference.
- `/api/v1/auth/otp/request` - request an enumeration-safe WhatsApp OTP challenge.
- `/api/v1/auth/otp/verify` - verify a challenge and create a session.
- `/api/v1/auth/refresh` - rotate a refresh token.
- `/api/v1/auth/logout` - revoke the bearer session.
- `/api/v1/auth/context` - switch between personal and authorized admin context.

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
- [Database and portability](Docs/DATABASE_AND_PORTABILITY.md)
- [Infrastructure requirements](Docs/INFRASTRUCTURE_REQUIREMENTS.md)
- [Implementation plan](Docs/IMPLEMENTATION_PLAN.md)
- [Original Coolify integration reference](Docs/COOLIFY_INTEGRATION_DOCS.md)

## Development rule

Before starting application code, review the documentation and obtain approval for the exact repository structure, dependencies, database domains, and initial files. Do not provision live infrastructure or mutate production systems as part of local application setup.
