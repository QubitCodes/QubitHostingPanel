const DEVICE_IDENTIFIER_KEY = 'qubit-panel-device-id';
let refreshPromise: Promise<boolean> | null = null;
let authChannel: BroadcastChannel | null = null;

/** Synchronizes rotated credentials between same-origin tabs without persisting them. */
function authenticationChannel(): BroadcastChannel | null {
	if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') return null;
	if (authChannel) return authChannel;
	authChannel = new window.BroadcastChannel('ghostdeploy-auth');
	authChannel.addEventListener('message', (event: MessageEvent<{ accessToken?: string; refreshToken?: string; type: 'clear' | 'tokens' }>) => {
		if (event.data.type === 'tokens' && event.data.accessToken && event.data.refreshToken) {
			sessionStorage.setItem('accessToken', event.data.accessToken);
			sessionStorage.setItem('refreshToken', event.data.refreshToken);
		}
		if (event.data.type === 'clear') {
			sessionStorage.removeItem('accessToken');
			sessionStorage.removeItem('refreshToken');
		}
	});
	return authChannel;
}

async function rotateAuthentication(failedAccessToken: string | null): Promise<boolean> {
	const execute = async (): Promise<boolean> => {
		// Give a successful refresh in another tab time to broadcast its tokens.
		await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
		const latestAccessToken = sessionStorage.getItem('accessToken');
		if (failedAccessToken && latestAccessToken && latestAccessToken !== failedAccessToken) return true;
		const currentRefreshToken = sessionStorage.getItem('refreshToken');
		if (!currentRefreshToken) return false;
		try {
			const refreshed = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-id': getDeviceIdentifier() }, body: JSON.stringify({ refreshToken: currentRefreshToken }) });
			const body = await refreshed.json() as { misc?: { accessToken?: string; refreshToken?: string }; status: boolean };
			if (!refreshed.ok || !body.status || !body.misc?.accessToken || !body.misc.refreshToken) {
				return sessionStorage.getItem('refreshToken') !== currentRefreshToken;
			}
			sessionStorage.setItem('accessToken', body.misc.accessToken);
			sessionStorage.setItem('refreshToken', body.misc.refreshToken);
			authenticationChannel()?.postMessage({ type: 'tokens', accessToken: body.misc.accessToken, refreshToken: body.misc.refreshToken });
			return true;
		} catch {
			return false;
		}
	};
	if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('ghostdeploy-auth-refresh', execute);
	return execute();
}

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
	authenticationChannel();
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
	const latestAccessToken = sessionStorage.getItem('accessToken');
	if (accessToken && latestAccessToken && latestAccessToken !== accessToken) return performAuthenticatedFetch(input, init, false);
	if (!refreshPromise) {
		refreshPromise = rotateAuthentication(accessToken)
			.finally(() => {
				refreshPromise = null;
			});
	}
	if (!await refreshPromise) {
		sessionStorage.removeItem('accessToken');
		sessionStorage.removeItem('refreshToken');
		return response;
	}
	return performAuthenticatedFetch(input, init, false);
}

export function clearAuthentication(): void {
	sessionStorage.removeItem('accessToken');
	sessionStorage.removeItem('refreshToken');
	sessionStorage.removeItem('authUser');
	sessionStorage.removeItem('canViewApiDocs');
	sessionStorage.removeItem('isSuperAdmin');
	authenticationChannel()?.postMessage({ type: 'clear' });
}
