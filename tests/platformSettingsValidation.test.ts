import { describe, expect, it } from "vitest";

import { updatePlatformSettingsSchema } from "@schemas/platformSettings";

describe("platform settings validation", () => {
  it("accepts same-domain routing without a separate panel URL", () => {
    expect(
      updatePlatformSettingsSchema.safeParse({
        blockedDomainKeywords: [],
        applicationBaseDomain: "apps.example.com",
        defaultApplicationSubdomainEnabled: true,
        dnsProvider: "cloudflare",
        domainOwnershipVerificationEnabled: false,
        ingressIpv4: null,
        ingressIpv6: null,
        panelBaseUrl: null,
        panelDomainMode: "same_domain",
        publicBaseUrl: "https://example.com",
        reservedDomainLabels: [],
      }).success,
    ).toBe(true);
  });

  it("accepts self-hosted PowerDNS as the authoritative provider", () => {
    const result = updatePlatformSettingsSchema.safeParse({
      blockedDomainKeywords: [],
      applicationBaseDomain: "apps.ghostdeploy.com",
      defaultApplicationSubdomainEnabled: true,
      dnsProvider: "powerdns",
      domainOwnershipVerificationEnabled: true,
      ingressIpv4: "3.6.77.89",
      ingressIpv6: null,
      panelBaseUrl: null,
      panelDomainMode: "same_domain",
      publicBaseUrl: "https://ghostdeploy.com",
      reservedDomainLabels: [],
    });
    expect(result.success).toBe(true);
  });

  it("requires a distinct HTTPS URL for separate-domain routing", () => {
    expect(
      updatePlatformSettingsSchema.safeParse({
        blockedDomainKeywords: [],
        applicationBaseDomain: "apps.example.com",
        defaultApplicationSubdomainEnabled: true,
        dnsProvider: "cloudflare",
        domainOwnershipVerificationEnabled: true,
        ingressIpv4: null,
        ingressIpv6: null,
        panelBaseUrl: null,
        panelDomainMode: "separate_domain",
        publicBaseUrl: "https://example.com",
        reservedDomainLabels: [],
      }).success,
    ).toBe(false);
    expect(
      updatePlatformSettingsSchema.safeParse({
        blockedDomainKeywords: [],
        applicationBaseDomain: "apps.example.com",
        defaultApplicationSubdomainEnabled: true,
        dnsProvider: "cloudflare",
        domainOwnershipVerificationEnabled: true,
        ingressIpv4: "203.0.113.10",
        ingressIpv6: null,
        panelBaseUrl: "https://panel.example.com",
        panelDomainMode: "separate_domain",
        publicBaseUrl: "https://example.com",
        reservedDomainLabels: [],
      }).success,
    ).toBe(true);
  });
});
