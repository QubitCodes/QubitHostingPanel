# SRS Traceability Audit

## Scope and result

This audit maps the authoritative MVA requirements to the current application surface. The MVA has no known unimplemented product feature. The only open Phase 6 item is real-domain staging acceptance, which is verification rather than missing code. Production activation is operator/environment work. Items explicitly listed as out of scope or deferred are not release gaps.

## Requirement map

| Requirement area | Implementation evidence | Status |
| --- | --- | --- |
| OTP-only unified identity | `AuthController`, OTP challenge/session schemas, `/login`, `/login/verify/:challengeId`, profile and context APIs | Implemented |
| Admin lifecycle and authorization | Admin, role, permission, override, session, authentication-event, and audit controllers/pages under `/admin` | Implemented |
| Packages, prices, offers, and entitlements | Package/offer controllers, public catalogue and quote APIs, immutable pricing and entitlement schemas | Implemented |
| Public acquisition | Responsive landing page, catalogue, term selection, login and registration entry | Implemented |
| Purchase-first customer/workspace onboarding | Customer checkout, setup, billing profiles, workspaces, memberships, organisation extension, ownership transfer | Implemented |
| Payments and immutable snapshots | Mock, PayU, and Razorpay boundaries; attempts/webhooks; subscription, offer, tax, billing, and entitlement snapshots | Implemented |
| Customer dashboard access after checkout attempt | Server-authorized dashboard capability, checkout history/state, workspace selector, subscription/billing/security views | Implemented |
| Usage policies and reservations | Entitlement enforcement, transactional reservations, measured observations, overrides, customer/admin usage views | Implemented |
| Coolify provider operations | Encrypted connections, validation/rotation, reconciliation, jobs, retries, admin health and provisioning views | Implemented |
| Runtime-backed applications | Admin runtime catalogue; application create/view/edit, Git source, runtime selection, database bindings, domains, logs, deployments | Implemented |
| Shared logical databases | Cluster management, PostgreSQL/MySQL allocation, restricted credentials, reveal/rotation, customer views, backups/restores | Implemented |
| Domain ownership and routing | Workspace ownership registry, parent protection, cross-workspace subdomain approval, multi-domain applications, platform fallback, TLS state | Implemented; live acceptance pending |
| DNS management | Root-domain inventory, public/BIND/provider capture, encrypted platform credentials, Cloudflare provisioning, delegation refresh, managed A/AAAA lifecycle | Implemented; live acceptance pending |
| Production operations | Readiness report, reconciliation/usage/job commands, backup and incident runbooks, monitoring thresholds, ingress limit policy, owner matrix | Source-control preparation complete; activation pending |

## Deliberately pending verification

- Real-domain ownership and delegation.
- Cross-workspace subdomain approval and revocation.
- Certificate issuance and TLS refresh.
- Primary-domain switching and safe platform-subdomain removal.
- Full registration/payment/deployment regression requested by the product owner.

These remain pending without changing feature-completion status.

## Operator-supplied production state

- Production domains, DNS records, certificates, infrastructure capacity, and network restrictions.
- Payment, MSG91, Coolify, DNS-provider, encryption, JWT, internal-job, backup, monitoring, and alert-delivery credentials/configuration.
- Scheduler installation, external uptime/error monitoring, alert receipt, backup retention, restore drill, and secret-rotation evidence.

## Deferred roadmap

See `future-plans/NON_MVA_ROADMAP.md` for the consolidated initiatives, delivery order, and entry gates.

Organisation invitations and multi-member roles, multiple organisation Owners, seat enforcement, recovery/dispute workflows, workspace merge/split/resource transfer, customer Organisation-to-Personal reversion, Firebase/Google identity, automatic multi-server placement, dedicated high-load database placement, proration/automatic overage charging, and providers beyond Coolify remain explicitly outside the MVA.
