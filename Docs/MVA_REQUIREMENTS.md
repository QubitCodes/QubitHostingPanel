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

## 6. Customer, workspace, and organisation onboarding

Initial onboarding:

1. Identify or create the user through a verified OTP flow.
2. Create or reuse the one-to-one customer profile.
3. Create a Personal Workspace and its single Owner membership when the user owns no workspace.
4. Select or create the workspace that will own the purchase.
5. Optionally create an Organisation Workspace or convert an existing Personal Workspace by adding its organisation extension.
6. Collect or clone versioned workspace billing details.
7. Select a package and billing term.
8. Complete or prepare checkout.
9. Activate the workspace subscription only after verified payment state.
10. Snapshot purchased pricing, offers, tax, billing details, and entitlements.
11. Make the workspace eligible for provisioning.

Every current and future user, including a platform administrator, may also be a customer. An idempotent backfill creates missing customer profiles, Personal Workspaces, and Owner memberships for existing users.

The MVA permits multiple workspaces per user. A Personal Workspace contains exactly one Owner at a time but is transferable. Each workspace owns independent billing, plan, subscription, entitlements, usage, and resources. Organisation membership remains single-owner in the MVA; the membership schema must support future multiple members and Owners without replacement.

## 7. Public landing and registration entry

Before the remaining onboarding screens, the panel shall provide a responsive public landing page because customer self-registration is now required.

- Explain the hosting service and published plans.
- Read packages and prices from the panel public API.
- Provide clear login and registration entry points.
- Route authenticated users to their active workspace or context selection.
- Preserve light/dark themes, mobile-first behavior, accessibility, and non-AI-generic visual language.
- Never calculate authoritative checkout totals in the browser.

## 8. Usage restrictions

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

## 9. Subscription entitlement snapshots

Every purchase creates immutable commercial and entitlement snapshots. Later package edits do not silently change an existing subscription. Administrators require an explicit, audited migration workflow to move existing subscriptions to new terms.

## 10. Out of scope for the first MVA

- Password authentication.
- Organisation invitation UI.
- Multiple organisation members and multiple Owners.
- Organisation roles, custom permissions, and billing-only member access.
- Workspace merging, splitting, and resource transfer between workspaces.
- Organisation-to-Personal conversion through the normal customer UI.
- Automatic placement across multiple production servers.
- Complex proration and automatic overage charging.
- Full terminal access.
- Automatic destructive remediation.
- Supporting hosting providers other than Coolify, although the provider interface remains portable.
