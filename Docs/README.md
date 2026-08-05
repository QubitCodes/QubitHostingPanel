# Ghost Deploy Documentation

## Status

- Product stage: MVA feature implementation complete; domain acceptance and production activation pending
- Application: Hosting landing page and authenticated panel share one origin by default; optional separate panel origin remains configurable
- Database: Supabase-managed PostgreSQL initially
- Infrastructure provider: Coolify, introduced after the core commercial and authorization modules
- Authentication: Passwordless MSG91 WhatsApp OTP; Firebase providers deferred

## Document map

1. `COOLIFY_INTEGRATION_DOCS.md` - preserved original Coolify/AWS deployment reference.
2. `PAYMENTS_AND_PROVISIONING.md` - payment gateway, webhook, worker, and Coolify purchase runbook.
3. `PRODUCT_ARCHITECTURE.md` - system boundaries, ownership, and integration architecture.
4. `MVA_REQUIREMENTS.md` - approved first-release functional requirements.
5. `SRS_TRACEABILITY.md` - audited requirement-to-implementation map and remaining non-feature work.
6. `AUTHENTICATION_AND_ACCESS.md` - passwordless identity, permissions, organisations, and context switching.
7. `PACKAGE_BILLING_AND_ENTITLEMENTS.md` - packages, prices, offers, subscriptions, and usage restrictions.
8. `WORKSPACES_CUSTOMERS_AND_ORGANISATIONS.md` - customer identity, workspace tenancy, organisation extensions, billing snapshots, transfers, and deferred membership features.
9. `DATABASE_AND_PORTABILITY.md` - Supabase-first database strategy and later migration path.
10. `INFRASTRUCTURE_REQUIREMENTS.md` - local, staging, and production infrastructure requirements.
11. `SHARED_PLATFORM_ARCHITECTURE.md` - shared runtimes, isolated application containers, logical databases, credentials, quotas, and backup boundaries.
12. `IMPLEMENTATION_PLAN.md` - delivery phases, verification gates, and deferred work.
13. `GHOST_DEPLOY_CUTOVER.md` - production/staging domains, provider changes, compatibility, and secret-rotation guidance.

## Fixed decisions

- Ghost Deploy is a standalone application deployed at `ghostdeploy.com`.
- The public landing, authentication, checkout, customer dashboard, and admin dashboard share one origin by default; Platform Settings may configure a separate verified panel origin.
- Checkout, subscriptions, entitlements, customer resources, and Coolify integration belong to the panel.
- One user identity may have platform-admin access and customer/organisation access simultaneously.
- Password authentication will never be implemented.
- Users log in with a registered mobile number and may include a calling code, which the interface normalizes into a country selector.
- Supabase supplies managed PostgreSQL initially, without coupling core business logic to Supabase-only services.
- A real Coolify server is not required to begin local development.

## Documentation authority

The MVA and architecture documents in this folder supersede product assumptions in the preserved Coolify guide. The preserved guide is reference material and must be reviewed before any production infrastructure action.
