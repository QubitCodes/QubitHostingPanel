import { describe, expect, it } from 'vitest';

import { updatePlatformSettingsSchema } from '@schemas/platformSettings';

describe('platform settings validation', () => {
	it('accepts same-domain routing without a separate panel URL', () => {
		expect(updatePlatformSettingsSchema.safeParse({ applicationBaseDomain: 'apps.example.com', defaultApplicationSubdomainEnabled: true, panelBaseUrl: null, panelDomainMode: 'same_domain', publicBaseUrl: 'https://example.com' }).success).toBe(true);
	});

	it('requires a distinct HTTPS URL for separate-domain routing', () => {
		expect(updatePlatformSettingsSchema.safeParse({ applicationBaseDomain: 'apps.example.com', defaultApplicationSubdomainEnabled: true, panelBaseUrl: null, panelDomainMode: 'separate_domain', publicBaseUrl: 'https://example.com' }).success).toBe(false);
		expect(updatePlatformSettingsSchema.safeParse({ applicationBaseDomain: 'apps.example.com', defaultApplicationSubdomainEnabled: true, panelBaseUrl: 'https://panel.example.com', panelDomainMode: 'separate_domain', publicBaseUrl: 'https://example.com' }).success).toBe(true);
	});
});
