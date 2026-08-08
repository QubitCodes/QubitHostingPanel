# Deployment Reliability

Ghost Deploy treats a deployment as a state machine, not as a single provider API call. A successful create response means only that work was accepted. The application becomes ready only after source validation, build completion, process startup and an HTTP health check all succeed.

## Deployment contract

Repository analysis creates a versioned, provider-independent contract containing:

- detected stack and optional framework;
- project and static output directories;
- install, build and start commands;
- container-local port and health path;
- pass, warning and blocking preflight checks;
- recipe version used to create the configuration.

Users can override inferred commands. Ghost Deploy blocks a selected server framework when it cannot prove a start command, instead of submitting a deployment that is already known to be incomplete.

Framework-aware migration and optional seeder commands are synchronized to the provider before every customer start, restart, or redeploy. A dry-run bulk synchronizer covers applications created before release settings existed. The bulk operation writes an audit event per provider application and does not trigger a deployment by itself.

## Container networking

Every application runs in its own container. Reusing port `3000`, `8000` or `80` across applications does not create a host conflict. Ghost Deploy owns the internal `PORT` value, sends the same value to Coolify exposure and health-check settings, and injects it at build and runtime. Public traffic continues through Coolify's shared proxy on ports 80 and 443.

Applications must listen on `0.0.0.0`, not only `localhost`. Framework recipes use `$PORT` where a direct start command is generated.

## Dependency installation

Compiler and framework packages frequently live in `devDependencies`, so production builds install those dependencies during the build stage. npm first attempts a clean, reproducible lockfile install. If npm proves that `package-lock.json` is stale, the isolated build falls back to `npm install`; the application can deploy while its logs explain that the repaired lockfile should be committed.

Runtime-only secrets are not exposed to the image build. Variables used by frontend bundlers or explicit build validation must have build scope. `PORT` is platform-owned and cannot create a cross-customer collision because it is container-local.

## Character-set compatibility (Beta)

Workspace owners and administrators can disable or enable automatic character-set compatibility fixes; the default is enabled. Ghost Deploy passes the policy to Coolify as a build-only flag. A platform-controlled helper wraps only `nixpacks plan`, validates source-like files, and converts high-confidence legacy text to UTF-8 inside Coolify's disposable checkout before Nixpacks scans it. The upstream repository, branch and commit are never modified.

Eligible files are bounded by extension and size. Dependencies, generated artifacts, binaries, ambiguous detections and low-confidence encodings are not converted. Original bytes are retained outside the Docker build context for the lifetime of the helper container, while the immutable Git commit and previous successful image provide durable recovery. Build logs receive structured markers containing only file paths, encodings, confidence and checksums. Deployment history renders those markers as a visible Beta notice.

Coolify must use the helper image documented in `infrastructure/coolify-helper/README.md`. Its tag must match Coolify's configured helper version. Upgrade Coolify's helper only after building and smoke-testing the matching GhostDeploy extension tag.

## Live status and logs

The browser opens one authenticated server-sent event stream. Ghost Deploy combines Coolify notifications with one short-lived provider tracker while a deployment is active. This provides live status, log availability and history refreshes without every browser polling Coolify independently.

Compound provider states are interpreted conservatively: `running:unhealthy`, `exited`, `failed`, `dead` and cancelled states are failures. Only a healthy/running terminal state is success.

Coolify structured log payloads are normalised into readable output. Known failures are classified into actionable diagnostics, including stale lockfiles, TypeScript errors, missing build-time environment values, unsupported runtime versions, dependency failures, missing `.env` files, memory exhaustion, database connectivity and port/health failures. Raw output always remains available below the diagnosis.

## Managed traffic policies (Beta)

The panel exposes a fail-open provider decision endpoint at `/system/traffic-policy`. When the platform Beta switch is enabled and a verified proxy integration calls it, the endpoint resolves the requested hostname to one active application and applies administrator suspension before customer maintenance or coming-soon state. It also rejects a declared request body larger than the configured request limit and can enforce configured MIME allowlists for non-multipart writes.

Standard pages are rendered by Ghost Deploy and contain no customer source or provider details. Multipart per-file MIME and extension validation cannot be proven by a header-only authorization request; applications must continue validating individual uploads. Downstream application error replacement also requires a managed response proxy and is not claimed by this decision endpoint.

Do not directly patch Coolify-generated labels as a bulk rollout. Coolify documents that edited standard-application labels stop being generated automatically, which can make later domain changes unsafe. Keep the Beta switch disabled until a reviewed dynamic-proxy or dedicated gateway integration is deployed.

## Database names

The database name confirmed in the application form is the exact physical logical-database name created in the shared cluster. Names are globally unique, lowercase `snake_case`, and limited to PostgreSQL's 63-character identifier boundary. A new database username defaults to that name but remains editable. Passwords are generated server-side and encrypted at rest. A workspace may instead reuse one of its existing users on the same database engine; that user's password is neither regenerated nor exposed during creation.

Rotating a reusable user's password updates every linked database credential record and is explicitly confirmed and audited. The manager lists affected databases and applications before rotation. Already-running applications may need redeployment because their process environment can still contain the previous password.

Legacy databases created before this rule retain their existing physical name until an explicit data-preserving rename or recreation is performed.

## Acceptance gate

A framework is advertised by the catalogue only after it has deterministic detection coverage. It is production-verified separately after a maintained fixture proves install/build, startup, HTTP health, database connectivity where supported, replacement deployment, persistence, and scheduled-task/worker behaviour where applicable. Unit contracts do not count as live deployment evidence.
