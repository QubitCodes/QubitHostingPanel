# Visitor, Risk, and Product Intelligence Plan

## 1. Purpose and status

This document defines the approved future implementation of first-party product analytics, Fingerprint-enriched visitor recognition, observe-only security assessment, granular administrator access, and manually enforced security restrictions for Ghost Deploy.

This is an implementation plan, not evidence that Fingerprint, analytics collection, risk scoring, automated decisions, marketing campaigns, or visitor blocking are currently active. Production activation requires provider credentials, privacy review, migrations, retention configuration, acceptance tests, and an explicit rollout decision.

## 2. Product objectives

The system must:

- Understand how anonymous visitors, authenticated users, and workspaces use Ghost Deploy.
- Measure acquisition, onboarding, checkout, deployment, feature adoption, retention, and service preference.
- Recognise a previously observed browser or device without treating recognition as proof of a person's identity.
- Associate a visitor with a user only after successful authentication.
- Detect suspicious authentication, registration, checkout, and resource-consumption patterns.
- Produce a separate risk score and confidence score for every assessment.
- Begin in observation-only mode and never block automatically during the initial rollout.
- Allow explicitly authorised administrators to investigate evidence and apply reversible manual restrictions.
- Give Super Admin all intelligence permissions through seeded role assignments, never controller hardcoding.
- Expose per-user analytics, visitor associations, security assessments, and restrictions inside the administrator user module.
- Preserve purpose limitation between essential security processing, product analytics, personalisation, attribution, and marketing.

## 3. Non-goals and safety boundaries

The first release must not:

- Use a fingerprint as an authentication factor or automatically sign a visitor in.
- Reveal a user's identity or phone number on a logged-out page.
- Merge accounts because they share a device, browser, network, or location.
- Treat an IP address as a device or a person.
- Automatically block a user, visitor, phone identity, network, or payment.
- Permanently block an IP address through the intelligence module.
- Treat VPN, proxy, incognito mode, public Wi-Fi, or a shared device as sufficient proof of abuse.
- Store environment values, credentials, source files, OTP codes, complete payment data, or arbitrary frontend properties in analytics events.
- Use essential security data for marketing without the required disclosed purpose and preference.
- expose raw provider visitor IDs, raw user UUIDs, secrets, or unrestricted event payloads to administrators.

## 4. Conceptual architecture

The implementation is one intelligence platform with purpose-separated modules:

1. **Visitor identity foundation** correlates anonymous visits, browser installations, Fingerprint events, authenticated sessions, users, and workspaces.
2. **Security Intelligence** evaluates authentication and abuse signals, creates observe-only assessments, and supports reviewed manual restrictions.
3. **Product Intelligence** records strictly validated first-party events and derives funnels, adoption, retention, geography, service affinity, and segments.
4. **Consent and governance** controls purposes, retention, deletion, export, aggregation, and access.
5. **Administrator Intelligence** provides permission-gated platform dashboards and per-user investigation areas.

Security and analytics may share a pseudonymous internal visitor record. Their raw events, retention rules, permissions, decisions, and allowed uses remain separate.

## 5. Identity and correlation model

### 5.1 Existing identifiers

Ghost Deploy already creates a random browser-install identifier in local storage, submits it as `x-device-id`, hashes it on the server, and stores the hash with an authenticated session. Sessions also store bounded IP, user-agent, browser, operating-system, device, client-hint, network, location, sign-in, and last-active metadata.

OTP challenges already use an HMAC identity hash, masked destination, optional user association, hashed request IP, provider state, expiry, attempts, and authentication events.

These records remain valid and are extended rather than replaced.

### 5.2 Visitor recognition

The browser obtains a Fingerprint request ID. The backend retrieves the provider event using the secret Server API, validates it, hashes the provider visitor ID with a dedicated secret, and resolves or creates an internal visitor.

The client must never be trusted to submit a verified visitor ID, confidence value, risk signal, or user association. Browser input contains only the provider request ID and the existing installation ID. Provider results are fetched or verified server-side.

### 5.3 Authenticated association

After successful OTP verification, the backend associates the visitor with the authenticated user and current session. Before successful authentication, a requested phone number is represented by the existing HMAC identity hash.

