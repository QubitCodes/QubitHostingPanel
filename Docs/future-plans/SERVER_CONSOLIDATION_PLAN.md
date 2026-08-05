# Server Consolidation Plan

## 1. Current infrastructure

The current infrastructure uses two servers:

| Server | Current role |
| --- | --- |
| `65.2.66.21` | aaPanel, existing websites, and general server administration |
| `3.6.77.89` | Coolify and Ghost Deploy infrastructure |

The final objective is to retire one server and retain a single server that provides both application hosting and general server administration.

## 2. Recommended target architecture

Retain `3.6.77.89`, migrate the aaPanel-hosted websites to its existing Coolify installation, install Cockpit alongside Coolify for general server maintenance, and retire `65.2.66.21` after a verified rollback period.

```text
3.6.77.89
├── Coolify
│   ├── Websites and applications
│   ├── Databases
│   ├── Domains and TLS
│   ├── Deployments
│   ├── Backups
│   └── Container monitoring
│
└── Cockpit
    ├── CPU, memory, and disk monitoring
    ├── System services
    ├── Logs
    ├── Storage and mounts
    ├── Network configuration
    ├── User accounts
    ├── Operating-system updates
    └── Web terminal
```

This separates application-platform management from operating-system administration without introducing two competing hosting control panels.

## 3. Why Coolify should not be installed through aaPanel Docker

Coolify runs as multiple Docker containers, but it is not designed to behave as an isolated application inside another hosting panel's Docker abstraction. It needs host-level access to:

- The Docker daemon.
- Docker networks and volumes.
- Root SSH access to its own server.
- Ports 80 and 443.
- Traefik configuration.
- Firewall and routing state.
- Deployment and build helpers.

Installing Coolify through the aaPanel Docker module risks nested or competing ownership:

```text
aaPanel
  └── Docker module
       └── Coolify containers
            └── Attempts to manage host Docker and proxy resources
```

Even if aaPanel's PHP and Nginx services are later removed, aaPanel and Coolify could still independently manipulate Docker, networking, firewall rules, and upgrades. Coolify recommends a fresh server to avoid conflicts with existing software and applications.

