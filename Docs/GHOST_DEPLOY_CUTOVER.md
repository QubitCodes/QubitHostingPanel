# Ghost Deploy cutover

## Target domains

| Purpose | Production | Staging |
| --- | --- | --- |
| Public site and panel | `https://ghostdeploy.com` | `https://staging.ghostdeploy.com` |
| Customer applications | `https://*.apps.ghostdeploy.com` | `https://*.apps-staging.ghostdeploy.com` |
| Coolify dashboard | `https://coolify.ghostdeploy.com` | `https://coolify-staging.ghostdeploy.com` |

Keep the existing `qubit.codes` endpoints online until DNS, TLS, payment callbacks, GitHub callbacks, and a full deployment have passed on the new domains.

## Application environment

```dotenv
APP_URL=https://ghostdeploy.com
COOLIFY_BASE_URL=https://coolify.ghostdeploy.com
COOLIFY_WILDCARD_DOMAIN=apps.ghostdeploy.com
```

Use the staging equivalents for staging. Platform Settings must use the same public/panel base URL and application base domain. Verify both platform domains in the admin screen after DNS and TLS are ready.

## Provider updates

1. Add new DNS records without deleting the old records.
2. Add the new FQDNs in Coolify and wait for valid TLS certificates.
3. Update PayU and Razorpay callback/webhook URLs to `ghostdeploy.com`.
4. Update the GitHub App homepage, callback, setup, and webhook URLs.
5. Rename or transfer the GitHub repository when ready, then set `GHOST_DEPLOY_REPOSITORY_URL` to its clone URL before running the staging deployment script. Its current repository fallback remains available during the transition.
6. Update MSG91 templates or links only where they contain the old name/domain.
7. Update sender names, legal pages, analytics, monitoring, and status links.
8. Run registration, checkout, GitHub installation, private deployment, webhook redeployment, domain, and TLS acceptance tests.
9. Redirect retired public URLs only after the new origin is verified.

## Secrets and compatibility

The rename does not require rotating payment, Coolify, DNS-provider, OTP, encryption, JWT, or database secrets. Existing JWT issuer/audience identifiers intentionally remain unchanged so active sessions, checkout tokens, and GitHub installation state tokens remain valid during cutover.

Regenerate a secret only if it was exposed, a provider requires a new application, or as part of planned rotation. Renaming the existing GitHub App does not inherently require a new private key, client secret, webhook secret, or state secret. If a new GitHub App is created instead, replace every `GITHUB_APP_*` credential and provision/register its Coolify private key UUID before enabling private repositories.
