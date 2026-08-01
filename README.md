# Qubit Hosting Panel

Standalone hosting commerce and management application for Qubit Codes.

## Status

The project is currently in Minimum Viable Application (MVA) planning. Product boundaries, authentication, package billing, entitlements, database portability, infrastructure requirements, and delivery phases are documented. Application scaffolding has not started.

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

- Separate Next.js application, repository, deployment, and secrets.
- Supabase-managed PostgreSQL initially, accessed through Drizzle ORM.
- Portable database design supporting later migration to self-hosted PostgreSQL.
- Password authentication will never be implemented.
- Firebase SMS OTP and MSG91 WhatsApp OTP for admins and customers.
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
