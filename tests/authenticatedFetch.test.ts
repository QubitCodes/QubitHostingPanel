import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		get length() { return values.size; },
		removeItem: (key) => { values.delete(key); },
		setItem: (key, value) => { values.set(key, String(value)); },
	};
}

describe('authenticated fetch refresh coordination', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', memoryStorage());
		vi.stubGlobal('sessionStorage', memoryStorage());
		sessionStorage.setItem('accessToken', 'expired-access');
		sessionStorage.setItem('refreshToken', 'valid-refresh');
	});

	it('shares one rotating refresh request across concurrent 401 responses', async () => {
		let refreshCalls = 0;
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input) === '/api/v1/auth/refresh') {
				refreshCalls += 1;
				await new Promise((resolve) => setTimeout(resolve, 5));
				return Response.json({ status: true, misc: { accessToken: 'fresh-access', refreshToken: 'rotated-refresh' } });
			}
			const authorization = new Headers(init?.headers).get('authorization');
			return authorization === 'Bearer fresh-access' ? Response.json({ status: true }) : Response.json({ status: false }, { status: 401 });
		}));
		const responses = await Promise.all([authenticatedFetch('/api/a'), authenticatedFetch('/api/b')]);
		expect(responses.every(({ ok }) => ok)).toBe(true);
		expect(refreshCalls).toBe(1);
		expect(sessionStorage.getItem('refreshToken')).toBe('rotated-refresh');
	});
});
