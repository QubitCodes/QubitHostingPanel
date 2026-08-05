# Project scheduled tasks

Ghost Deploy scheduled tasks are application-scoped. Workspace-level customer cron jobs are intentionally unsupported; backups and maintenance remain system-level plan features.

## Behaviour

- Commands execute inside the selected application's container.
- Static applications cannot create scheduled tasks.
- Laravel uses `php artisan schedule:run`; WordPress uses `php wp-cron.php`.
- Django and Rails accept framework command arguments. Other server frameworks accept a single-line container command.
- Plans control feature availability, tasks per application, minimum interval, and maximum timeout through `cron.*` entitlements.
- Standard five-field cron syntax is validated server-side. The shortest interval is evaluated across two calendar years before provider synchronization.
- Creation, update, deletion, enablement, and execution history synchronize through the hosting-provider boundary.
- Coolify's documented public API does not expose an immediate-execution action. The UI therefore provides refreshable provider history without presenting a misleading **Run now** control.

## Entitlements

| Code | Meaning |
| --- | --- |
| `cron.enabled` | Scheduled tasks available for the plan |
| `cron.jobs_per_application` | Maximum tasks on one application |
| `cron.minimum_interval_minutes` | Shortest interval between executions |
| `cron.timeout_seconds` | Maximum execution timeout |

New checkouts snapshot these values. Existing subscriptions retain their original immutable entitlement snapshot and require an explicit workspace override or subscription refresh before using newly introduced entitlements.

## Provider API

The Coolify adapter uses the documented application scheduled-task endpoints for create, update, delete, and execution history. Provider task UUIDs are stored locally for deterministic synchronization and authorization remains workspace-scoped in Ghost Deploy.
