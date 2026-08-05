# Production operations runbook

## Release gate

Before production traffic, require all of the following: production `APP_URL`; final DNS and TLS; restricted database management ports; production payment credentials/webhooks; Coolify production connection; off-host encrypted backups; external uptime/error alerts; reverse-proxy rate limits; and an accepted restore drill. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run db:migrate`, and `npm run operations:readiness` against the release environment.

For the isolated staging control plane, run `npm run staging:deploy:panel` from the local operator checkout. The command only creates or reuses `ghost-deploy-staging`, installs its environment without logging secret values, disables development authentication bypass, retains test payment mode from `.env`, and queues the pushed `main` branch for `https://staging.ghostdeploy.com`. No separate panel-domain alias is configured while the platform uses same-domain mode. The command refuses to run from the deployed production-mode process.

## Scheduled operations

- Every 5 minutes: `npm run jobs:process` and alert on exhausted/failed jobs.
- Every 15 minutes: `npm run provider:reconcile` and `npm run usage:observe`.
- Every 15 minutes: `npm run operations:readiness`; exit code `2` means an actionable anomaly.
- Daily: database backups, encrypted artifact verification, expired-backup cleanup, payment pending-age review, and provider reconciliation review.
- Daily: back up the `ghostdeploy-pdns-data` volume and `/opt/ghostdeploy-dns/pdns.env`; verify an authoritative SOA response from an external resolver.
- Weekly: restore a disposable PostgreSQL and MySQL logical database, validate public HTTPS, and review audit logs/admin overrides.
- Quarterly: create a new Coolify token, rotate it in the panel, verify reconciliation, then revoke the retired token at Coolify.

Alert when any provider is unhealthy/stale for one hour, reconciliation is partial/failed, a payment remains pending for one hour, a provisioning job exhausts retries, usage observations are older than one day, backup creation fails, or public health/TLS fails.

## Application domain operations

Authoritative DNS provisioning resolves encrypted database-managed Cloudflare credentials first and uses `CLOUDFLARE_DNS_API_TOKEN` plus `CLOUDFLARE_DNS_ACCOUNT_ID` only as a recovery fallback. Platform Settings stores masked Cloudflare, GoDaddy, and Hostinger connections encrypted at rest. A customer may instead supply a one-time GoDaddy/Hostinger token, which is used for that request only and never persisted. Configure stable ingress IPv4/IPv6 values before expecting managed subdomain A/AAAA creation.

## Monitoring and alert delivery

The application emits durable state through provisioning jobs, provider reconciliation runs, payment attempts/checkouts, usage observations, backup records, and audit logs. The deployment owner must connect `npm run operations:readiness` and scheduler exit failures to one external on-call destination before production traffic. Supported deployment-neutral destinations are an HTTPS webhook handled by the operator's monitoring service, an uptime monitor for `/api/v1/health`, and centralized process/reverse-proxy logs.

Required alert ownership:

- Primary: platform operations on call.
- Secondary: billing owner for payment anomalies; infrastructure owner for provider, backup, DNS, TLS, or capacity anomalies.
- Every alert must include environment, affected provider/workspace/resource where safe, first observation time, current state, runbook link, and correlation/job ID. Never include credentials, OTP values, authorization headers, database passwords, or decrypted backups.
- Warning alerts may group for fifteen minutes. Failed backups, exhausted provisioning retries, public health failure, and payment-signature anomalies page immediately.
- Recovery notifications must use the same incident correlation key so the destination closes the active incident rather than opening another.

## Ingress rate-limit policy

Rate limiting is enforced at the production reverse proxy or edge so rejected traffic does not consume application workers. Preserve standard JSON responses for `/api/**`, return HTTP 429, retain the client IP through a trusted-proxy configuration, and key authenticated limits by both session/user and IP where supported.

Minimum starting limits per source IP:

- OTP request and resend: 5 requests per 15 minutes, burst 2; application identity cooldown remains authoritative.
- OTP verification: 10 attempts per 15 minutes, burst 3; challenge attempt caps remain authoritative.
- Login/session refresh: 30 requests per minute.
- Checkout initiation and payment callbacks: customer initiation 10 per minute; provider callbacks use signature verification and a provider allowlist where published, not a shared customer bucket.
- Upload and DNS import: 10 requests per minute with body-size and execution-time limits.
- Authenticated JSON APIs: 120 requests per minute, burst 30.
- Public catalogue/health: 300 requests per minute, burst 60; health monitoring must use a separately allowlisted probe where necessary.
- Internal job endpoints: network allowlist plus internal secret, 30 requests per minute.

Record aggregate rejection counts and route classes, not sensitive request bodies. Review limits after observing legitimate staging traffic; an adjustment requires an operations change record.

