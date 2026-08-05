# Hosted Email Platform Plan

## 1. Objective

Add first-party hosted email to Ghost Deploy after the MVA. Customers will create mail domains, mailboxes, aliases, and forwarding rules from their workspace and use a native Ghost Deploy webmail experience. Ghost Deploy and Qubit Codes will use the same platform with stricter reputation isolation.

The preferred long-term interface is a custom React webmail client using JMAP. Roundcube is not the target interface. A temporary third-party webmail may be used only if it accelerates infrastructure validation without becoming a permanent product dependency.

## 2. Recommended architecture

```text
Inbound mail
Internet SMTP servers
  -> TCP 25
  -> Stalwart mail node
  -> mailbox storage
  -> JMAP/IMAP
  -> Ghost Deploy webmail

Outbound mail
Ghost Deploy webmail
  -> Stalwart authenticated submission
  -> managed outbound provider over TCP 587/465
  -> recipient mail server
```

Components:

- **Stalwart:** SMTP receiving, mailbox storage, IMAP, JMAP, CalDAV/CardDAV where enabled, filtering, and mailbox administration.
- **Ghost Deploy Mail:** workspace-aware mailbox control plane, native React/JMAP webmail, SSO, usage, billing, and audit history.
- **Amazon SES initially:** managed outbound delivery through authenticated SMTP on port 587.
- **External object storage:** encrypted mailbox and configuration backups with tested restoration.

Outbound delivery always uses an approved managed relay; the mail node does not deliver directly from EC2 to recipient mail servers.

## 3. Traffic and reputation separation

Platform mail and customer-hosted mail must not share one uncontrolled reputation boundary.

```text
AWS organisation
├── Platform transactional SES account
│   ├── OTP and security notifications
│   ├── Billing and invoices
│   └── Operational alerts
└── Hosted customer-mail SES account
    ├── Customer correspondence
    ├── Per-domain configuration sets
    └── Strong rate and abuse controls
```

Marketing or bulk email is a separate future product and must not use ordinary hosted-mail credentials or quotas.

Start with SES shared IPs. Dedicated IPs are appropriate only after sending volume is stable enough to maintain reputation and the cost and warm-up requirements are justified.

## 4. Customer-domain onboarding

For each mail domain, Ghost Deploy will:

1. Confirm workspace ownership or delegated approval through the existing domain-ownership system.
2. Create the mail-domain record and requested mailbox plan.
3. Create an outbound-provider domain identity.
4. Obtain DKIM verification records.
5. Provision or display required DNS records.
6. Verify MX, SPF, DKIM, DMARC, custom MAIL FROM, autoconfig, and autodiscover state.
7. Activate incoming mail only when routing is safe.
8. Activate outgoing mail only after provider identity verification.

Typical records include:

```text
MX      @                 mail.ghostdeploy.com
TXT     @                 SPF policy authorising the outbound provider
TXT     _dmarc            DMARC policy and aggregate reporting
CNAME   provider DKIM     provider verification targets
MX/TXT  bounce            custom MAIL FROM and SPF records
CNAME   autoconfig        client configuration endpoint
CNAME   autodiscover      client discovery endpoint
```

The existing DNS-management layer can create these records through configured Cloudflare, GoDaddy, Hostinger, and future provider adapters. Authoritative DNS remains hosted by the selected DNS provider.

## 5. Customer capabilities

Workspace mail administration:

- Mail domains and verification status.
- Mailboxes and quotas.
- Aliases and forwarding addresses.
- Catch-all policy.
- Shared addresses and distribution lists.
- Credentials and app passwords.
- Vacation responses and server-side filters.
- DKIM/SPF/DMARC health.
- Storage usage and package limits.
- Delivery, bounce, and complaint history where safe.
- Mailbox suspension, recovery, export, and deletion retention.
- Audited administrator support actions.

Native webmail:

- Responsive inbox and conversation views.
- Folders, labels, read/star/archive/spam actions.
- Fast search.
- Rich and plain-text composition.
- Attachments and upload limits.
- Drafts, scheduled send, signatures, and identities.
- Filters and vacation configuration.
- Contacts and calendars in a later webmail phase.
- Workspace switching and server-authorised SSO.
- Accessibility, keyboard navigation, and light/dark themes.

## 6. Outbound provider abstraction

Mail infrastructure must not be permanently coupled to SES. Define an adapter covering:

