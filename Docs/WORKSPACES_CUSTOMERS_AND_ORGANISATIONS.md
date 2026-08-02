# Customers, Workspaces, and Organisations

## 1. Domain boundaries

These concepts are separate:

- A `user` is the shared passwordless authentication identity. Administrators are users and may also purchase services.
- A `customer` is the service/customer profile attached one-to-one to a user.
- A `workspace` is the tenant, ownership, billing, subscription, entitlement, usage, and resource boundary.
- An `organisation` is an optional one-to-one extension of a workspace containing organisation-specific identity and compliance data.

Admin authorization and workspace authorization are independent. Admin privileges never grant access to a workspace and workspace ownership never grants platform-admin access.

## 2. MVA invariants

- Every active user has exactly one customer profile.
- Every active user has a customer profile but may own no workspace before purchasing.
- Registration atomically creates only the user/customer relationship.
- Existing users, including administrators, receive missing customer profiles through an idempotent backfill.
- A user may own multiple workspaces during the MVA.
- A Personal Workspace has exactly one user and one Owner at any moment.
- Personal Workspace ownership is transferable.
- A workspace can be converted to an Organisation Workspace without affecting another workspace.
- Conversion preserves workspace ID, billing history, subscriptions, snapshots, resources, usage, and audit history.
- Organisation membership remains single-owner during the MVA even though the schema supports multiple memberships.
- Every workspace has independent billing details and an independent primary plan/subscription.

## 3. Required model

```text
User 1---1 Customer
Customer 1---* WorkspaceMembership *---1 Workspace
Workspace 1---0..1 Organisation
Workspace 1---* BillingProfileVersion
Workspace 1---* Checkout
Workspace 1---* Subscription
Subscription 1---1 PurchasedPriceSnapshot
Subscription 1---* PurchasedEntitlementSnapshot
```

Recommended tables:

- `customers`: user ID, six-digit public ID, onboarding state, timestamps, and soft-delete fields.
- `workspaces`: six-digit public ID, name, slug, type (`personal` or `organisation`), status, timestamps, and soft-delete fields.
- `workspace_memberships`: workspace, customer, role, status, ownership timestamps, and soft-delete fields.
- `organisations`: workspace ID, legal/display names, optional GSTIN and contact fields, timestamps, and soft-delete fields.
- `workspace_billing_profiles`: immutable/versioned billing details, source lineage, effective timestamp, and soft-delete fields.
- `workspace_subscriptions`: workspace-owned plan and lifecycle state.

The database must enforce or transactionally protect:

- one customer per user;
- one organisation extension per workspace;
- unique active workspace slugs and public IDs;
- exactly one active membership for a Personal Workspace;
- no workspace before a completed first purchase;
- the final active Owner cannot be removed without a successful transfer;
- organisation extension only on an organisation-type workspace.

## 4. Registration and backfill

New registration completes in one transaction:

1. Verify the OTP challenge.
2. Create or reuse the user by canonical phone identity.
3. Create the customer profile if absent.
4. Create the session and return independently authorized admin/customer capabilities.

The essential-data backfill must be idempotent. For every current non-deleted user it creates only a missing customer profile. Re-running it must not create duplicates or change workspaces.

The first purchase is persisted before workspace setup. The customer then names the workspace and chooses Personal or Organisation. Workspace, Owner membership, optional organisation extension, subscription, and commercial snapshots are created transactionally.

## 5. Workspace creation and conversion

The MVA permits multiple workspaces per user. Creating a workspace never mutates another workspace.

- Personal creation produces a single-owner Personal Workspace.
- Organisation creation produces the workspace, organisation extension, and Owner membership transactionally.
- Conversion from Personal to Organisation adds the organisation extension and changes the workspace type while retaining the workspace identity and owned records.
- Normal UI conversion is one-way during the MVA. Reversion requires a separately authorized and audited administrator workflow.

## 6. Ownership transfer

Personal Workspace transfer moves the only membership atomically after recipient confirmation.

- The workspace, subscription, billing history, resources, and snapshots remain unchanged.
- The recipient may already own other workspaces.
- If transfer would leave the sender with no workspace, create a new empty Personal Workspace for the sender in the same transaction.
- Record initiator, recipient, confirmation, reason, IP, user agent, and timestamps in audit history.
- Expired, cancelled, or replayed transfer requests cannot change ownership.

## 7. Workspace billing snapshots

Billing information belongs to a workspace, never directly to a user.

- Each edit creates a new immutable billing-profile version.
- A workspace points to its current version without rewriting history.
- Checkouts, subscriptions, payment attempts, transactions, and invoices reference the exact version used.
- A permitted owner may clone a billing profile from another workspace they can access.
- Cloning creates a new independent version and records the source workspace/profile and actor.
- Later source changes never mutate the cloned version.

Billing fields include legal/customer name, email, phone, address, country, state, postal code, and optional GSTIN. Sensitive payment instruments remain with the payment provider.

## 8. Workspace context and URLs

Sessions remain user-owned and multi-device. Access tokens use server-authorized active context:

```text
subject user ID
session ID
active context type: personal, workspace, or admin
active workspace ID when applicable
issued/expiry timestamps
token version
```

The active workspace is selected from the dashboard topbar; customer page URLs do not expose a workspace segment:

```text
/dashboard
/dashboard/workspaces/create
/dashboard/billing
/dashboard/subscription
/dashboard/security
```

All workspace queries include both active workspace ID and an authorized active membership predicate.

## 9. Subscription boundary

- Each workspace has at most one active primary hosting subscription during the MVA.
- Add-ons are separate subscription items owned by the same workspace.
- Price, offer, tax, billing details, and entitlements are snapshotted at purchase.
- Editing a package or billing profile does not rewrite an existing subscription snapshot.

## 10. Explicit post-MVA roadmap

The following are deliberately deferred and must not be forgotten:

- Organisation invitations and acceptance/expiry workflows.
- Multiple organisation members and multiple Owners.
- Owner, Administrator, Billing Manager, Member, and custom organisation roles.
- Organisation permission management and billing-only access.
- Final-Owner protection for multi-owner organisations.
- Member and seat entitlements.
- Ownership recovery and administrator-assisted dispute workflows.
- Workspace merging, splitting, and resource transfer between workspaces.
- Organisation-to-Personal reversion rules.
- Transfer approval policies beyond single-owner Personal Workspaces.

The MVA schema must support these additions without replacing workspace, membership, billing-profile, or subscription identities.
