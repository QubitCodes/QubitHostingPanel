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
	const accessToken = sessionStorage.getItem('accessToken');
	const headers = new Headers(init.headers);
	if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
	headers.set('x-device-id', getDeviceIdentifier());
	return fetch(input, { ...init, headers });
}