## Production activation ownership

The following cannot be completed safely in source control and remain assigned deployment actions:

- Infrastructure owner: production Coolify capacity, DNS, TLS, private database management ports, off-site backup storage, reverse-proxy limits, schedulers, log retention, uptime monitor, and alert transport.
- Billing owner: production PayU/Razorpay credentials, callback URLs, webhook secrets, and settlement/refund operating access.
- Platform owner: production MSG91 credentials/templates, encryption/JWT/internal secrets, DNS-provider connections, Super Admin bootstrap, and final readiness acceptance.
- Security owner: least-privilege review, network allowlists, secret rotation evidence, dependency/container findings, and incident-contact validation.

Do not mark an item complete from configuration text alone. Activation evidence must include the effective environment, public/direct health where applicable, scheduler execution, alert receipt, and restore/rollback ownership. These checks remain deliberately outside the present no-testing scope.

- DNS TXT verification proves ownership only. A verified custom hostname enters `provisioning` TLS state after Coolify accepts the proposed hostname set.
- Use the customer `Check TLS` action after DNS and certificate issuance settle. Any HTTPS response proves the TLS handshake; the application response code does not need to be successful.
- Provider hostname changes are applied before their matching database mutation. A provider rejection therefore leaves the prior enabled-domain set intact in the panel.
- Removing a custom domain first detaches it from Coolify and then soft-deletes it. The platform domain cannot be removed, and the current primary cannot be removed without another enabled verified domain.
- If provider state is suspected to have drifted, run provider reconciliation before retrying the domain mutation. Do not manually delete the domain row.

## Incident and rollback

1. Declare owner, severity, start time, customer impact, and frozen change scope.
2. Preserve logs, audit events, provider reconciliation runs, payment events, and database backups.
3. Stop only the affected worker/provider connection. Never delete ownership, checkout, subscription, or provider records to “retry.”
4. Roll application code back to the last verified commit. Roll schema forward with a corrective migration; never rewrite applied migrations.
5. Re-run provider reconciliation, usage observation, payment anomaly report, direct upstream health, and public HTTPS.
6. Record recovery time, root cause, affected records, corrective controls, and follow-up owner.

For provider failure, disable the affected connection and preserve imported snapshots. For payment failure, do not manually mark a payment verified without provider evidence; replay the signed webhook/callback or reconcile through the provider dashboard. Verified payments are monotonic and cannot be downgraded by later failed events.

## Suspension and cancellation

Use the audited admin subscription lifecycle. Suspension blocks new resource mutations while preserving data. Customer cancellation remains reversible until term end. Add-ons cancel independently. Permanent resource removal occurs only after retention expiry, backup confirmation, and an audited explicit action.

## Backup and token drills

The staging PostgreSQL/MySQL backup/restore drill and encrypted artifact verification are recorded in the implementation plan. The database-managed Coolify token drill validated a candidate before activating version 2 and retiring version 1. Production completion additionally requires revoking the retired token in Coolify and performing the same restore drill against production-grade backup storage.

### Coolify disaster recovery

Do not treat the Coolify dashboard container as a complete backup. A recoverable installation includes its PostgreSQL data, Redis state where required by the installed release, SSH keys, application and proxy configuration, and Docker volumes. Customer application data and databases need their own backups.

- Keep the active Coolify host and backup host independent. Never run two active control planes against the same Docker hosts, volumes, or database.
- Use Coolify's supported database backup process, then archive configuration and named volumes from a consistent snapshot.
- Encrypt archives before sending them off-host. aaPanel may store and rotate the encrypted artifacts; an aaPanel Docker project containing only a copied Coolify container is not a valid standby.
- Restore on an isolated host using a compatible Coolify release, validate data and secrets, reconnect managed servers, and promote it only during a documented recovery.
- Test restoration regularly. A backup that has not been restored and checked is not recovery evidence.

The backup target must not be the same disk or EC2 instance as active Coolify. Retain at least one additional off-site or object-storage copy.

## Security review

- Secrets are encrypted at rest and omitted from APIs/audit metadata; provider snapshots recursively remove credential-like properties.
- Admin APIs require explicit permissions; customer queries enforce workspace membership before limits.
- Payment callbacks/webhooks verify provider signatures, amount, currency, unique event keys, and monotonic verified state.
- OTP requests use identity cooldown and verification attempt caps. Production ingress must additionally rate-limit OTP, auth, payment, upload, and internal endpoints by IP/path.
- Internal worker endpoints require their dedicated secret. Rotate all environment secrets before launch and after suspected exposure.
- Keep PostgreSQL/MySQL management endpoints private or IP-restricted with TLS. Never expose Coolify or database administrator credentials to customers.
