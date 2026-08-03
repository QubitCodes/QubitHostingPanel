# Qubit Hosting Panel Documentation

## Status

- Product stage: Minimum Viable Application (MVA) planning
- Application: Separate from the public Qubit Codes website
- Database: Supabase-managed PostgreSQL initially
- Infrastructure provider: Coolify, introduced after the core commercial and authorization modules
- Authentication: Passwordless Firebase identity with SMS OTP and MSG91 WhatsApp OTP

## Document map

1. `COOLIFY_INTEGRATION_DOCS.md` - preserved original Coolify/AWS deployment reference.
2. `PAYMENTS_AND_PROVISIONING.md` - payment gateway, webhook, worker, and Coolify purchase-test runbook.
2. `PRODUCT_ARCHITECTURE.md` - system boundaries, ownership, and integration architecture.
3. `MVA_REQUIREMENTS.md` - approved first-release functional requirements.
4. `AUTHENTICATION_AND_ACCESS.md` - passwordless identity, permissions, organisations, and context switching.
5. `PACKAGE_BILLING_AND_ENTITLEMENTS.md` - packages, prices, offers, subscriptions, and usage restrictions.
6. `WORKSPACES_CUSTOMERS_AND_ORGANISATIONS.md` - customer identity, workspace tenancy, organisation extensions, billing snapshots, transfers, and deferred membership features.
6. `DATABASE_AND_PORTABILITY.md` - Supabase-first database strategy and later migration path.
7. `INFRASTRUCTURE_REQUIREMENTS.md` - local, staging, and production infrastructure requirements.
8. `IMPLEMENTATION_PLAN.md` - delivery phases, verification gates, and deferred work.

## Fixed decisions

- `QubitHostingPanel` is a standalone application deployed independently from `qubit.codes`.
- The public website consumes external APIs for package discovery and purchase handoff.
- Checkout, subscriptions, entitlements, customer resources, and Coolify integration belong to the panel.
- One user identity may have platform-admin access and customer/organisation access simultaneously.
- Password authentication will never be implemented.
- Users log in with a registered mobile number and may include a calling code, which the interface normalizes into a country selector.
- Supabase supplies managed PostgreSQL initially, without coupling core business logic to Supabase-only services.
- A real Coolify server is not required to begin local development.

## Documentation authority

The MVA and architecture documents in this folder supersede product assumptions in the preserved Coolify guide. The preserved guide is reference material and must be reviewed before any production infrastructure action.
