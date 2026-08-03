# Product Architecture

## 1. Product boundary

Qubit Hosting Panel is a standalone customer and operations application. It must have its own repository, deployment, database configuration, secrets, API, and release process.

```text
qubit.codes
  Marketing, public package catalogue, purchase entry points
        |
        | Versioned public API and signed checkout handoff
        v
panel.qubit.codes
  Identity, customers, workspaces, organisations, checkout, subscriptions,
  entitlements, usage, administration, and customer resources
        |
        | Private provider adapter
        v
Coolify API
  Servers, applications, databases, services, deployments
```

The public website must never hold Coolify credentials, calculate authoritative prices, or provision infrastructure directly.

## 2. Application responsibilities

### Public Qubit Codes website

- Present marketing content.
- Read published packages and current public prices from the panel API.
- Initiate a signed, short-lived checkout handoff.
- Redirect users to `panel.qubit.codes` for authentication and purchase completion.
- Link authenticated customers to their panel.

### Qubit Hosting Panel

- Authenticate admins and customers.
- Manage platform roles, permissions, and individual overrides.
- Manage unified user identities, customer profiles, workspaces, organisation extensions, and memberships.
- Use workspaces as the tenant, billing, subscription, entitlement, usage, and resource boundary.
- Own packages, prices, offers, subscriptions, and entitlement snapshots.
- Enforce package restrictions before provisioning.
- Integrate with payments and verify payment webhooks.
- Integrate with Coolify through a provider abstraction.
- Record usage, reconciliation results, operational jobs, and audit events.

### Coolify

- Execute infrastructure operations.
- Report actual resource and deployment state.
- Remain a provider, not the source of truth for commercial ownership or permissions.

## 3. Required architecture

Use strict MVC:

- Models: Drizzle schemas and relations under `src/db`.
- Views: React Router v8 pages under `app/pages` and reusable components under `app/components`.
- Controllers: request handling and business logic under `src/controllers`.
- React Router loaders/actions and API modules: parse native Web requests and delegate to controllers only.
- Services: OTP, billing, entitlements, audit, provisioning, encryption, and provider integration.

Provider boundary:

```typescript
interface HostingProvider {
	validateConnection(): Promise<ProviderConnectionResult>;
	listResources(): Promise<ProviderResource[]>;
	getUsage(): Promise<ProviderUsage[]>;
	provisionApplication(input: ProvisionApplicationInput): Promise<ProviderJob>;
	provisionDatabase(input: ProvisionDatabaseInput): Promise<ProviderJob>;
	getDeployment(jobId: string): Promise<ProviderJobStatus>;
}
```

Initial implementations:

- `MockHostingProvider` for local development and automated tests.
- `CoolifyHostingProvider` for staging and production.

## 4. API boundaries

Public, rate-limited endpoints:

```text
GET  /api/v1/public/packages
GET  /api/v1/public/packages/:slug
POST /api/v1/public/checkout-handoffs
```

Authenticated panel endpoints cover authentication, customers, workspaces, organisation extensions, subscriptions, usage, and resources. Internal endpoints cover payment webhooks, provider webhooks, scheduled usage snapshots, and provisioning jobs.

All state-changing requests use JSON. Routes use native Web `Request` parsing, Zod validation, and `@qubitcodes/qcresp`. Undefined `/api/` routes return the standard JSON failure format. Routing uses React Router's central `app/routes.ts`; `@qubitcodes/qcrouter` and `@qubitcodes/qcreq` are not used.

## 5. Source-of-truth rules

- Panel database: identities, permissions, customers, workspaces, organisation extensions, commercial state, entitlements, ownership, desired resource state, jobs, and audit history.
- Payment provider: verified payment transaction state, reconciled into the panel.
- Coolify: actual infrastructure state, reconciled into the panel.
- Usage snapshots: timestamped observations; they do not silently rewrite subscription entitlements.

## 6. Workspace tenancy

Customers and organisations are separate entities. A customer is the service profile of a user; an organisation is an optional extension of a workspace. The workspace is the durable tenant boundary.

- Every registered user, including an administrator, receives a customer profile. The first workspace is created only after a verified purchase or eligible trial and explicit workspace setup.
- A user may own multiple workspaces and may retain independently authorized admin access.
- A Personal Workspace has one owner at a time and may be transferred.
- A workspace may be created as, or converted into, an Organisation Workspace without changing another workspace.
- Every workspace independently owns billing-profile versions, checkouts, subscriptions, entitlement snapshots, usage, and resources.
- Organisation multi-user membership is schema-ready but deferred until after the MVA.

See `WORKSPACES_CUSTOMERS_AND_ORGANISATIONS.md` for invariants and lifecycle rules.

## 7. Security boundaries

- Encrypt Coolify and payment credentials at rest.
- Use least-privilege, team-scoped Coolify API tokens.
- Never return provider secrets to the public website or browser.
- Make provisioning asynchronous and idempotent.
- Require audit records and authorization for mutations.
- Never derive permissions solely from client-side context.
- Keep development, staging, and production databases and credentials separate.
