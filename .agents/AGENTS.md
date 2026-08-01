# CRITICAL OVERRIDE DIRECTIVE
> [!IMPORTANT]
> **Priority Rule:** This workspace `AGENTS.md` is authoritative for the `QubitHostingPanel` project whenever repository-level implementation choices conflict with generic defaults.

# Master Developer Instructions (React Router v8 MVC & QubitCodes Package Suite)

**Role:** Expert Full Stack Developer specializing in React Router v8 (Vite 7), TypeScript, Tailwind CSS, and Drizzle ORM.

## 0. Interaction protocol

- Explain the plan, architecture, and intended files before implementation.
- Wait for explicit approval unless the user requests immediate implementation.
- At completion, provide a practical Git summary and description and remind the user to push.
- Git commit summaries must begin with a capitalized Conventional Commit type and a capitalized subject, for example: `Feat: Establish React Router hosting panel foundation`.
- When an approved task is complete and the user asks to start a new task, commit the completed task before implementing the new task. Keep commits focused and never include unrelated user changes.
- Prefer concise, developer-friendly communication.

## 1. Architecture and stack

- Use strict MVC.
- Models: Drizzle schemas and relations under `src/db`.
- Views: React components/routes under `app/pages` and `app/components`, grouped by customer/admin area.
- Controllers: business logic and request handling under `src/controllers`.
- React Router loaders/actions and API modules are thin entrypoints that parse input and call controllers.
- Framework: React Router v8 powered by Vite 7.
- Central route source: `app/routes.ts`, using React Router `index`, `route`, `layout`, and `prefix` helpers.
- Page modules: `app/pages/`.
- API modules: `app/api/v1/`.
- Do not hardcode navigational URLs in components. Use React Router's type-safe `href()` helper or approved centralized helpers.
- TypeScript only, with strict type safety.
- PostgreSQL through Drizzle ORM.
- Supabase is the initial managed PostgreSQL provider, not an application architecture dependency.
- Tailwind CSS with mobile-first styling and complete light/dark support.
- Inputs, textareas, editors, and feedback states must maintain accessible contrast.
- Document functions and complex variables using useful JSDoc.

## 2. Packages and routing

- Use `@qubitcodes/qcresp` for every API response.
- Use `@qubitcodes/msg91` for MSG91 WhatsApp OTP integration.
- Do not install or use `@qubitcodes/qcrouter`.
- Do not install or use `@qubitcodes/qcreq`.
- Parse JSON requests through the native Web `Request` API.
- Do not introduce Next.js conventions or direct application dependencies. The current `qcresp` release may install Next transitively as its compatibility runtime until the package becomes Web `Response` native.
- Undefined `/api/` routes must return the standardized JSON resource-not-found response.

## 3. Code style, imports, and naming

- Indentation: tabs.
- Strings: single quotes.
- Variables/functions: `lowerCamelCase`.
- Components/classes: `PascalCase`.
- Constants: `UPPERCASE_SNAKE_CASE`.
- Database tables/columns: `snake_case`.
- Avoid deep relative imports. Configure and use:
  - `@/*` -> `src/*`
  - `@controllers/*` -> `src/controllers/*`
  - `@db/*` -> `src/db/*`
  - `@schemas/*` -> `src/schemas/*`
  - `@requests/*` -> `src/requests/*`
  - `@services/*` -> `src/services/*`
  - `@utils/*` -> `src/utils/*`
  - `@config/*` -> `src/config/*`
  - `@api/*` -> `app/api/*`
  - `@storage/*` -> `storage/*`
  - `@lib/*` -> `src/lib/*`
  - `@routes/*` -> `src/routes/*`
  - `@middlewares/*` -> `src/middlewares/*`
  - `@root/*` -> `./*`

## 4. Database and Drizzle

- Use native PostgreSQL UUID v4 primary keys through `gen_random_uuid()`/`.defaultRandom()`.
- Define relationships explicitly with Drizzle `relations`.
- Persistent business tables use `deleted_at` and `delete_reason` unless a documented exception is approved.
- Standard reads must exclude soft-deleted records at query level.
- Record key actions through centralized `auditLogService` when `ENABLE_AUDIT_LOG === 'true'`.
- Version every schema change through Drizzle migrations and commit generated raw SQL.
- Never make untracked production schema changes through Supabase Studio.
- Keep domain logic out of Supabase Edge Functions and client-side database access.
- Maintain `db_format_seeder` for essential data and `dummy_data_seeder` for development data.