Reference: [Coolify installation guidance](https://coolify.io/docs/get-started/installation).

## 4. What Coolify can replace

Coolify can replace most application-hosting functionality currently handled by aaPanel:

- Git-based Node.js, PHP/Laravel, and static deployments.
- Docker Compose applications.
- PostgreSQL, MySQL, MariaDB, Redis, and other services.
- Domains and automatic TLS.
- Environment-variable management.
- Persistent volumes.
- Scheduled database backups.
- Deployment and container logs.
- Server and container terminal access.
- Resource monitoring.
- Automated Docker cleanup.
- Notifications.
- Scheduled tasks.

Coolify monitors disk usage, stopped or restarted containers, and backup status.

Reference: [Coolify monitoring](https://coolify.io/docs/knowledge-base/monitoring).

## 5. What Coolify does not replace

Coolify is not a complete operating-system administration panel. It does not fully replace:

- General OS package administration.
- Complete system-service management.
- Linux user administration.
- Disk partition and mount management.
- General system-journal browsing.
- Every firewall and network administration function.
- Mail-server administration.
- FTP-oriented file hosting.
- Arbitrary host-level system configuration.

These responsibilities need a lightweight host-administration interface or direct system administration.

## 6. Why Cockpit is the recommended maintenance layer

Cockpit is a lightweight host-administration interface rather than another application-hosting platform. It uses standard Linux and systemd APIs and provides:

- Storage management.
- Networking visibility and configuration.
- System-service management.
- System logs.
- User and account administration.
- Performance visibility.
- A web terminal.

Cockpit normally listens on port `9090` and starts on demand, so it does not compete with Coolify's normal HTTP and HTTPS ingress on ports 80 and 443.

References:

- [Cockpit overview](https://cockpit-project.org/).
- [Cockpit startup documentation](https://cockpit-project.org/guide/latest/startup).

The ownership boundary should remain explicit:

- Coolify owns Docker applications, application databases, domains, deployments, and TLS.
- Cockpit owns general Ubuntu maintenance and host-level visibility.
- The cloud security group remains the external firewall boundary.
- Cockpit should not independently manage Coolify application containers.

## 7. Migration exceptions requiring special attention

The aaPanel server must be inventoried before retirement. Some services cannot be imported into Coolify as ordinary applications:

- Mail servers, mail domains, and mailboxes.
- Authoritative DNS-provider dependencies, nameserver configuration, and any locally hosted DNS zones.
- FTP accounts.
- Existing database servers and databases.
- Existing host or aaPanel cron jobs that must be recreated and verified as Coolify scheduled tasks.
- PHP applications with writable uploads.
- SSL certificates.
- Application environment files.
- Local backup archives.
- Persistent application files.
- Reverse-proxy-only sites.
- Non-Docker system services.

Mail is the largest potential blocker. If `65.2.66.21` is serving production email, Coolify will not directly replace that administration. Mail must be migrated to a separate supported service or deliberately retained before the server can be terminated.

## 8. Migration phases

### Phase 1: Read-only infrastructure audit

Collect the following from both servers:

- CPU, memory, disk, and network capacity.
- Current and projected disk consumption.
- All aaPanel websites and aliases.
- Application stacks and runtime versions.
- Databases, database sizes, and users.
- Persistent and uploaded-file directories.
- Cron jobs and background workers.
- Mail domains and accounts.
- DNS dependencies.
- SSL and domain configuration.
- Firewall and cloud security-group rules.
- Non-web background services.
- Current backups and restore procedures.

The audit must confirm that `3.6.77.89` has sufficient capacity for the combined workload before migration begins.

### Phase 2: Prepare the final server

On `3.6.77.89`:

1. Verify and update Coolify using its supported process.
2. Configure off-site S3-compatible backups.
3. Install and secure Cockpit.
4. Restrict Cockpit access by IP address or VPN.
5. Configure monitoring and alert delivery.
6. Verify sufficient swap, disk, memory, and build capacity.
7. Preserve the Coolify `APP_KEY` securely.
8. Preserve `/data/coolify/ssh/keys` securely.
9. Document the disaster-recovery procedure.

### Phase 3: Migrate websites incrementally

For each aaPanel website:

1. Create a dedicated Coolify project or application.
2. Deploy its source code.
3. Create and import its database.
4. Restore persistent uploads and writable data.
5. Configure environment variables and secrets.
6. Recreate cron jobs, queues, and scheduled tasks.
7. Test using a temporary hostname.
8. Confirm direct application health and public HTTPS.
9. Lower the production DNS TTL before cutover.
10. Switch production DNS.
11. Monitor application, database, proxy, and error logs.
12. Keep the original aaPanel copy intact for rollback.

Laravel and Node.js applications should migrate naturally. Traditional PHP applications and WordPress can also be containerized, but their databases and persistent writable files must be handled explicitly.

### Phase 4: Retire the aaPanel server

Only after every website, database, mail service, scheduled task, and persistent directory has an accepted destination:

1. Create final encrypted backups.
2. Confirm no active DNS records point to `65.2.66.21`.
3. Monitor the old server for unexpected remaining traffic.
4. Stop services without deleting their data.
5. Retain a final provider snapshot for the rollback period.
6. Confirm the final server's backups and alerting are working.
7. Terminate `65.2.66.21` only after formal acceptance.

## 9. Backup and disaster-recovery model

A second continuously active Coolify instance is not the preferred backup design. Use:

- Scheduled Coolify database backups to off-site S3-compatible storage.
- A secure copy of the Coolify `APP_KEY`.
- A secure copy of `/data/coolify/ssh/keys`.
- Separate backups for application volumes.
- Separate backups for customer databases.
- A documented cold restoration process using a fresh compatible server.

During a disaster, install a compatible Coolify release on a replacement server and restore the database, `APP_KEY`, and SSH keys. Application volumes and databases must be restored separately.

Reference: [Coolify backup and restore](https://coolify.io/docs/knowledge-base/how-to/backup-restore-coolify).

## 10. Final platform decision

| Responsibility | Final owner |
| --- | --- |
| Final server | `3.6.77.89` |
| Web hosting and deployments | Existing Coolify installation |
| General server administration | Cockpit |
| Application and container monitoring | Coolify |
| Host-level visibility | Cockpit |
| Optional additional monitoring | Netdata or Uptime Kuma |
| Backups | External S3-compatible storage plus tested cold restoration |
| Temporary migration source | `65.2.66.21` |
| Server retired after acceptance | `65.2.66.21` |

## 11. Immediate next action

Perform a read-only inventory of both servers. Do not install Coolify through aaPanel, uninstall aaPanel components, switch DNS, or delete existing services before the inventory confirms:

- Final-server capacity.
- Every hosted website and database.
- Mail-server dependencies.
- Persistent application data.
- Scheduled tasks and workers.
- Backup and rollback coverage.

The inventory results should become the authoritative migration checklist for the consolidation.
