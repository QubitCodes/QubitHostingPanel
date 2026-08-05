# Non-MVA Product Roadmap

## 1. Purpose

This document consolidates planned features that are deliberately outside the completed Ghost Deploy MVA. It draws from the deferred sections of the implementation plan, SRS traceability audit, workspace/organisation architecture, authentication plan, database architecture, deployment workflow, and newly approved future plans.

Nothing in this roadmap is represented as implemented, deployed, tested, priced, or scheduled. Each initiative requires separate approval and must preserve the MVA's security, tenancy, billing-snapshot, audit, and provider-abstraction guarantees.

## 2. Current MVA boundary

The current MVA already includes unified passwordless identity, administrator/customer contexts, packages and offers, immutable checkout/subscription snapshots, usage entitlements, workspace resources, Coolify provisioning, GitHub App installation, public/private repository deployment, environment configuration, shared database provisioning, backups, multi-domain applications, DNS management, ownership/delegation, platform settings, operational readiness, and auditable administration.

The remaining MVA work is acceptance and production/operator activation, not missing product code. Real-domain acceptance, production credentials, DNS/TLS cutover, schedulers, external alerts, backup retention, and restore evidence remain tracked in the current documentation rather than this future roadmap.

## 3. Roadmap principles

- Preserve one unified user identity across platform, workspace, and future products.
- Authorise every action by active server-issued context and workspace membership.
- Keep provider-specific logic behind services and adapters.
- Maintain immutable commercial, tax, entitlement, and billing snapshots.
- Apply package entitlements before provider mutations.
- Encrypt credentials and avoid secrets in APIs, logs, and audit metadata.
- Preserve soft deletion and audit controls defined by the core platform.
- Never treat provider configuration or source code as deployment/acceptance evidence.
- Deliver initiatives in independently testable phases with rollback and migration plans.

## 4. Organisation collaboration

Planned capabilities:

- Organisation invitations with acceptance, expiry, resend, and revocation.
- Multiple organisation members and multiple Owners.
- Owner, Administrator, Billing Manager, Member, and custom workspace roles.
- Workspace permission editor and billing-only access.
- Final-Owner protection.
- Member and seat entitlements tied to package snapshots.
- Member suspension and access review.
- Ownership recovery and administrator-assisted disputes.
- Customer-facing Organisation-to-Personal reversion.
- Workspace merge and split workflows.
- Cross-workspace application, database, domain, subscription, and other resource transfers.
- Expanded transfer approvals beyond single-owner Personal Workspaces.

Key gates:

- Invitation-enumeration and privilege-escalation tests.
- Final-Owner and billing-authority invariants.
- Immutable audit trail for membership and ownership changes.
- Safe resource transfer with provider reconciliation and rollback.

## 5. Identity and authentication providers

Planned capabilities:

- Google Sign-In.
- Firebase SMS OTP where commercially and operationally appropriate.
- Additional federated providers through the existing identity abstraction.
- Account-linking and duplicate-identity resolution.
- Recovery procedures for lost phone access without weakening passwordless policy.
- Optional stronger factors for administrators and sensitive operations.
- Enterprise identity/federation evaluation in a later phase.

Password login remains explicitly excluded unless the product policy is separately changed through an approved security review.

## 6. Advanced application and deployment model

Planned capabilities:

- Multiple environments under one project: development, test, staging, and production.
- Environment-specific branches, variables, domains, databases, resources, and deployment history.
- Promotion workflows between environments.
- Preview deployments for pull requests.
- Rollback to verified revisions.
- Deployment approvals and protected production environments.
- Expanded source providers beyond GitHub.
- Monorepo and multi-service project improvements.
- Additional framework/runtime detection.
- Package-gated Dockerfile deployments after security hardening.
- Customer Docker/Compose support only with resource, network, image, and privilege restrictions.
- Build-cache, artifact, and deployment-retention controls.
- Zero-downtime/rolling deployment options where supported.

Customer-controlled Docker remains disabled until isolation, supply-chain scanning, privilege restrictions, resource enforcement, abuse policy, and incident response are accepted.

## 7. Multi-server placement and provider expansion

Planned capabilities:

- Multiple Coolify server connections.
- Placement policies based on environment, region, capacity, package, runtime, and compliance.
- Capacity-aware automatic placement.
- Application relocation between servers.
- Controlled evacuation of unhealthy or retiring servers.
- Regional application placement.
- Provider health scoring and maintenance windows.
- Additional hosting-provider adapters beyond Coolify.
- Provider-independent resource reconciliation.
- Cost and margin comparison across placements.

Placement must remain deterministic, auditable, entitlement-aware, and safe under concurrent provisioning.

## 8. Advanced databases

Planned capabilities:

- Dedicated database clusters for high-load tenants.
- AWS RDS or other managed database placement.
- Package-gated dedicated database plans.
- Customer remote database access through a per-database gateway.
- TLS, IP allowlists, rate limits, and audit controls for external access.
- Read replicas and higher-availability options where commercially justified.
- Point-in-time recovery options.
- Database migration between shared and dedicated placements.
- Expanded engine/version catalogue.
- Query, connection, storage, and performance visibility.

Customers must never receive shared-cluster superuser or cluster-administration privileges.

## 9. Advanced billing and commerce

Planned capabilities:

- Proration for upgrades, downgrades, add-ons, and mid-term changes.
- Automatic overage charging based on reconciled usage.
- Usage alerts and configurable spending controls.
- Multiple active product families where commercially required.
- Credits, account balances, and promotional grants.
- Invoice and tax expansion for additional jurisdictions.
- Refund automation and provider reconciliation improvements.
- Dunning and recovery for failed recurring payments.
- Seat-based organisation billing.
- Provider and infrastructure cost allocation.
- Margin dashboards and package recommendation tooling.
- Additional payment gateways and currencies.

