# Managed DNS hosting

Ghost Deploy provides authoritative DNS management from each verified root domain's **DNS Config** tab. The customer-facing contract is provider-neutral: internal account, zone, and record identifiers are never returned.

## Customer workflow

1. Verify ownership of a root domain.
2. Capture existing records through a public scan, BIND zone file, GoDaddy, or Hostinger.
3. Review the draft and enable managed DNS.
4. Replace the registrar nameservers with those assigned by Ghost Deploy.
5. Refresh delegation until the zone becomes active.
6. Create, edit, or delete records from Ghost Deploy. Changes synchronize immediately; **Sync records** retries unpublished draft records.

Application subdomains owned by the platform receive managed A and AAAA records automatically. Explicit records are skipped when an enabled wildcard A record covers the hostname. Removing the application-domain binding removes only records created for that binding.

## Platform operations

The authoritative adapter currently uses the platform Cloudflare connection configured under platform settings. Credentials are encrypted at rest and may fall back to environment configuration for recovery. GoDaddy and Hostinger connections are import sources and registrar integrations, not customer-visible authoritative infrastructure.

Platform-managed records cannot be edited manually. Customer API responses expose publication and synchronization status but exclude backing-provider names and identifiers.

## Deferred live verification

Live domain delegation and destructive registrar changes remain in the deferred domain-testing checklist. Automated validation covers record parsing, customer-safe DTOs, application record lifecycle, API validation, and build integrity.
