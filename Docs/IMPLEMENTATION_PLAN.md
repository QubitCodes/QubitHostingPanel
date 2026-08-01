# Implementation Plan

## Delivery principles

- Build locally first.
- Keep the public website and panel separate.
- Establish authorization and commercial truth before infrastructure mutations.
- Use a mock provider until domain workflows pass tests.
- Introduce Coolify read-only before write/deploy access.
- Make payments and provisioning idempotent and auditable.

## Phase 0 - Repository foundation

- [x] Standalone React Router v8 and Vite 7 application foundation.
- [x] Strict TypeScript, Tailwind, Drizzle, PostgreSQL, and Zod.
- [x] Required aliases and MVC directory boundaries.
- [x] Native React Router routing/request parsing with `@qubitcodes/qcresp` and `@qubitcodes/msg91`.
- [x] Environment validation and safe `.env.example`.
- [x] Scalar/OpenAPI at `/api/docs`.
- [x] Build, migration, seed, lint, typecheck, and test scripts.
- [x] Initial audit-log schema, generated raw SQL migration, and centralized audit service.
- [x] Hosting-provider boundary and deterministic `MockHostingProvider`.

Gate status:

- [x] Dependency installation and lockfile synchronization pass.
- [x] Essential-data seed command passes; Phase 0 has no required seed records.
- [x] Typecheck passes.
- [x] Lint passes with zero warnings.
- [x] Automated tests pass.
- [x] Production build passes.
- [x] Production runtime smoke checks pass for home, health, OpenAPI, and JSON API fallback.
- [x] Dependency audit reports zero known vulnerabilities.
- [x] Migration execution against the Supabase PostgreSQL database passes; `audit_logs` has 13 expected columns and the Drizzle journal records one migration.

Gate: completed with clean install, migration, seed, schema verification, typecheck, lint, tests, dependency audit, runtime smoke checks, and production build evidence.

## Phase 1 - Identity and admin authorization

- [x] Unified users and external identities.
- [x] Published MSG91 SDK WhatsApp OTP generation/delivery with application-owned hashed verification; Firebase providers deferred.
- [x] Access/refresh tokens and multi-device sessions.
- [x] Authentication audit events, retry limits, and resend cooldown.
- [x] Platform roles, permissions, individual allow/deny overrides, and essential-data seeding.
- [x] First Super Admin identity seeded through explicit CLI input rather than persistent environment configuration.
- [x] Live MSG91 generated-OTP submission accepted by the configured production sender.
- [ ] Confirm handset delivery and complete the application OTP verification/session flow.
- [ ] Admin management APIs and views.
- [x] Server-authorized personal/admin context switching.

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
