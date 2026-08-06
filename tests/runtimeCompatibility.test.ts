import { describe, expect, it } from 'vitest';

import { nixpacksRuntimeVersion } from '@services/provisioning/runtimeCompatibilityService';

describe('nixpacksRuntimeVersion', () => {
	it('uses a supported Node package while Coolify Nixpacks lacks nodejs_24', () => {
		expect(nixpacksRuntimeVersion('node', '24.18.0')).toBe('22');
		expect(nixpacksRuntimeVersion('node', '22.23.1')).toBe('22');
	});

	it('preserves runtime versions for other stacks', () => {
		expect(nixpacksRuntimeVersion('php', '8.5.8')).toBe('8.5.8');
	});
});
