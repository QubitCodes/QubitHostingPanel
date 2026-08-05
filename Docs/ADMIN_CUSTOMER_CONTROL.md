# Administrator customer control

The administrator customer-control surface is user-centric: user identity, sessions and authentication events lead to workspaces, then applications, Git connections, deployments, domains, databases and scheduled tasks.

## Authorization

Every API operation requires its own platform permission. Page access does not authorize mutations or sensitive reads. Effective permissions retain explicit-deny precedence. Super Admin access continues through the database role assignment and is never hardcoded into a controller.

Resource permissions include `applications.*`, `application_files.*`, `application_secrets.*`, `deployments.*`, `git_connections.*`, `databases.*`, `domains.*`, `dns_records.*`, `cron_jobs.*`, `user_sessions.*`, and `authentication_events.*`. Sensitive operations such as session revocation, customer suspension, file reveal, credential reveal, database restore and deployment retry use dedicated permissions.

## Mandatory audit policy

Administrator customer-resource operations bypass the optional general audit switch and always write an audit record. This includes collection reads, user reads, session/authentication inspection, workspace resource inspection, repository tree listing, and source-file reading.

Audit metadata records the permission, actor, target, workspace/user public context, IP address, user agent, result count or file path, and the administrator's reason where required. File contents, secret values, tokens, OTPs and credentials are never written to audit metadata.

## Project files

The current file explorer inspects the exact GitHub repository branch configured for the application. This supports public repositories and private repositories authorized through the workspace GitHub App installation.

- Repository paths are canonical and cannot traverse outside the repository.
- File preview is limited to UTF-8 text files no larger than 500 KB.
- Binary files are not previewed.
- Known secret/configuration filenames require `application_files.reveal_sensitive` and a reason.
- The implementation does not use Coolify's undocumented terminal internals or expose host/container paths.

Container-runtime file mutation remains disabled until a documented provider boundary can guarantee project-root confinement, stable persistence semantics, privilege isolation and complete audit evidence.

## Application lifecycle controls

Start, stop, restart, and redeploy are separate permission-gated actions. Each request requires a reason, validates the application against the selected user and workspace, and creates a mandatory audit entry.
