# Implementation Plan

## Delivery principles

- Build locally first.
- Keep public and authenticated responsibilities separated in code while serving them from one origin by default; retain optional separate-panel routing.
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
- [x] Centralized semantic light/dark theme tokens using the Ghost Deploy green, teal, sage, and muted-green system palette.
- [x] Reusable responsive data-table primitives with module search/filter toolbars, optional sortable headers, empty states, and sticky icon-action columns; applied to Administrators without sorting.
- [x] Shared theme-aware custom dropdowns with optional search, keyboard selection, focus-out closing, and permission-controlled inline option creation support; native administrator selects removed and search disabled for short status lists.
- [x] Separate URL-addressable administrator view/edit workspaces and role/permission-aware administrator list summaries.
- [x] Server-authorized personal/admin context switching.
- [x] Permission-gated Scalar API documentation, hidden JSON 404 fallback, account dropdown, and Qubit Codes product credit.
- [x] Explicitly gated loopback-only development authentication bypass for verified active users, with strict leading-marker input handling, normal revocable sessions, and authentication audit events.

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
- [x] Update OTP registration to transactionally create/reuse only the customer profile; defer the first workspace until purchase.
- [x] Backfill every current user, including administrators, with missing customer records idempotently without seeding workspaces.
- [x] Permit multiple independently billed workspaces per user through purchase-first workspace setup during the MVA.
- [x] Create Personal or Organisation Workspaces and convert Personal Workspaces into organisations without changing workspace identity.
- [x] Support audited Personal Workspace ownership transfer with recipient confirmation and automatic replacement workspace when required.
- [x] Add immutable workspace billing-profile versions and authorized cloning with source lineage.
- [x] Add an authorized dashboard workspace selector without workspace IDs in customer page URLs.
- [x] Build the `/dashboard` shell and URL-backed overview, billing, subscription, security, and create-popup views.
- [x] Add customer-owned pre-workspace checkout records, mock/PayU/Razorpay provider abstraction, attempts, exact amount verification, and idempotent verified-webhook foundations.
- [x] Add one primary hosting subscription per workspace plus add-on items and lifecycle state.
- [x] Snapshot purchased price, offers, tax, billing profile, and entitlements immutably.
- [x] Add customer/workspace/subscription administration, OpenAPI documentation, tests, and live Supabase verification.

Gate: every user has a customer profile, purchased workspaces have isolated billing/plan state, ownership transfer preserves workspace history, and admin access remains independently authorized.

## Phase 4 - Usage and restriction engine

- [x] Usage, capacity reservation, and observation models.
- [x] Count-based quota enforcement.
- [x] Measured disk/database usage snapshots.
- [x] Hard, soft, metered, and informational policies.
- [x] Transactional pending reservations.
- [x] Admin overrides and customer-visible freshness.

Deployment status:

- [x] Migration `0027` is applied and journaled in Supabase with reservations, observations, and override constraints verified.
- [x] Live simultaneous hard-limit reservations produced exactly one accepted claim and one rejection for one available slot.
- [x] Live override resolution changed the effective application limit and policy, and an expired freshness threshold was identified as stale.
- [x] Live PostgreSQL/MySQL measurement collected three logical database sizes into fresh workspace-aggregated byte observations with zero failures.

Gate: completed with live concurrency, override, stale-observation, PostgreSQL/MySQL measurement, and Supabase schema evidence.

## Phase 5 - Coolify read-only integration

Prerequisite: dedicated staging Linux server. Completed on AWS EC2 with Coolify v4, a healthy Traefik proxy, and wildcard staging workload routing.

- [x] Environment-secret single-connection configuration and least-privilege token contract.
- [x] Database-managed encrypted multi-connection records and token rotation workflow.
- [x] Connection validation and protected admin provider-health view.
- [x] Real staging API authentication and team-scoped placement discovery verified against the existing Coolify instance.
- [x] Import servers, applications, databases, services, and deployments.
- [x] Scheduled reconciliation and usage snapshots.
- [x] Provider retry and error isolation in durable provisioning jobs.

- [x] Migration `0028` applied and the environment connection bootstrapped with AES-256-GCM token storage; live atomic rotation activated version 2 and retired version 1.
- [x] Live reconciliation imported one server, four applications, two databases, zero services, and zero current deployments; three records matched existing workspace resources without creating ownership.