Provider `linkedId` must use a pseudonymous value such as `HMAC(FINGERPRINT_LINK_SECRET, user_uuid)`. Raw user UUIDs, mobile numbers, email addresses, workspace IDs, and customer IDs must not be exposed as provider-linked identifiers.

One visitor may be associated with multiple users because of shared household, workplace, library, café, university, or managed devices. One user may be associated with multiple visitors. These are evidence links, not account ownership claims.

## 6. Proposed database model

All new tables use UUID primary keys, timestamps, soft deletion, relations, indexes, and the project's audit conventions.

### 6.1 Visitor foundation

#### `intelligence_visitors`

- Internal visitor ID.
- HMAC-hashed provider visitor identifier.
- HMAC-hashed browser-install identifier where available.
- First-seen and last-seen timestamps.
- First and latest coarse network/location summaries.
- Current provider confidence summary.
- Recognition state and data-quality state.
- Non-sensitive normalized metadata.

#### `intelligence_visitor_events`

- Visitor ID and provider request ID hash.
- Purpose: security, analytics, personalisation, or attribution.
- Provider region and event timestamp.
- Verification, freshness, origin, replay, and association results.
- Normalized signal snapshot.
- Raw provider responses must not be stored by default.

#### `intelligence_visitor_user_links`

- Visitor ID and user ID.
- First and latest authenticated association.
- Successful authentication count.
- Association confidence and supporting evidence count.
- State: observed, confirmed-by-authentication, disputed, or suppressed.

#### `intelligence_identity_attempts`

- Visitor ID, OTP challenge ID, and HMAC identity hash.
- First and latest attempt timestamps.
- Request, resend, failure, and success counts.
- Result and purpose.
- No readable phone number.

`user_sessions` gains nullable references for the internal visitor and verified Fingerprint request event. Existing sessions remain valid with null references.

### 6.2 Product analytics

#### `analytics_events`

- Immutable event ID, schema version, event name, and occurrence time.
- Anonymous visitor, authenticated user, workspace, session, application, or checkout references where relevant.
- Consent purpose and collection source.
- Strictly validated event-specific properties.
- Coarse country, region, city, and timezone when permitted.
- Campaign and referrer attribution identifiers when permitted.
- Ingestion, deduplication, and processing status.

High-volume implementation should use time-based partitioning or a separate analytics store after measured load justifies it. Initial PostgreSQL storage must have bounded retention, appropriate composite indexes, asynchronous aggregation, and no unbounded JSON queries in customer request paths.

#### `analytics_daily_aggregates`

- Date, metric, dimensions, distinct visitors/users/workspaces, event count, and confidence/data-quality indicators.
- Powers platform dashboards without scanning raw events.

#### `analytics_workspace_profiles`

- Adoption, activity, retention, lifecycle, and service-usage summaries for a workspace.
- Last calculated time and input coverage.

#### `analytics_service_affinities`

- User or workspace, service code, affinity score, confidence score, explanation codes, evidence window, and expiry.
- Examples include applications, managed databases, domains, DNS, cron jobs, backups, GitHub, Laravel, Node.js, and higher plan interest.

#### `analytics_segments`

- Administratively defined segment, purpose, rules, status, and minimum cohort size.

#### `analytics_segment_memberships`

- Segment, user/workspace, calculated time, expiry, score, confidence, and explanation codes.

#### `analytics_consent_preferences`

- Subject, purpose, status, source, policy version, jurisdiction context, granted/revoked times, and proof metadata.

#### `analytics_campaign_attributions`

- Pseudonymous visitor, approved campaign dimensions, first/last touch, conversion event, and attribution model.

### 6.3 Security intelligence

#### `risk_events`

- Normalized immutable security observation.
- Visitor, user, session, identity hash, challenge, checkout, application, or workspace references where applicable.
- Signal type, source, severity contribution, reliability contribution, occurrence time, and safe metadata.

#### `risk_assessments`

- Subject type and subject ID.
- Risk score from 0 to 100, displayed as 0.0 to 10.0.
- Confidence score from 0 to 100, displayed as 0.0 to 10.0.
- Assessment model/rules version.
- Observation window and evidence coverage.
- Classification, recommended action, current review state, and expiry.
- Observe-only decision state during initial rollout.

