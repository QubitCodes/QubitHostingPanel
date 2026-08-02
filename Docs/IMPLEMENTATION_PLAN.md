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
- [x] User-owned Devices & Sessions page with device labels, metadata visibility, activity timestamps, and individual/all-other revocation.
- [x] Authentication audit events, retry limits, and resend cooldown.
- [x] Platform roles, permissions, individual allow/deny overrides, and essential-data seeding.
- [x] First Super Admin identity seeded through explicit CLI input rather than persistent environment configuration.
- [x] Live MSG91 generated-OTP submission accepted by the configured production sender.
- [x] Confirm handset delivery and complete the application OTP verification/session flow.
- [x] Admin management APIs and URL-driven views for lifecycle, roles, overrides, sessions, authentication events, and audit history.
- [x] Full-width administrator create/view/update workspace with URL-addressable Basic details, Roles, and Permissions tabs; searchable bulk role/permission controls; inherited permission visibility; explicit allow/deny notes; and override reset.
- [x] Six-digit public user IDs for human-readable administrator URLs, database-backed permission labels, and immediate Super Admin authorization before granular permission evaluation.
- [x] Locked, fully enabled Super Admin permission workspace with server-side override protection.
- [x] Reusable E.164-aware phone input with compact country-code display, searchable country picker, paste detection, and light/dark theme support.
- [x] Centralized semantic light/dark theme tokens using the Qubit green, teal, sage, and muted-green system palette.
- [x] Reusable responsive data-table primitives with module search/filter toolbars, optional sortable headers, empty states, and sticky icon-action columns; applied to Administrators without sorting.
- [x] Shared theme-aware custom dropdowns with optional search, keyboard selection, focus-out closing, and permission-controlled inline option creation support; native administrator selects removed and search disabled for short status lists.
- [x] Separate URL-addressable administrator view/edit workspaces and role/permission-aware administrator list summaries.
- [x] Server-authorized personal/admin context switching.
- [x] Permission-gated Scalar API documentation, hidden JSON 404 fallback, account dropdown, and Qubit Codes product credit.

Gate status:

- [x] One verified Super Admin can authenticate through WhatsApp OTP.
- [x] Access and rotating refresh tokens create a personal session.
- [x] The same session can enter the permitted admin context.
- [x] Logout revokes the session and subsequent context access is rejected.
- [x] No password authentication flow exists.

Gate: completed with live WhatsApp authentication, context isolation, session ownership/revocation, database-level Super Admin concealment, deny precedence, final-Super-Admin protection, admin lifecycle, role/override seeding, automated checks, and Supabase verification evidence.

## Phase 2 - Packages and entitlements

- [x] Package-category model with nullable package assignment, searchable selection, and permission-controlled inline creation.
- [x] Package CRUD, human-readable slug URLs, draft/published/archived lifecycle, featured/display controls, audit history, and permission-gated publishing.
- [x] Optional validated package trials with positive duration and day/week/month units.
- [x] Responsive package table with URL-backed search/status/category filters, sortable columns, and sticky icon actions.
- [x] Complete initial offers, entitlements, public catalogue, and checkout quotation tasks below.
- [x] Versioned INR monthly/yearly package prices with immutable history, public/private state, effective dates, and tax behaviour.
- [x] Two initial package categories and six competitively positioned draft packages with yearly pricing equal to ten monthly payments.
- [x] Guarded price removal with active-customer impact counts and preserved pricing through current term end.
- [x] Package entitlement definitions and initial enforceable package limits, including transactional SES recipient allowances.
- [x] Separate SES recipient add-on products with fixed and custom pricing options.
- [x] Auditable AWS cost/margin reviews with a mandatory approved-review publish gate.
- [x] Explicit two-year and three-year prices stored as independent historical price records.
- [x] Offers, coupons, package/price eligibility, redemption limits, customer restrictions, stacking, priorities, and dates.
- [x] Editable entitlement definitions and package assignments for future subscription snapshots.
- [x] Public package API exposing only published packages, current public prices, and customer-visible entitlements.
- [x] Server-authoritative price, offer, discount, configurable tax, and total calculation with a signed expiring checkout quote.

Gate: unpublished data is private, price tampering fails, and historical prices remain stable.

Deployment status:

- [x] Supabase production database has migrations `0011` through `0014` applied; `0013` safely carries publication data added after `0012` had already run.
- [x] Live database verification confirms offers, explicit multi-year prices, approved shared-tier reviews, and three published shared tiers.
- [x] Live public catalogue, coupon eligibility rejection, signed quote, unpublished privacy, and tampered-total checks pass.

Gate: completed with live Supabase schema/catalogue evidence, four active billing terms per package, approved cost reviews for all public tiers, three private Cloud drafts, a three-package public catalogue, signed server-authoritative quotes, and rejection of client totals and ineligible coupons.

## Phase 3 - Public registration, customers, workspaces, and subscriptions

Delivery order:

- [x] Build the responsive public landing page with live published package pricing, billing-term selection, sign-in entry, and a registration-ready customer acquisition flow.
- [x] Add separate customer, workspace, membership, and organisation-extension models with six-digit public IDs.
- [ ] Update OTP registration to transactionally create/reuse the customer profile, Personal Workspace, and Owner membership.
- [ ] Backfill every current user, including administrators, with missing customer/workspace records idempotently.
- [ ] Permit multiple independently billed workspaces per user during the MVA.
- [ ] Create Personal or Organisation Workspaces and convert Personal Workspaces into organisations without changing workspace identity.
- [ ] Support audited Personal Workspace ownership transfer with recipient confirmation and automatic replacement workspace when required.
- [ ] Add immutable workspace billing-profile versions and authorized cloning with source lineage.
- [ ] Replace organisation-specific session context with server-authorized workspace context and workspace selector.
- [ ] Build the workspace dashboard shell and URL-backed overview, billing, subscription, security, create, and conversion views.
- [ ] Add workspace-owned checkout records, payment-provider abstraction, attempts, and verified-webhook foundations.
- [ ] Add one primary hosting subscription per workspace plus add-on items and lifecycle state.
- [ ] Snapshot purchased price, offers, tax, billing profile, and entitlements immutably.
- [ ] Add customer/workspace/subscription administration, OpenAPI documentation, tests, and live Supabase verification.

Gate: every user has a customer profile and workspace, each workspace has isolated billing/plan state, ownership transfer preserves workspace history, and admin access remains independently authorized.

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
- Multiple organisation Owners and final-Owner protection.
- Organisation billing-manager/member roles and custom workspace permissions.
- Organisation membership and seat-limit enforcement.
- Ownership recovery and transfer-dispute workflows.
- Workspace merging, splitting, and cross-workspace resource transfers.
- Customer-facing Organisation-to-Personal reversion.
- Google Sign-In and other Firebase providers.
- Multiple Coolify servers and placement policies.
- Proration, overage charging, and additional hosting providers.

## Next implementation approval

Next task: update OTP registration to transactionally create or reuse the customer profile, Personal Workspace, and Owner membership, then add an idempotent existing-user backfill.
