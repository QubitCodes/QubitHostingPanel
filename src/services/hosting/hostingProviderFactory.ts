import { getEnvironment } from '@config/env';
import type { HostingProvider } from '@services/hosting/HostingProvider';
import { MockHostingProvider } from '@services/hosting/MockHostingProvider';
import { managedCoolifyProvider } from '@services/hosting/providerConnectionService';

/** Selects the configured hosting adapter without leaking provider decisions into controllers. */
export async function hostingProvider(): Promise<HostingProvider> {
	const environment = getEnvironment();
	if (environment.HOSTING_PROVIDER === 'coolify') {
		if (environment.COOLIFY_ENABLED !== 'true') throw new Error('Coolify is disabled.');
		return managedCoolifyProvider();
	}
	return new MockHostingProvider();
}
