import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface ApiEnvelope<T> {
	data?: T;
	message: string;
	status: boolean;
}

interface CacheEntry {
	expiresAt: number;
	value: unknown;
}

const CACHE_TTL_MS = 30_000;
const responseCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<unknown>>();

/** Fetch dashboard data while deduplicating concurrent requests and briefly caching completed reads. */
export async function dashboardData<T>(path: string, force = false): Promise<T> {
	const cached = responseCache.get(path);
	if (!force && cached && cached.expiresAt > Date.now()) return cached.value as T;

	const pending = pendingRequests.get(path);
	if (!force && pending) return pending as Promise<T>;

	const request = authenticatedFetch(path)
		.then(async (response) => {
			const body = (await response.json()) as ApiEnvelope<T>;
			if (!response.ok || !body.status || body.data === undefined) {
				throw new Error(body.message || 'Unable to load dashboard data.');
			}
			responseCache.set(path, {
				expiresAt: Date.now() + CACHE_TTL_MS,
				value: body.data,
			});
			return body.data;
		})
		.finally(() => pendingRequests.delete(path));

	pendingRequests.set(path, request);
	return request;
}

/** Invalidate cached dashboard reads after a mutation or authentication change. */
export function clearDashboardData(pathPrefix?: string): void {
	if (!pathPrefix) {
		responseCache.clear();
		pendingRequests.clear();
		return;
	}
	for (const path of responseCache.keys()) {
		if (path.startsWith(pathPrefix)) responseCache.delete(path);
	}
}
