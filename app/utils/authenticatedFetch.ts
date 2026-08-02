const DEVICE_IDENTIFIER_KEY = 'qubit-panel-device-id';

/** Returns a stable browser-install identifier used only to correlate user-visible session devices. */
export function getDeviceIdentifier(): string {
	let identifier = localStorage.getItem(DEVICE_IDENTIFIER_KEY);
	if (!identifier) {
		identifier = crypto.randomUUID();
		localStorage.setItem(DEVICE_IDENTIFIER_KEY, identifier);
	}
	return identifier;
}

/** Adds the current access token and privacy-safe device identifier to an API request. */
export function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	return performAuthenticatedFetch(input, init);
}

async function performAuthenticatedFetch(input: RequestInfo | URL, init: RequestInit, retry = true): Promise<Response> {
	const accessToken = sessionStorage.getItem('accessToken');
	const headers = new Headers(init.headers);
	if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
	headers.set('x-device-id', getDeviceIdentifier());
	const response = await fetch(input, { ...init, headers });
	const refreshToken = sessionStorage.getItem('refreshToken');
	if (response.status !== 401 || !retry || !refreshToken) return response;
	const refreshed = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-id': getDeviceIdentifier() }, body: JSON.stringify({ refreshToken }) });
	const body = await refreshed.json() as { misc?: { accessToken?: string; refreshToken?: string }; status: boolean };
	if (!refreshed.ok || !body.status || !body.misc?.accessToken || !body.misc.refreshToken) {
		sessionStorage.removeItem('accessToken'); sessionStorage.removeItem('refreshToken');
		return response;
	}
	sessionStorage.setItem('accessToken', body.misc.accessToken);
	sessionStorage.setItem('refreshToken', body.misc.refreshToken);
	return performAuthenticatedFetch(input, init, false);
}

export function clearAuthentication(): void {
	sessionStorage.removeItem('accessToken');
	sessionStorage.removeItem('refreshToken');
	sessionStorage.removeItem('authUser');
	sessionStorage.removeItem('canViewApiDocs');
}