#### `risk_assessment_signals`

- Assessment, signal code, risk contribution, confidence contribution, direction, explanation, source event, and reliability tier.

#### `security_blocks`

- Scope: visitor, user, identity, session, OTP, registration, or checkout.
- Subject hash/reference, status, reason, evidence snapshot reference, creator, expiry, and revocation details.
- No permanent IP block scope in the initial module.

#### `security_block_actions`

- Immutable history of block creation, enforcement, expiry, failed enforcement, and revocation.

## 7. Event catalogue and validation

Every event name has a dedicated Zod schema shared by server producers and permitted client producers. Unknown properties are rejected rather than retained.

Initial event families:

- Acquisition: landing viewed, campaign attributed, plan viewed.
- Authentication: OTP requested, resent, failed, verified, login succeeded, session refreshed, session revoked.
- Commerce: checkout started, gateway reached, checkout failed, checkout completed, subscription activated, cancelled, or renewed.
- Workspace: workspace created, setup completed, context switched.
- Source: GitHub connection started/completed, repository selected, branch selected, source analysed.
- Application: form started, stack detected, application created, deployment started/succeeded/failed, application opened.
- Database: engine selected, database created, connected, credentials viewed or rotated, backup configured.
- Domain/DNS: domain added, verification started/completed, DNS hosted, record changed, application linked.
- Scheduled tasks: cron enabled, disabled, changed, or execution failed.
- Engagement: documentation opened, help viewed, onboarding step completed, feature prompt accepted/dismissed.

Analytics properties must never include secrets, source content, environment-variable values, OTP values, repository tokens, database passwords, card data, or complete phone numbers.

## 8. Risk and confidence model

Risk and confidence answer different questions:

- **Risk score**: how harmful or abusive the observed behaviour appears.
- **Confidence score**: how reliable and complete the evidence behind that conclusion is.

Both are stored as integers from 0 to 100 and displayed from 0.0 to 10.0. An assessment cannot be presented without both meters and a human-readable evidence explanation.

### 8.1 Signal reliability

Higher-reliability evidence includes:

- Fresh server-verified provider events.
- Repeated activity from a stable recognized visitor.
- Confirmed successful visitor-to-user authentication links.
- Bot or browser-tampering evidence corroborated by behaviour.
- Replayed provider request IDs.
- Repeated OTP identities, failures, trials, payments, or costly operations from the same visitor in a short window.

Lower-reliability context includes:

- Shared IP address.
- ASN, country, region, city, or timezone.
- VPN, proxy, incognito mode, or public network.
- Browser family, operating-system family, or common device model.
- A shared visitor linked to more than one authenticated user.

Shared networks are expected in workplaces, cafés, libraries, universities, homes, mobile carriers, and carrier-grade NAT. IP and location alone must never create a high-confidence person/device conclusion or justify a block.

### 8.2 Assessment lifecycle

1. Normalize observations into versioned risk events.
2. Evaluate deterministic rules and provider signals.
3. Calculate risk, confidence, evidence coverage, and explanations.
4. Persist the assessment and its signal contributions.
5. Display it in observe-only mode.
6. Permit an authorised administrator to dismiss, annotate, watch, or manually restrict.
7. Recalculate or expire assessments as evidence ages.

Machine-learning scoring is deferred until sufficient labelled evidence exists. Initial scores must be deterministic, testable, versioned, and explainable.

## 9. Product affinity and confidence

Service affinity also has two independent values:

- **Affinity score**: observed interest in or dependence on a service.
- **Confidence score**: strength and completeness of the behavioural evidence.

Example evidence:

- Repeatedly viewing a database option is weak interest evidence.
- Creating and connecting a database is stronger adoption evidence.
- Using backups repeatedly over several billing periods is strong sustained-affinity evidence.
- A single accidental page view must have low confidence.

Affinity must decay over time, expose explanation codes, and never be represented as a fact about the user's intentions.

## 10. Geography and cohort safeguards

