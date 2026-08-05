# Product Architecture

## 1. Product boundary

Ghost Deploy is the standalone hosting-commerce and operations application. Its public landing, authentication, checkout, customer dashboard, and admin dashboard share one origin by default. It retains its own repository, deployment, database configuration, secrets, API, and release process; Platform Settings may optionally move authenticated panel routes to another verified origin.

```text
abc.com
  Marketing, catalogue, login, registration, and checkout
        |
        | One application and one identity session
        v
abc.com/dashboard and abc.com/admin
  Customer resources and authorized platform administration
        |
        | Private provider adapter
        v
Coolify API
  Servers, application containers, shared database services, deployments
```

The public website must never hold Coolify credentials, calculate authoritative prices, or provision infrastructure directly.

## 2. Application responsibilities

### Public landing surface

- Present marketing content.
- Read published packages and current public prices from the panel API.
- Initiate a signed, short-lived checkout handoff.
- Authenticate and complete purchases on the same origin by default.
- Link authorized users to `/dashboard` and/or `/admin` from the account menu.

### Ghost Deploy

- Authenticate admins and customers.
- Manage platform roles, permissions, and individual overrides.
- Manage unified user identities, customer profiles, workspaces, organisation extensions, and memberships.
- Use workspaces as the tenant, billing, subscription, entitlement, usage, and resource boundary.
- Own packages, prices, offers, subscriptions, and entitlement snapshots.
- Enforce package restrictions before provisioning.
- Integrate with payments and verify payment webhooks.
- Integrate with Coolify through a provider abstraction.
- Maintain approved shared runtime images and customer build artifacts.
- Allocate restricted logical databases inside shared PostgreSQL/MySQL clusters.
- Record usage, reconciliation results, operational jobs, and audit events.
- Optionally serve authenticated routes from a separately configured and verified panel origin without changing identity, authorization, or commercial ownership.

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
	getDeployment(jobId: string): Promise<ProviderJobStatus>;
}
```

Logical databases use a separate `SharedDatabaseProvisioner`. Coolify creates and operates each shared engine service once; the panel creates workspace databases and restricted users inside those engines. Runtime versions are shared immutable image layers, while every customer application remains an isolated container.

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
- Shared PostgreSQL/MySQL clusters: actual logical database/user state, reconciled into workspace resource ownership.
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

See `SHARED_PLATFORM_ARCHITECTURE.md` for runtime images, application isolation, shared database clusters, credentials, quotas, and backups.

## 7. Security boundaries

- Encrypt Coolify and payment credentials at rest.
- Use least-privilege, team-scoped Coolify API tokens.
- Never return provider secrets to the public website or browser.
- Make provisioning asynchronous and idempotent.
- Require audit records and authorization for mutations.
- Never derive permissions solely from client-side context.
- Keep development, staging, and production databases and credentials separate.
- A verified root domain belongs to one workspace. Cross-workspace use of its subdomains requires the root owner's recorded approval.
- Encrypt platform-managed Cloudflare, GoDaddy, and Hostinger credentials at rest and return masked metadata only.