Gate: completed with encrypted multi-connection storage, validated rotation rollback safety, successful scoped live reconciliation, sanitized snapshots, per-resource error isolation, and commercial-ownership protection.

## Phase 6 - Controlled provisioning

- [x] Idempotent provisioning job queue with CLI/internal worker execution, optimistic claims, retry, and reconciliation.
- [x] Starter Docker-image application creation after verified payment/trial and subscription snapshot; customer source and database selection remain later resource workflows.
- [x] Direct provider smoke deployment verified with `nginx:alpine`, a healthy container, and a public HTTPS staging workload response.
- [x] Deployment status and domain conflict validation.
- [x] Admin payment/provisioning visibility, provider health, failure detail, and manual retry.
- [x] Partial-failure reconciliation prevents repeat workers from recreating an existing provider resource.
- [x] Shared-platform schema foundation for reusable runtime images, build artifacts, database clusters, and workspace logical databases.
- [x] Separate shared logical-database provisioning contract from Coolify application provisioning.
- [x] Version-pinned Node.js, PHP/nginx, Python, and static/nginx runtime definitions with default-port catalogue seeding.
- [x] GitHub Actions runtime-image build, smoke-test, security-scan, provenance, SBOM, and GHCR publication workflow.
- [x] First GHCR runtime publication verified for all seven approved images with successful build, smoke-test, and security-scan jobs.
- [x] Shared-platform migrations `0020` and `0021` applied to Supabase and seven runtime catalogue entries seeded with verified versions and default ports.
- [x] Public anonymous GHCR pulls verified and immutable manifests recorded for all seven exact-version runtime catalogue entries.
- [x] Admin shared database cluster creation, capacity/lifecycle settings, provider health validation, and scheduled backup management with URL-backed views.
- [x] Admin runtime catalogue editing and lifecycle management.
- [x] PostgreSQL/MySQL logical database allocation, restricted users, encrypted credential reveal/rotation, entitlement quotas, and audited lifecycle API.
- [x] Customer database management UI/API with URL-backed list, create, detail, reveal, and rotation views.
- [x] Reusable workspace database users, existing-user selection during app/database creation, shared password-impact reporting, and an independently authenticated `/database/:databaseId/...` manager for parallel database tabs.
- [x] Responsive database Schema Designer with strictly validated PostgreSQL schema operations and PostgreSQL/MySQL table, column, index, primary-key, and foreign-key management; destructive DDL requires exact confirmation and all attempts are audited.
- [x] Separate private Coolify and optional IP-restricted management endpoints with explicit runtime selection and TLS-ready client configuration; migration `0023` applied to Supabase.
- [x] Live PostgreSQL/MySQL logical database creation, credential rotation, quota enforcement, and cross-workspace/platform isolation verified against staging management endpoints.
- [x] Customer application runtime/source selection, workspace database bindings, domain conflict checks, idempotent deployment management, provider logs, and URL-backed UI/API.
- [x] Workspace-wide customer domain inventory with connected-application, DNS ownership, routing, and TLS state; application creation accepts multiple non-blocking pending custom domains while preserving a removable post-save platform fallback.
- [x] Workspace domain ownership registry with configurable TXT verification, verified parent-domain protection, and owner-controlled cross-workspace subdomain approval/revocation.
- [ ] Staging domain acceptance: ownership verification, cross-workspace subdomain approval, TLS issuance, primary switching, and safe platform-subdomain removal.
- [x] Root-only domain inventory and domain-panel DNS workflow with draft capture, BIND/GoDaddy/Hostinger import, Cloudflare authoritative provisioning, delegation refresh, and managed subdomain A/AAAA lifecycle.
- [x] Live public Git deployment verified through Coolify with a pinned Node runtime, database environment binding, partial-create recovery, healthy panel state, and public HTTPS 200.
- [x] Per-database encrypted backup/restore lifecycle, entitlement retention, audited download/delete controls, and URL-backed recovery UI.
- [x] Live PostgreSQL/MySQL encrypted backup, audited download, destructive restore recovery, cross-workspace rejection, artifact deletion, and soft-deletion verification.

Gate: retries and duplicate webhooks cannot create duplicate resources.

### Database management completion track