- Use country, region, city, and timezone only when needed and permitted.
- Do not use precise latitude/longitude for marketing analytics.
- Describe network-derived location as approximate activity location, not residence.
- Suppress dashboard groups below a configurable minimum distinct-user threshold, initially 10.
- Prevent filter combinations that reveal an individual through a small cohort.
- Use aggregates for broad location and service comparisons.
- Treat VPN and network changes as uncertainty, not wrongdoing.

## 11. Consent, purpose, and retention

Purposes are independently configured:

1. Essential security and fraud prevention.
2. Product analytics.
3. Experience personalisation.
4. Marketing attribution.
5. Marketing communications.

Refusing analytics or marketing must not disable essential account security. Essential security data must not silently be reused for marketing.

The implementation requires:

- A versioned privacy notice and preference UI.
- Server-enforced purpose checks before event storage or downstream use.
- Configurable retention by data category and purpose.
- Raw-event expiry and longer-lived anonymized aggregates.
- User access/export and deletion/suppression workflows where applicable.
- Provider deletion workflows where supported.
- Jurisdiction-aware review before production activation.
- A privacy impact assessment before enabling Fingerprint for marketing or personalisation.

Suggested starting retention, subject to review:

- Raw product events: 90 days.
- Aggregated product metrics: 25 months.
- Unsuccessful anonymous identity attempts: 90 days unless attached to an active investigation.
- Security events and assessments: 12 months, extended only for documented investigation or legal need.
- Provider request references: shortest period required for verification and investigation.
- Revoked consent evidence: retained only as required to prove preference handling.

## 12. Permissions and Super Admin

Super Admin receives every permission through essential seeded role assignments. Controllers must not special-case a Super Admin user or role.

### 12.1 Security permissions

- `risk_intelligence.view`
- `risk_assessments.view`
- `risk_events.view`
- `risk_visitors.view`
- `risk_identity_links.view`
- `risk_assessments.review`
- `risk_blocks.view`
- `risk_blocks.create`
- `risk_blocks.revoke`
- `risk_data.export`

### 12.2 Analytics permissions

- `analytics.overview.view`
- `analytics_events.view`
- `analytics_users.view`
- `analytics_workspaces.view`
- `analytics_geography.view`
- `analytics_funnels.view`
- `analytics_segments.view`
- `analytics_affinities.view`
- `analytics_campaigns.view`
- `analytics_data.export`
- `analytics_settings.update`

### 12.3 Per-user sensitive permissions

- `user_tracking.view`
- `user_security_intelligence.view`
- `user_identity_links.view`
- `user_masked_identities.view`
- `user_tracking.export`

Collection reads, detail reads, identity-link reads, exports, assessment reviews, and block actions require their own permission. Page access never authorises sensitive API access.

## 13. Mandatory audit policy

The following administrator actions are always audited regardless of the optional general audit switch:

- Opening a user's tracking or security-intelligence area.
- Viewing visitor/user or visitor/identity associations.
- Viewing masked identity-attempt history.
- Viewing authentication or risk evidence.
- Exporting analytics, risk, visitor, user, or workspace intelligence.
- Reviewing, annotating, dismissing, or escalating an assessment.
- Creating, extending, expiring, or revoking a restriction.
- Updating analytics, scoring, consent, retention, or provider configuration.

Audit metadata records actor, permission, target, purpose, reason where required, IP, user agent, timestamp, result count, and action result. It must not contain raw provider payloads, readable phone numbers, secrets, OTPs, or exported content.

## 14. Administrator user module

The existing user detail surface gains independently permissioned areas:

- Tracking overview.
- Activity timeline.
- Product analytics.
- Service affinities.
- Segment memberships.
- Sessions and recognized visitors.
- Authentication and masked identity attempts.
- Security assessments and evidence.
- Active and historical restrictions.
- Intelligence audit history.

Each view must explain whether a value is observed, inferred, approximate, or confirmed by authentication. Risk, affinity, and recommendation cards always show confidence and evidence coverage.

## 15. Platform intelligence modules

### 15.1 Security Intelligence

- Overview and provider health.
- Assessment queue with risk and confidence filters.
- Visitor investigation timeline.
- User and masked-identity associations.
- Manual restriction registry.
- Reviewed/dismissed cases.
- OTP, registration, checkout, and resource-abuse trends.

