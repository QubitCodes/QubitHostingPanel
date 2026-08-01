# Implementation Plan

## Delivery principles

- Build locally first.
- Keep the public website and panel separate.
- Establish authorization and commercial truth before infrastructure mutations.
- Use a mock provider until domain workflows pass tests.
- Introduce Coolify read-only before write/deploy access.
- Make payments and provisioning idempotent and auditable.

## Phase 0 - Repository foundation

- Standalone Next.js 16 App Router repository.
- Strict TypeScript, Tailwind, Drizzle, PostgreSQL, and Zod.
- Required aliases and MVC directory boundaries.
- `@qubitcodes/qcrouter`, `@qubitcodes/qcreq`, and `@qubitcodes/qcresp`.
- Environment validation and safe `.env.example`.
- Scalar/OpenAPI at `/api/docs`.
- Build, migration, seed, lint, and test scripts.

Gate: clean install, migration, seed, typecheck, tests, and production build pass.

## Phase 1 - Identity and admin authorization

- Unified users and external identities.
- Firebase SMS OTP and MSG91 WhatsApp OTP.
- Access/refresh tokens and multi-device sessions.
- Authentication audit events and rate limiting.
- Platform roles, permissions, and individual allow/deny overrides.
- Admin APIs/views and secure context switching.

Gate: one verified user can enter permitted contexts without privilege leakage; no password flow exists.

## Phase 2 - Packages and entitlements

- Package CRUD and publishing.
- Monthly, yearly, and explicit multi-year prices.
- Offers, coupons, eligibility, limits, and dates.
- Entitlement definitions and package assignments.
- Public package APIs and signed checkout handoff.
- Server-authoritative price calculation.

Gate: unpublished data is private, price tampering fails, and historical prices remain stable.

## Phase 3 - Customer and organisation onboarding

- OTP customer onboarding.
- Organisation creation and Owner membership.
- Existing admin-to-customer registration without duplicate identities.
- Context selector and organisation dashboard shell.
- Subscription lifecycle and payment-provider abstraction.
- Purchased price and entitlement snapshots.

Gate: one user can own an organisation and retain independently authorized admin access.

## Phase 4 - Usage and restriction engine

- Usage, capacity reservation, and observation models.
- Count-based quota enforcement.
- Measured disk/database usage snapshots.
- Hard, soft, metered, and informational policies.
- Transactional pending reservations.
- Admin overrides and customer-visible freshness.

Gate: concurrent requests cannot exceed hard limits and stale observations are visible.

## Phase 5 - Coolify read-only integration

Prerequisite: dedicated staging Linux server.

- Encrypted connection records and least-privilege token.
- Connection validation.
- Import servers, applications, databases, services, and deployments.
- Scheduled reconciliation and usage snapshots.
- Provider retry and error isolation.

Gate: imported state is accurate/team-scoped and provider outages cannot corrupt commercial ownership.

## Phase 6 - Controlled provisioning

- Idempotent provisioning job queue.
- Application/database creation behind entitlement checks.
- Deployment status and domain conflict validation.
- Admin approval paths and partial-failure reconciliation.

Gate: retries and duplicate webhooks cannot create duplicate resources.

## Phase 7 - Production readiness

- Production infrastructure and DNS.
- Backup/restore and token-rotation drills.
- Monitoring, alerting, rate limits, and security review.
- Payment reconciliation and concurrency verification.
- Incident, rollback, suspension, and cancellation playbooks.

Gate: production checklist is accepted with evidence.

## Deferred roadmap

- Organisation invitations and multiple customer users.
- Customer-defined organisation roles.
- Google Sign-In and other Firebase providers.
- Multiple Coolify servers and placement policies.
- Proration, overage charging, and additional hosting providers.

## Next implementation approval

Before Phase 0 application code, present the exact repository structure, dependencies, database domains, and intended files for confirmation.
