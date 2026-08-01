# Minimum Viable Application Requirements

## 1. MVA objective

Deliver the commercial, identity, authorization, onboarding, and entitlement foundation required to sell hosting plans safely. Full customer-driven infrastructure management is not required in the first milestone.

## 2. Admin module

The MVA shall provide:

- OTP-only administrator login.
- Admin list, detail, activation, suspension, and soft deletion.
- Admin roles and permission assignments.
- Individual admin permission overrides.
- Session and authentication-event visibility.
- Audit history.
- Dashboard summaries for customers, organisations, subscriptions, usage, and alerts.

Super Admin is established through controlled essential-data seeding. It is not hardcoded into controllers. Super Admin identities and roles are hidden from non-Super-Admin list queries at database-query level.

## 3. Platform roles and permissions

Initial platform roles:

- Super Admin.
- Administrator.
- Billing Manager.
- Support Operator.
- Read-only Operator.

Permissions are granular and action-based, including admin management, role management, packages, offers, customers, organisations, subscriptions, usage, servers, and audit logs.

Effective platform permission:

```text
role permissions + explicit user allows - explicit user denies
```

Explicit deny takes precedence. Each individual override stores a reason, assigning user, optional expiry, and audit record.

## 4. Packages

Administrators can:

- Create, edit, publish, unpublish, archive, and soft-delete packages.
- Define display name, slug, description, features, ordering, and visibility.
- Add explicit monthly, yearly, and multi-year prices.
- Configure package entitlements and enforcement modes.
- Preview the effective public package representation.

## 5. Offers and discounts

Support:

- Percentage and fixed-amount discounts.
- Explicit promotional prices.
- Coupon and automatic offers.
- Start/end dates.
- Eligible packages and billing terms.
- New-customer-only rules.
- Minimum purchase term.
- Global and per-customer redemption limits.
- Stackable/non-stackable behavior.

The server recalculates every checkout using current authoritative data. The public website submits identifiers, never trusted price totals.

## 6. Customer and organisation onboarding

Initial onboarding:

1. Identify or create the user through a verified OTP flow.
2. Collect organisation details.
3. Create an organisation membership with Owner role.
4. Select a package and billing term.
5. Complete or prepare checkout.
6. Activate subscription only after verified payment state.
7. Snapshot purchased pricing and entitlements.
8. Make the organisation eligible for provisioning.

The MVA supports one operational owner per organisation. The schema must support multiple memberships from the beginning. Invitations and customer-defined roles can be enabled later without replacing the identity model.

## 7. Usage restrictions

Initial entitlement types:

- Server count.
- Application count.
- Database count.
- Total disk usage.
- Database storage.
- Domain count.
- Backup availability and retention.
- CPU and memory allocation where measurable/enforceable.
- Bandwidth where reliable metrics exist.
- Organisation member count.

Enforcement modes:

- `hard`: reject before exceeding.
- `soft`: warn and allow according to policy.
- `metered`: record usage for possible overage billing.
- `informational`: display only.

Count-based limits are checked transactionally before provisioning. Measured limits use recent, timestamped usage observations and display data freshness.

## 8. Subscription entitlement snapshots

Every purchase creates immutable commercial and entitlement snapshots. Later package edits do not silently change an existing subscription. Administrators require an explicit, audited migration workflow to move existing subscriptions to new terms.

## 9. Out of scope for the first MVA

- Password authentication.
- Customer-defined organisation roles.
- Organisation invitation UI.
- Automatic placement across multiple production servers.
- Complex proration and automatic overage charging.
- Full terminal access.
- Automatic destructive remediation.
- Supporting hosting providers other than Coolify, although the provider interface remains portable.
