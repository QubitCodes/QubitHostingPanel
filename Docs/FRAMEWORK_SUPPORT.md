# Framework Support

Ghost Deploy uses one typed framework catalogue for repository detection, runtime selection, database compatibility, persistent-data hints, and future scheduler/worker presets. A framework is not considered production-verified until its fixture has completed a real deployment acceptance run.

## Runtime matrix

| Runtime | Frameworks and application types |
| --- | --- |
| Node.js | React Router, Next.js, NestJS, Express, Fastify, Remix, Nuxt, SvelteKit |
| PHP | Laravel, WordPress, CakePHP, Symfony, CodeIgniter, Yii, Slim |
| Python | Django, FastAPI, Flask, Litestar |
| Ruby | Ruby on Rails |
| Static/nginx | React, Vite, Vue, Angular, Astro, Gatsby |

Generic Node.js, PHP, Python, Ruby, and static repositories remain deployable without selecting a framework. Framework selection is advisory, but the API rejects a framework paired with the wrong runtime.

## Detection

- Node and static frameworks are detected from `package.json` dependencies.
- PHP frameworks are detected from `composer.json` dependencies.
- WordPress is detected from `wp-includes/version.php`, including repositories without Composer metadata.
- Python frameworks are detected from `requirements.txt` or `pyproject.toml`.
- Python dependency discovery also accepts named requirements files and Pipenv projects. Conventional Django WSGI, FastAPI, Flask and Litestar entry points produce reviewable start commands only when the required server package can be proven.
- Rails is detected from a `Gemfile` containing the `rails` gem.
- Monorepo project directories are retained for every detected candidate.
- Environment templates are inspected for keys only; real `.env` files are never read.

Every source candidate receives a versioned deployment contract. A selected server framework cannot be queued until a start command is either detected or supplied. The contract also validates the project directory, static output directory and container-local port. The contract is provider-independent and is saved with the application so a future recipe revision does not silently reinterpret an existing deployment.

For npm projects, Ghost Deploy installs development dependencies during the build phase. A clean lockfile uses `npm ci`; if npm proves that the lockfile and manifest disagree, the same isolated build falls back to `npm install`. This prioritises a working first deployment while the deployment output still identifies the lockfile repair that should be committed.

## Data and process requirements

- WordPress permits MySQL only and identifies `wp-content` as persistent data.
- Laravel identifies public storage and its queue/scheduler conventions.
- CakePHP, Symfony, CodeIgniter, Yii, Django, and Rails expose their conventional writable directories as persistence hints.
- Symfony Messenger, Laravel queues, Celery, and Rails queues are background-worker concerns rather than web-process commands.
- Static builds do not require a database or project cron runtime.

Persistent-directory metadata is a deployment contract. Ghost Deploy reconciles the required Coolify volume before the first deployment and retries idempotently after partial provider failures. Volume backup policy remains a separate package-controlled system feature.

## Verification rule

Each advertised framework requires a maintained fixture covering:

1. Repository detection.
2. Dependency installation and build.
3. Application startup and health check.
4. Supported database connection.
5. Deployment replacement without data loss where persistence applies.
6. Framework-specific scheduler and worker behavior when those features are enabled.

The runtime-image workflow publishes and scans the shared Node.js, PHP, Python, Ruby, and static foundations. Ruby `3.4.10` is the initial Rails runtime and must be published to GHCR before Rails is enabled on a live catalogue.

Node.js 22 is the current source-builder default. Node.js 24 remains in the administrator catalogue as deprecated until the pinned Coolify/Nixpacks package set can resolve it without silently building with an older major version.

See `DEPLOYMENT_RELIABILITY.md` for the preflight, status, logging and acceptance rules shared by all frameworks.