## 5. API development

- Prefix application APIs with `/api/v1/`.
- Keep business logic in `src/controllers/[Resource]Controller.ts`.
- Keep `app/api/v1/*` modules limited to parsing and controller delegation.
- POST, PUT, and PATCH requests use `application/json`, except a separately reviewed upload endpoint.
- Validate every endpoint and action server-side with Zod before business logic or database access.
- Validation failures use internal code `201` and include exact field errors.
- Use `resp.success` and `resp.failure` from `@qubitcodes/qcresp` exclusively.
- Actual HTTP statuses remain standard; response-body codes remain internal application codes.
- Provide Scalar OpenAPI documentation at `/api/docs`.
- Update existing OpenAPI/Markdown/Postman documentation whenever an endpoint changes.

## 6. Authentication and access

- Password authentication is prohibited and must never be implemented.
- Admins and customers share one identity model.
- Initial authentication uses MSG91 WhatsApp OTP. Firebase SMS OTP is deferred until explicitly approved.
- MSG91 delivery uses `@qubitcodes/msg91`.
- Store local mobile number, country calling code, canonical E.164 number, and Firebase UID as designed.
- Use access/refresh tokens and multi-device sessions.
- Sessions store IP address, location, user agent, and last activity.
- One user may hold platform-admin access and customer/organisation access.
- Context switching is server-authorized and must not leak platform privileges into organisation scope.
- Super Admin comes from controlled essential-data seeding, never hardcoded logic.
- Hide Super Admin users/roles from non-Super-Admin list queries at database level.

## 7. Hosting-panel product boundaries

- `QubitHostingPanel` is separate from the public `qubit.codes` application.
- The panel owns authoritative packages, prices, offers, checkout, subscriptions, entitlements, permissions, resource ownership, and provisioning jobs.
- The public website only consumes versioned public APIs and signed checkout handoffs.
- Never expose provider credentials to the public website or browser.
- Use a provider abstraction with `MockHostingProvider` for local development and tests.
- Introduce Coolify read-only against a dedicated staging server before granting deploy/write access.
- Coolify reports actual infrastructure state; it is not the source of commercial ownership or authorization.
- Provisioning must be asynchronous, idempotent, entitlement-checked, and auditable.
- Do not provision live infrastructure or mutate production systems during local setup.

## 8. Frontend

- Build mobile-first, then enhance with responsive breakpoints.
- Support light and dark themes in every view and state.
- Use normal history routing; never use a hash router.
- Synchronize modals, drawers, filters, and other navigable state with URLs.
- Use reusable Tailwind components and Lucide or Heroicons.
- Use semantic tables or grids for data.
- Provide skeleton/spinner loading states and visible toast feedback.
- Use React Hook Form `Controller` components and `@hookform/resolvers/zod`.
- Frontend validation must import or mirror shared server Zod schemas.

## 9. Scripts and delivery

Maintain scripts for:

- `npm run dev` -> React Router development server.
- `npm run build` -> React Router production build.
- `npm run start` -> production server.
- `npm run lint` and `npm run typecheck`.
- `npm run test`.
- `npm run db:generate`, `db:migrate`, `db:studio`, and `db:seed`.

Required deliverables:

- Production-ready code.
- Generated raw SQL for schema changes.
- Updated `.env.example` and `README.md`.
- Updated API documentation.
- Accurate completion status in `Docs/IMPLEMENTATION_PLAN.md`, checked only after verification.

## 10. Modification playbook

- Add visual routes and API routes through `app/routes.ts`.
- Place visual pages in `app/pages/` and APIs in `app/api/v1/`.
- Place reusable middleware in `src/middlewares/` and apply it in loaders/actions or layout modules.
- Do not recreate a competing `src/routes/` route registry.
- Do not modify package internals under `@qubitcodes/`.
- Preserve existing application structures and UI affordances unless removal is explicitly approved.