- Domain identity creation and verification records.
- Outbound SMTP/API credentials.
- Configuration sets or provider equivalents.
- Delivery, delay, bounce, complaint, rejection, and suppression events.
- Per-domain suspension.
- Provider health and quota reconciliation.

Initial provider: Amazon SES.

Potential later providers: SMTP2GO, Mailgun, SendGrid, MailChannels, or a provider selected for a particular region/use case. Transactional-only providers must not be used for general mailbox correspondence unless their terms and capabilities explicitly support it.

## 7. Anti-abuse and deliverability controls

No provider can guarantee inbox placement. Ghost Deploy must protect reputation through:

- Verified domains and mailbox ownership.
- SPF, DKIM, and DMARC alignment.
- Custom MAIL FROM where supported.
- Per-mailbox, per-domain, and per-workspace rate limits.
- Low initial daily limits with earned increases.
- Outbound spam and malware scanning.
- Dangerous attachment restrictions.
- Recipient and volume anomaly detection.
- Immediate bounce and complaint processing.
- Automatic recipient suppression after repeated permanent failures.
- Automatic mailbox/workspace suspension at defined risk thresholds.
- Separate bulk-mail approval and infrastructure.
- Audited review and reinstatement.

Suggested starting daily limits:

| Account state | Daily outbound limit |
| --- | ---: |
| New mailbox | 50 |
| Established verified mailbox | 250 |
| Trusted business workspace | 1,000 |
| Bulk or marketing sender | Separate product and approval |

Limits remain configurable package entitlements rather than hard-coded policy.

## 8. Data model direction

Expected entities include:

- `mail_domains`
- `mail_domain_verifications`
- `mailboxes`
- `mailbox_credentials`
- `mail_aliases`
- `mail_forwarders`
- `mail_distribution_lists`
- `mail_sending_identities`
- `mail_delivery_events`
- `mail_suppressions`
- `mail_usage_observations`
- `mail_retention_policies`
- `mail_exports`

All entities must preserve workspace ownership, soft deletion where applicable, encrypted credentials, audit history, and immutable billing/entitlement snapshots consistent with the core platform.

## 9. Security and operations

- Use a dedicated mail node and stable IP when moving beyond internal testing.
- Keep application deployments and mail reputation isolated.
- Require correct PTR/rDNS for the inbound mail hostname where relevant.
- Protect submission, IMAP, JMAP, and administrative endpoints with TLS.
- Keep the Stalwart administration surface private or tightly allowlisted.
- Encrypt mailbox backups and credentials.
- Test mailbox and domain-level restoration.
- Monitor queues, storage, malware/spam verdicts, authentication failures, bounces, complaints, and blocklists.
- Define abuse contacts, escalation paths, evidence retention, and emergency suspension.
- Never expose provider master credentials to customers.

## 10. Delivery phases

1. **Discovery and policy:** provider terms, data residency, retention, abuse policy, pricing, and package entitlements.
2. **Mail-node foundation:** Stalwart, TLS, inbound SMTP, mailbox storage, monitoring, backups, and restore drill.
3. **Outbound delivery:** SES accounts, domain identities, SMTP relay, configuration sets, and event ingestion.
4. **Workspace control plane:** domains, mailboxes, aliases, quotas, DNS verification, and audited lifecycle APIs.
5. **Initial webmail:** JMAP authentication, inbox, message view, composition, folders, attachments, and search.
6. **Deliverability and abuse:** reputation dashboards, automated limits, suppression, complaint response, and operator workflows.
7. **Collaboration:** contacts, calendars, shared mailboxes, distribution lists, and delegation.
8. **Provider resilience:** secondary outbound adapter, controlled failover, and regional placement.
9. **Commercial launch:** billing, support policy, migrations/imports, documentation, acceptance testing, and staged availability.

## 11. Acceptance gates

- Inbound and outbound delivery across Gmail, Microsoft, Yahoo, and representative custom domains.
- SPF, DKIM, and DMARC alignment verified from received-message headers.
- Bounce, complaint, delay, and suppression events reconciled correctly.
- Cross-workspace mailbox and domain isolation verified.
- Abuse limits and emergency suspension verified.
- Mailbox backup and restore accepted.
- Native webmail security, accessibility, and mobile usability accepted.
- Platform transactional reputation remains isolated from customer traffic.
- Operational owners accept monitoring, on-call, abuse, privacy, retention, and recovery procedures.
