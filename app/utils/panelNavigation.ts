import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface PlatformConfiguration { panelBaseUrl: string; panelDomainMode: 'same_domain' | 'separate_domain'; panelDomainReady: boolean }

/** Opens a panel route directly or through a one-time cross-origin session handoff. */
export async function openPanelPath(targetPath: '/admin/overview' | '/dashboard'): Promise<void> {
	const configurationResponse = await fetch('/api/v1/public/platform');
	const configurationBody = await configurationResponse.json() as { data?: PlatformConfiguration; status: boolean };
	const configuration = configurationBody.data;
	if (!configurationResponse.ok || !configurationBody.status || !configuration) throw new Error('Platform routing is unavailable.');
	const panelOrigin = new URL(configuration.panelBaseUrl).origin;
	if (configuration.panelDomainMode !== 'separate_domain' || !configuration.panelDomainReady || panelOrigin === window.location.origin) { window.location.assign(targetPath); return; }
	const response = await authenticatedFetch('/api/v1/auth/handoff', { body: JSON.stringify({ targetPath }), headers: { 'content-type': 'application/json' }, method: 'POST' });
	const body = await response.json() as { data?: { handoffUrl?: string }; message: string; status: boolean };
	if (!response.ok || !body.status || !body.data?.handoffUrl) throw new Error(body.message);
	window.location.assign(body.data.handoffUrl);
}

/** Opens a protected database-manager route in an independently authenticated tab. */
export async function openAuthenticatedPanelTab(targetPath: `/database/${string}`): Promise<void> {
	const popup = window.open('about:blank', '_blank');
	if (!popup) throw new Error('Allow popups for Ghost Deploy, then try opening the database again.');
	popup.opener = null;
	try {
		const response = await authenticatedFetch('/api/v1/auth/handoff', { body: JSON.stringify({ targetPath }), headers: { 'content-type': 'application/json' }, method: 'POST' });
		const body = await response.json() as { data?: { handoffUrl?: string }; message: string; status: boolean };
		if (!response.ok || !body.status || !body.data?.handoffUrl) throw new Error(body.message);
		popup.location.replace(body.data.handoffUrl);
	} catch (error) {
		popup.close();
		throw error;
	}
}
