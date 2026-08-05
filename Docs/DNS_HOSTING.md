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

The authoritative adapter supports self-hosted PowerDNS and Cloudflare. Ghost Deploy currently uses PowerDNS on the platform server, controlled through a private API whose key is encrypted at rest. GoDaddy and Hostinger connections are import sources and registrar integrations, not customer-visible authoritative infrastructure.

The MVA exposes `ns1.ghostdeploy.com` and `ns2.ghostdeploy.com`, currently backed by the same Elastic IP. This avoids a second server during controlled testing but is not redundant: a host, network, or region outage makes both nameservers unavailable. A separate secondary DNS node remains required before offering a high-availability DNS commitment.

PowerDNS state resides in the `ghostdeploy-pdns-data` Docker volume. The root-only API-key file is `/opt/ghostdeploy-dns/pdns.env`; neither it nor the private API port may be exposed publicly. Backups must include the PowerDNS volume and the API-key file. Public access is limited to TCP/UDP port 53.

Platform-managed records cannot be edited manually. Customer API responses expose publication and synchronization status but exclude backing-provider names and identifiers.

## Deferred live verification

Live domain delegation and destructive registrar changes remain in the deferred domain-testing checklist. Automated validation covers record parsing, customer-safe DTOs, application record lifecycle, API validation, and build integrity.