### 15.2 Product Intelligence

- Acquisition and campaign attribution.
- Registration, checkout, onboarding, and deployment funnels.
- Feature adoption and failure points.
- Stack, framework, database, domain, DNS, cron, backup, and GitHub usage.
- Retention, churn indicators, and lifecycle cohorts.
- Geographic aggregates with small-cohort suppression.
- Service affinity and plan-interest analysis.
- Segment builder and membership explanations.
- Event quality, coverage, consent, and retention health.

Marketing message delivery is not part of this module. Future campaign tools may consume approved segments only after a separate permission, consent, frequency, unsubscribe, and provider-delivery design.

## 16. Manual restriction workflow

Initial supported scopes:

- Visitor restriction.
- User restriction.
- HMAC phone-identity restriction.
- Session revocation.
- OTP request restriction.
- Registration restriction.
- Checkout restriction.

Every restriction requires a dedicated permission, reason, evidence reference, confirmation, creator, creation time, optional expiry, and an available revocation path. High-impact or permanent restrictions should support later dual approval.

Observation mode disables automatic enforcement from a score. A manual restriction is an explicit administrator decision and is enforced only in its selected scope. Restricting OTP must not accidentally disable unrelated authenticated workspace operations unless the administrator separately restricts the user.

## 17. Provider and platform configuration

Fingerprint configuration must support encrypted platform settings with environment fallback:

- Public agent key.
- Server API secret.
- Region, initially evaluated for Asia/Mumbai.
- First-party proxy/endpoint configuration.
- Zero Trust or sealed-result mode where supported.
- Request-filtering/origin rules.
- Event maximum age and replay window.
- Observation/enforcement mode.
- Provider timeout and fail-open/fail-closed policy per operation class.

Secrets use the existing encrypted credential service and never appear in normal settings responses, logs, audit metadata, or client bundles. Provider validation must be a separate permissioned action.

## 18. API and service design

API routes remain thin entry points. Controllers perform validation and call dedicated services.

Planned services:

- `fingerprintProviderService`: provider requests and normalized responses.
- `visitorResolutionService`: installation/provider visitor resolution and replay protection.
- `visitorAssociationService`: authenticated user and identity links.
- `analyticsEventService`: validated ingestion and consent enforcement.
- `analyticsAggregationService`: daily metrics, funnels, cohorts, and data quality.
- `serviceAffinityService`: explainable affinity and confidence calculation.
- `riskEventService`: normalized observations.
- `riskAssessmentService`: versioned deterministic score and confidence calculation.
- `securityRestrictionService`: manual restriction validation and enforcement.
- `intelligenceGovernanceService`: retention, deletion, export, and suppression.

State-changing APIs use strict JSON, shared Zod schemas, `@qubitcodes/qcresp`, dedicated permissions, and detailed OpenAPI definitions. List APIs enforce authorization before filtering, limiting, or aggregation.

## 19. Performance and reliability

- Do not call Fingerprint on every page view; use selected meaningful events.
- Do not block the page-render path on analytics ingestion.
- Queue aggregation and non-critical event processing.
- Deduplicate provider request IDs and client event IDs.
- Bound event property sizes and batch sizes.
- Use daily aggregate tables for dashboards.
- Apply retention in resumable batches.
- Monitor ingestion lag, provider failures, assessment failures, duplicate rates, consent rejection, and storage growth.
- During observation mode, provider or analytics failure must not prevent OTP, login, checkout, or normal resource operations.
- Later sensitive-action enforcement must define explicit fail-open or step-up behaviour per action; it must not inherit a global default accidentally.

## 20. Delivery phases

### Phase 0: governance and acceptance

- Approve purposes, notices, retention, jurisdiction handling, processor terms, and provider region.
- Define event catalogue, restricted fields, score semantics, and operational owners.
- Approve observation-only success and exit criteria.

### Phase 1: schemas and permissions

- Add visitor, analytics, risk, restriction, consent, and aggregate schemas and relations.
- Generate raw SQL migration.
- Seed every permission and assign all to Super Admin through the role model.
- Add migration and seed tests.

### Phase 2: provider foundation