Every billing change must preserve historical snapshots and require explicit audited migration for existing subscriptions.

## 10. Hosted email platform

Planned capabilities are defined in `HOSTED_EMAIL_PLATFORM_PLAN.md`:

- Stalwart mailbox and inbound-mail infrastructure.
- Native React/JMAP Ghost Deploy webmail.
- SES outbound relay on authenticated submission ports.
- Separate platform and customer-mail reputation boundaries.
- Mail domains, mailboxes, aliases, forwarding, quotas, and retention.
- Automatic MX, SPF, DKIM, DMARC, custom MAIL FROM, autoconfig, and autodiscover workflows.
- Abuse detection, rate limits, bounce/complaint processing, suppression, and audited suspension.
- Provider abstraction for later outbound relays.

Outbound mail uses an approved managed relay rather than direct EC2-to-recipient SMTP delivery.

## 11. DNS and domain expansion

Planned capabilities:

- Additional authoritative DNS-provider adapters.
- Advanced record types and DNSSEC visibility/workflows.
- Zone import/export improvements.
- Safer nameserver migration and rollback assistance.
- Domain-registration provider integrations where commercially approved.
- Domain renewal/expiry visibility.
- Certificate transparency and richer TLS monitoring.
- Delegation policies for larger organisations.
- Domain portfolio search, tagging, and bulk actions.
- Automated mail-related DNS provisioning for hosted email.

Ghost Deploy now exposes provider-neutral authoritative DNS hosting backed by a platform-managed adapter. The items above extend that delivered control plane; customers do not interact with or receive identifiers from the backing provider.

## 12. Server consolidation and host operations

The approved direction is documented in `SERVER_CONSOLIDATION_PLAN.md`:

- Consolidate aaPanel-hosted websites onto the existing Coolify server after read-only inventory.
- Use Coolify for application/database deployment and Cockpit for general host maintenance.
- Migrate sites incrementally with temporary domains and rollback copies.
- Account explicitly for mail, DNS zones, persistent files, databases, scheduled tasks, and non-web services.
- Retire the old server only after backup, DNS, traffic, and rollback acceptance.

This infrastructure programme is operational future work rather than a Ghost Deploy customer feature.

## 13. Observability, security, and operations maturity

Planned capabilities:

- Centralised metrics, logs, traces, and searchable deployment correlation.
- External error tracking and uptime monitoring integrated into platform status.
- Customer-visible resource health and incident history.
- Security-event aggregation and anomaly detection.
- Vulnerability and container-image scanning.
- Software-bill-of-materials and signed-artifact verification.
- Secret rotation workflows and expiry alerts.
- Backup-policy compliance and automated restore drills.
- Incident, maintenance, and status-page workflows.
- Regional retention, privacy, and data-export/deletion controls.
- Abuse reporting, investigation, suspension, and appeal tooling.

## 14. Customer and developer experience

Planned capabilities:

- Improved onboarding and migration assistants.
- Import from common hosting panels/providers.
- CLI and provider-neutral automation SDK.
- Webhooks and scoped API tokens for customers.
- Team activity feed and richer audit exports.
- Resource tagging, grouping, search, and saved views.
- Reusable application templates and organisation templates.
- Expanded documentation and guided remediation.
- Status, usage, billing, and deployment notifications with customer preferences.

## 15. Suggested delivery order

1. **Organisation collaboration:** multi-member roles, invitations, permissions, seats, and ownership safety.
2. **Project environments:** multi-environment projects, promotion, preview deployments, and rollback.
3. **Placement foundation:** multiple Coolify servers, capacity visibility, and explicit placement policies.
4. **Billing maturity:** proration, overages, dunning, credits, and seat billing.
5. **Database expansion:** dedicated/managed placement, external gateway, and advanced recovery.
6. **Hosted email foundation:** mail node, SES relay, domains/mailboxes, and anti-abuse controls.
7. **Native webmail:** JMAP inbox/composer, search, contacts, and calendar phases.
8. **Provider expansion:** additional source, hosting, DNS, payment, and outbound-mail providers.
9. **Enterprise/operations maturity:** federation, compliance, observability, security automation, and regional placement.

Actual ordering may change based on customer demand, infrastructure readiness, provider terms, security risk, and commercial value.

## 16. Initiative entry gate

Before any roadmap initiative becomes active implementation, approve:

- User and business objective.
- Explicit in-scope and out-of-scope behaviour.
- Tenancy and authorisation model.
- Package entitlements and billing impact.
- Schema and migration design.
- Provider/API dependencies and failure modes.
- Security, privacy, abuse, and compliance controls.
- Data migration and rollback.
- Monitoring, backup, recovery, and operational ownership.
- Acceptance tests and release evidence.

After delivery, update the authoritative requirements, traceability map, API/OpenAPI documentation, runbooks, environment examples, and this roadmap status.

## 17. Source documents

- `../IMPLEMENTATION_PLAN.md`
- `../SRS_TRACEABILITY.md`
- `../MVA_REQUIREMENTS.md`
- `../AUTHENTICATION_AND_ACCESS.md`
- `../WORKSPACES_CUSTOMERS_AND_ORGANISATIONS.md`
- `../PACKAGE_BILLING_AND_ENTITLEMENTS.md`
- `../SHARED_PLATFORM_ARCHITECTURE.md`
- `../DATABASE_AND_PORTABILITY.md`
- `HOSTED_EMAIL_PLATFORM_PLAN.md`
- `SERVER_CONSOLIDATION_PLAN.md`
