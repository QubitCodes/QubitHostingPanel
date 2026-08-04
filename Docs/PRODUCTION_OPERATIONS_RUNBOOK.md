# Production operations runbook

## Release gate

Before production traffic, require all of the following: production `APP_URL`; final DNS and TLS; restricted database management ports; production payment credentials/webhooks; Coolify production connection; off-host encrypted backups; external uptime/error alerts; reverse-proxy rate limits; and an accepted restore drill. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run db:migrate`, and `npm run operations:readiness` against the release environment.

For the isolated staging control plane, run `npm run staging:deploy:panel` from the local operator checkout. The command only creates or reuses `qubit-hosting-panel-staging`, installs its environment without logging secret values, disables development authentication bypass, retains test payment mode from `.env`, and queues the pushed `main` branch for `https://panel.apps-staging.qubit.codes`. The intended `panel-staging.qubit.codes` alias remains configured but requires its DNS A record to target the workload server. The command refuses to run from the deployed production-mode process.

## Scheduled operations

- Every 5 minutes: `npm run jobs:process` and alert on exhausted/failed jobs.
- Every 15 minutes: `npm run provider:reconcile` and `npm run usage:observe`.
- Every 15 minutes: `npm run operations:readiness`; exit code `2` means an actionable anomaly.
- Daily: database backups, encrypted artifact verification, expired-backup cleanup, payment pending-age review, and provider reconciliation review.
- Weekly: restore a disposable PostgreSQL and MySQL logical database, validate public HTTPS, and review audit logs/admin overrides.
- Quarterly: create a new Coolify token, rotate it in the panel, verify reconciliation, then revoke the retired token at Coolify.

Alert when any provider is unhealthy/stale for one hour, reconciliation is partial/failed, a payment remains pending for one hour, a provisioning job exhausts retries, usage observations are older than one day, backup creation fails, or public health/TLS fails.

## Application domain operations

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

## Security review

- Secrets are encrypted at rest and omitted from APIs/audit metadata; provider snapshots recursively remove credential-like properties.
- Admin APIs require explicit permissions; customer queries enforce workspace membership before limits.
- Payment callbacks/webhooks verify provider signatures, amount, currency, unique event keys, and monotonic verified state.
- OTP requests use identity cooldown and verification attempt caps. Production ingress must additionally rate-limit OTP, auth, payment, upload, and internal endpoints by IP/path.
- Internal worker endpoints require their dedicated secret. Rotate all environment secrets before launch and after suspected exposure.
- Keep PostgreSQL/MySQL management endpoints private or IP-restricted with TLS. Never expose Coolify or database administrator credentials to customers.