The checked Phase 6 database items establish provisioning, credentials, row management, schema design, and recovery. They do not claim phpMyAdmin/Adminer feature parity. Remaining database-product work is tracked explicitly:

- [x] Bounded row browsing, search, pagination, insert, edit, and primary-key-guarded deletion.
- [x] Read-only inspection of views, routines, triggers, sequences, events, columns, indexes, and constraints.
- [x] Modelled schema/table/column/index/primary-key/foreign-key management without arbitrary SQL.
- [x] Controlled SQL workspace with read-only transactions by default, a 15-second timeout, bounded JSON-safe results, session-local history, query fingerprints, and exact confirmation for supported data mutations.
- [x] Native PostgreSQL/MySQL import and export foundation with short-lived signed staging, checksum verification, size limits, merge/replace selection, direct export streaming, and audited execution.
- [x] Safe cancellation for active database-owned queries with exact database confirmation, numeric session validation, and success/failure audit evidence.
- [ ] CSV result export, persistent saved queries, and permission-separated customer roles once collaborative workspace roles are introduced.
- [ ] CSV/JSON/table-scoped transfers, background progress, failure recovery, and automatic pre-import safety backups.
- [x] Multiple database users with read-only/read-write/custom grants, disable/delete controls, automatic expiry, exact confirmation, audit history, and cross-database impact reporting.
- [x] Automatic per-database backup schedules, package-bounded retention cleanup, encrypted S3-compatible off-site storage, same-workspace/same-engine clone restore, and checksum/authentication verification evidence.
- [x] Connection, lock, query, storage, index-usage, and slow-query diagnostics with privacy-preserving fingerprints and safe cancellation controls.
- [ ] Editable views, materialized views, routines, triggers, sequences, and MySQL events.
- [ ] Database clone/rename/move workflows and package-gated external-access controls.

## Phase 7 - Production readiness

- [ ] Production infrastructure, DNS, TLS, and secrets activation. Operator/environment work; not an application feature gap.
- [x] Previous staging control plane deployed from pushed `main` with development authentication bypass disabled and trusted HTTPS; Ghost Deploy domain cutover remains operator work.
- [x] Staging source-deployment acceptance completed through the normal quota, job, provider, and reconciliation path: Node 22/Express and PHP 8.3/Laravel 12 both return public HTTPS 200 and finished as succeeded/running.
- [x] Coolify partial-create recovery now upserts provider-generated environment variables, refreshes changed application commands, and redeploys terminal failures without duplicating active builds.
- [x] Staging backup/restore and database-managed token-rotation drills.
- [x] Monitoring signal definitions, alert thresholds, ingress rate-limit policy, security controls, and release-owner checklist documented in the production runbook.
- [x] Payment reconciliation and concurrency verification.
- [x] Incident, rollback, suspension, and cancellation playbooks.
- [x] Automated readiness report covers failed provisioning, stale pending payments, latest provider reconciliation health, stale usage, and provider health.
- [x] Live payment/provisioning verification confirmed all four idempotency indexes, required lifecycle states, and eight operational permissions; verified payment state is monotonic under concurrent events.
- [x] PayU checkout `100001` reconciled as cancelled after dashboard evidence confirmed both real test transactions belonged to checkout `100002`; the correction was audited and checkout `100002` remained active/verified.

Gate: production checklist is accepted with evidence.

## Deferred roadmap

The consolidated post-MVA roadmap is maintained in `future-plans/NON_MVA_ROADMAP.md`.

- Organisation invitations and multiple customer users.
- Multiple organisation Owners and final-Owner protection.
- Organisation billing-manager/member roles and custom workspace permissions.
- Organisation membership and seat-limit enforcement.
- Ownership recovery and transfer-dispute workflows.
- Workspace merging, splitting, and cross-workspace resource transfers.
- Customer-facing Organisation-to-Personal reversion.
- Google Sign-In and other Firebase providers.
- Multiple Coolify servers and placement policies.
- Dedicated database clusters/RDS placement for high-load tenants.
- Proration, overage charging, and additional hosting providers.

## Next implementation approval

No MVA feature implementation remains open. Domain acceptance remains explicitly pending until real domains are available. Production infrastructure, secrets, DNS/TLS activation, scheduler installation, and external alert destinations remain operator/environment work rather than missing product features.
