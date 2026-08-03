import { getEnvironment } from '@config/env';
import { CoolifyHostingProvider } from '@services/hosting/CoolifyHostingProvider';
import type { HostingProvider } from '@services/hosting/HostingProvider';
import { MockHostingProvider } from '@services/hosting/MockHostingProvider';

/** Selects the configured hosting adapter without leaking provider decisions into controllers. */
export function hostingProvider(): HostingProvider {
	const environment = getEnvironment();
	if (environment.HOSTING_PROVIDER === 'coolify') {
		if (environment.COOLIFY_ENABLED !== 'true') throw new Error('Coolify is disabled.');
		return new CoolifyHostingProvider();
	}
	return new MockHostingProvider();
}
