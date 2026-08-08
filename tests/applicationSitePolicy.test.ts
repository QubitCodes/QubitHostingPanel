import { describe, expect, it } from 'vitest';

import {
	defaultApplicationSitePolicy,
	effectiveApplicationSiteState,
} from '@services/applications/applicationSitePolicyService';
import { managedSystemPage } from '@services/applications/systemPageService';

describe('managed application site policies', () => {
	it('expires maintenance and coming-soon states without rewriting the stored toggle', () => {
		const now = new Date('2026-08-08T12:00:00.000Z');
		expect(
			effectiveApplicationSiteState(
				{
					comingSoonEnabled: true,
					comingSoonExpiresAt: new Date('2026-08-08T11:59:59.000Z'),
					maintenanceEnabled: true,
					maintenanceExpiresAt: new Date('2026-08-08T12:00:01.000Z'),
				},
				now,
			),
		).toEqual({ comingSoonActive: false, maintenanceActive: true });
	});

	it('keeps generic stacks migration-safe by default', () => {
		expect(defaultApplicationSitePolicy('express').migrateOnDeploy).toBe(false);
	});

	it('escapes customer-controlled values in standard pages', () => {
		const html = managedSystemPage({
			detail: '<script>alert(1)</script>',
			hostname: 'example.com',
			kind: 'maintenance',
		});
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
	});
});
