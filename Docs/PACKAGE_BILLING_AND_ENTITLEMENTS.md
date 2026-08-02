# Packages, Billing, Offers, and Entitlements

## 1. Commercial model

Keep product definition, term pricing, promotions, purchases, and usage limits separate.

```text
Package
  Package prices by currency and term
  Package entitlements
  Eligible offers

Subscription
  Purchased price snapshot
  Purchased entitlement snapshots
  Workspace ownership
  Payment and lifecycle state
```

## 2. Package prices

Packages may optionally belong to an active package category such as VPS Hosting or Shared Hosting. The category relationship is nullable so uncategorised packages remain valid. Package slugs are the stable human-readable administration identifiers.

Each package may independently enable a trial using a positive whole-number duration and one calendar-aware unit: day, week, or month. Disabled trials retain no duration fields. Trial eligibility and expiry are always calculated by the server; month trials use calendar-month arithmetic rather than a fixed 30-day conversion.

Each price record defines:

- Package.
- Currency.
- Billing interval (`month` or `year`).
- Interval count, allowing 1 month, 1 year, 2 years, 3 years, and future terms.
- List price.
- Sale price where explicitly configured.
- Effective dates.
- Active/public flags.
- Tax behavior.

Multi-year prices are explicit commercial records. Do not derive them only from monthly price multiplication.

## 3. Offers

An offer contains:

- Name and optional coupon code.
- Percentage, fixed amount, or explicit promotional price.
- Currency where applicable.
- Eligible packages and price terms.
- Active period.
- New-customer restriction.
- Minimum term.
- Maximum global and per-customer redemption.
- Stackability policy.
- Priority and status.

Checkout evaluates offers server-side and records the applied rule and calculated discount in the purchase snapshot.

## 4. Workspace billing profiles

Billing details belong to a workspace and are immutable once used.

- Each update creates a new version and advances the workspace's current billing-profile reference.
- Checkouts, subscriptions, payment attempts, transactions, and invoices link to the exact billing-profile version used.
- A permitted owner may clone billing details from another accessible workspace.
- Cloning creates an independent version and records source workspace, source version, actor, and timestamp.
- User-profile changes and later source-workspace changes cannot rewrite billing history.

## 5. Subscription lifecycle

Initial states:

```text
pending -> active -> past_due -> suspended -> cancelled -> expired
```

Payment success is accepted only from a verified provider webhook or an explicitly audited administrative workflow. Provisioning must be idempotent and must not begin from an unverified browser redirect alone.

Each workspace has at most one active primary hosting subscription during the MVA. Add-ons are independently snapshotted subscription items owned by the same workspace.

## 6. Entitlements

An entitlement definition includes:

- Stable code.
- Display name and description.
- Numeric, boolean, or unlimited value.
- Unit.
- Enforcement mode.
- Optional reset period.
- Whether customer-visible.

Recommended initial codes:

```text
servers.count
applications.count
databases.count
storage.total_gb
storage.database_gb
domains.count
backups.enabled
backups.retention_days
compute.cpu_cores
compute.memory_mb
bandwidth.monthly_gb
organisation.members.count
```

## 7. Enforcement

Before a resource mutation:

1. Validate active workspace context and membership.
2. Validate active subscription.
3. Read the subscription entitlement snapshot.
4. Read locked/reconciled usage and pending reservations.
5. Apply enforcement mode.
6. Reserve capacity transactionally.
7. Queue an idempotent provisioning job.
8. Reconcile the result with Coolify.

Pending jobs count toward limits so concurrent requests cannot exceed a quota.

Measured usage contains source, measured value, observation time, and freshness status. The interface must distinguish actual, reserved, and stale usage.

## 8. Upgrades, downgrades, and package edits

- Editing a package changes future purchases only.
- Existing subscriptions retain snapshots.
- Upgrade/downgrade workflows calculate new terms explicitly.
- Downgrades that conflict with current usage require remediation or a scheduled change.
- Manual entitlement overrides require scope, reason, actor, start/end timestamps, and audit history.

## 9. Transactional email and cost review

- Amazon SES allowances are measured per recipient, not per API request or mailbox.
- Included monthly recipient limits are package entitlements and are snapshotted at purchase.
- Optional recipient add-ons are separate products; they do not provide IMAP mailboxes.
- Removing a price stops future purchases only. Active assignments retain it through `term_ends_at`.
- Publishing requires an approved cost review covering Mumbai-region compute, EBS, S3, transfer, SES, support, payment fees, and tax assumptions.
- Cost reviews store server-calculated margin basis points and their evidence notes; a later review does not rewrite prior reviews.

## 10. Public catalogue and checkout quotes

- Public catalogue reads are database-filtered to published packages, active public prices, and customer-visible entitlements.
- Checkout clients submit a price identifier and optional coupon only; submitted totals are never accepted.
- The server checks offer dates, eligibility, global limits, stacking, and coupon state before calculating the discount.
- New-customer-only offers are not applied by the anonymous quotation endpoint; they require verified customer context later in checkout.
- Quotes contain server-owned subtotal, discount, tax, and total amounts and are signed with a separate secret for a short expiry window.

## 11. Initial publication decision

- Launch, Growth, and Business use pooled Mumbai capacity and are approved for initial publication with conservative monthly allocations of ₹180, ₹350, and ₹700 respectively.
- Those allocations include compute, gp3 storage, S3 backups, SES recipients, internet transfer, monitoring, support, payment fees, and contingency.
- Cloud 2 GB, Cloud 4 GB, and Cloud 8 GB remain draft until exact Mumbai instance, public IPv4, EBS, transfer, support, and Savings Plan quotations are recorded.
- One-, two-, and three-year prices are explicit database records. Initial two-/three-year suggestions equal 20 and 30 monthly payments and remain independently editable.