- Add encrypted settings and environment fallback.
- Implement validation, Server API retrieval, origin/freshness checks, request deduplication, visitor hashing, and safe normalization.
- Add provider-health visibility.

### Phase 3: visitor and authentication integration

- Collect provider request IDs at OTP request, resend, verification, handoff, and session creation.
- Link visitors to users only after successful authentication.
- Record identity attempts with HMAC identity hashes.
- Preserve current authentication behaviour when the provider is unavailable.

### Phase 4: first-party analytics

- Implement consent-aware validated ingestion.
- Instrument the approved event catalogue.
- Add asynchronous daily aggregation.
- Verify that restricted data cannot enter analytics properties.

### Phase 5: observe-only risk engine

- Add deterministic versioned rules.
- Calculate independent risk and confidence.
- Add evidence explanations, ageing, recalculation, and expiry.
- Verify that no score can enforce a restriction.

### Phase 6: administrator interfaces

- Add Security Intelligence and Product Intelligence navigation.
- Add dashboards, queues, timelines, funnels, affinities, cohorts, geography, and provider health.
- Extend user detail pages with tracking, analytics, visitor, risk, identity, restriction, and audit sections.
- Enforce page, API, field, export, and action permissions.

### Phase 7: manual restrictions

- Add permissioned restriction creation, expiry, enforcement, and revocation.
- Add mandatory reasons, evidence references, confirmations, and audit entries.
- Test scope isolation and emergency revocation.

### Phase 8: governance operations

- Add retention workers, exports, deletion/suppression, consent history, and aggregate anonymization.
- Add operational dashboards, alerts, runbooks, and provider-failure procedures.

### Phase 9: controlled production rollout

- Activate for internal and approved test users.
- Run observation-only until sample size and review quality meet agreed thresholds.
- Measure false associations, shared-network behaviour, confidence calibration, and provider coverage.
- Approve individual automated step-up or throttling rules separately; broad automatic blocking remains excluded.

## 21. Testing and acceptance

Required automated coverage:

- Schema, relations, indexes, soft deletion, and migration rollback/forward safety.
- Permission denial for every read, export, review, and restriction action.
- Super Admin access through seeded permissions rather than hardcoded bypass.
- Server-side verification, freshness, origin, request replay, timeout, and provider failure.
- Visitor-to-user association only after successful authentication.
- Multiple users per visitor and multiple visitors per user.
- Shared-IP and public-network scenarios do not produce high-confidence identity conclusions by themselves.
- Risk and confidence remain independent and bounded.
- Affinity and confidence remain independent, explainable, and time-decayed.
- Observation mode cannot create or enforce an automatic restriction.
- Manual restriction scope, expiry, revocation, and audit behaviour.
- Consent-purpose separation and revoked-preference enforcement.
- Restricted-field rejection and secret-leak tests for every analytics producer.
- Cohort suppression and geographic privacy.
- Retention, deletion, suppression, export, and provider cleanup.
- Aggregate accuracy and idempotent job retries.
- API documentation and standardized response contracts.
- Mobile, tablet, desktop, light, and dark administrator UI.

Production acceptance also requires:

- Privacy and legal review appropriate to launch jurisdictions.
- Provider credentials and origin restrictions.
- Documented data map and retention schedule.
- Test-user evidence for visitor recognition and shared-device cases.
- False-positive review and confidence calibration.
- Load/storage estimates and backup/restore validation.
- Incident response and provider-outage runbook.
- Explicit approval to remain observe-only or enable a narrowly defined enforcement rule.

## 22. Documentation updates on delivery

Each implemented phase must update:

- `Docs/SRS_TRACEABILITY.md`.
- `Docs/AUTHENTICATION_AND_ACCESS.md`.
- `Docs/ADMIN_CUSTOMER_CONTROL.md`.
- `Docs/PRODUCTION_OPERATIONS_RUNBOOK.md`.
- `Docs/INFRASTRUCTURE_REQUIREMENTS.md`.
- `.env.example` and platform-setting documentation.
- OpenAPI/Scalar schemas and endpoint descriptions.
- This future-plan index and roadmap status.

No phase may be described as deployed or accepted solely because its source code, migration, configuration fields, or provider credentials exist.
