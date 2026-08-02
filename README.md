# Qubit Hosting Panel

Standalone hosting commerce and management application for Qubit Codes.

## Status

Phases 0 through 2 are complete. Phase 3 begins with the public landing and registration experience, followed by customer profiles, workspace tenancy, organisation extensions, workspace billing, and subscriptions. The application includes verified WhatsApp OTP authentication, access/refresh sessions, user-owned device management, platform authorization, secure context switching, package/offer commerce, and the responsive light/dark panel interface.

## Product boundary

Qubit Hosting Panel is separate from the public Qubit Codes website:

```text
qubit.codes
  Marketing, public packages, and purchase entry points
        |
        | Versioned APIs and signed checkout handoff
        v
panel.qubit.codes
  Authentication, customers, workspaces, organisations, subscriptions,
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
- Users may enter a registered mobile number alone or include its calling code; international input is parsed into normalized `country_code` and `mobile` fields.
- One user identity may have both platform-admin and customer/workspace access.
- Every user, including an administrator, receives a customer profile and Personal Workspace.
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

The Supabase GitHub integration expects real migration files beneath `supabase/migrations`; it does not reliably traverse the current Git-tracked symbolic link to `src/db/migrations`. Drizzle's live ledger is also older than the deployed schema. Until those histories are reconciled, review and apply each new canonical migration deliberately, verify the live schema, and remind the developer to push the migration with its code. Do not assume `drizzle-kit migrate` can safely replay the drifted production ledger.

Local endpoints:

- `/` - foundation page.
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
- `/api/v1/auth/refresh` - rotate a refresh token.
- `/api/v1/auth/logout` - revoke the bearer session.
- `/api/v1/auth/context` - switch between personal and authorized admin context.
- `/api/v1/auth/sessions` - list the current user's device sessions.
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
