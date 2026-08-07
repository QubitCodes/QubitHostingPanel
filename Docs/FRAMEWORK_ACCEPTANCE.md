# Framework acceptance

Framework detection is not production evidence. Ghost Deploy keeps small, locked fixtures under `fixtures/frameworks` and promotes a framework only after the fixture passes the same customer deployment path used in production.

## First batch

| Framework | Fixture | Database gate | Persistence gate | Local status | Live status |
| --- | --- | --- | --- | --- | --- |
| Express | `fixtures/frameworks/express` | None | None | Passed | Pending pushed-source deployment |
| Next.js | `fixtures/frameworks/nextjs` | None | None | Passed | Pending pushed-source deployment |
| Laravel | `fixtures/frameworks/laravel` | PostgreSQL | `storage/app/public` | Passed with SQLite smoke | Pending PostgreSQL deployment |
| WordPress | `fixtures/frameworks/wordpress` | MySQL | `wp-content` | Passed without configured DB | Pending MySQL deployment |
| Django | `fixtures/frameworks/django` | PostgreSQL | `media` | Passed with SQLite smoke | Pending PostgreSQL deployment |
| Vite | `fixtures/frameworks/vite` | None | None | Production build passed | Pending static deployment |

Local checks prove dependency resolution, build output, runtime startup and HTTP health. They do not replace Coolify networking, generated-domain, shared-database, volume, replacement-deployment or TLS evidence.

## Local gate

Validate fixture structure and deployment contracts without installing fixture dependencies:

```powershell
npm.cmd run acceptance:frameworks:verify
```

For a complete local smoke run, prepare every locked dependency and production output, then run:

```powershell
npm.cmd run acceptance:frameworks:prepare
npm.cmd run acceptance:frameworks:smoke
```

Preparation requires Node/npm, Composer/PHP and Python. It installs only inside ignored fixture directories. Override `FRAMEWORK_ACCEPTANCE_COMPOSER_COMMAND` or `FRAMEWORK_ACCEPTANCE_PYTHON_COMMAND` when those executables are not on `PATH`.

The smoke command starts direct loopback processes on ports `32101` through `32105`, verifies the expected response, checks Vite output, and terminates only its child processes. Set `FRAMEWORK_ACCEPTANCE_PORT_BASE` when those ports are unavailable.

## Pushed-source gate

After the fixture commit reaches GitHub, configure the repository without exposing a long-lived token:

```dotenv
FRAMEWORK_ACCEPTANCE_REPOSITORY_URL=https://github.com/owner/repository
FRAMEWORK_ACCEPTANCE_BRANCH=main
FRAMEWORK_ACCEPTANCE_GITHUB_TOKEN=
```

Then run:

```powershell
npm.cmd run acceptance:frameworks:source
```

This proves GitHub tree inspection detects every nested project, selects its own environment template, and produces a non-blocking deployment contract. Private repositories require a short-lived read token for this operator command; customer inspection continues to use the workspace GitHub App installation.

## Live gate

Deploy each case through Ghost Deploy, not directly from Coolify. Record:

1. repository, branch, commit and fixture directory;
2. detected stack, framework, commands, output directory and environment keys;
3. deployment and provider identifiers;
4. public HTTPS health response;
5. shared-database `SELECT 1` result where required;
6. persistent-file checksum before and after a replacement deployment;
7. deployment-history status and readable build/runtime logs;
8. automatic redeployment evidence where enabled;
9. cleanup ownership and retained evidence location.

Laravel receives safe first-boot session/cache/queue defaults unless the customer supplies explicit values. Its `APP_KEY` is treated as a required secret and is generated in the deployment form. No customer database migrations are run automatically.

Do not change a live status to passed from local output, source detection, provider configuration, or a queued deployment alone.
