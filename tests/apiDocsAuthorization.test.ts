import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeAdmin } = vi.hoisted(() => ({
	authorizeAdmin: vi.fn(),
}));

vi.mock('@services/authorization/adminAuthorizationService', () => ({
	authorizeAdmin,
}));

import {
	API_DOCS_COOKIE,
	API_DOCS_PERMISSION,
	apiDocsNotFound,
	authorizeApiDocs,
} from '@services/authorization/apiDocsAuthorizationService';

describe('API documentation authorization', () => {
	beforeEach(() => authorizeAdmin.mockReset());

	it('authorizes the documentation cookie using the dedicated permission', async () => {
		authorizeAdmin.mockResolvedValue({});
		const allowed = await authorizeApiDocs(
			new Request('http://localhost/api/docs', {
				headers: { cookie: `${API_DOCS_COOKIE}=signed-token` },
			}),
		);

		expect(allowed).toBe(true);
		expect(authorizeAdmin).toHaveBeenCalledWith(
			expect.objectContaining({}),
			API_DOCS_PERMISSION,
			expect.any(Object),
		);
		const request = authorizeAdmin.mock.calls[0]?.[0] as Request;
		expect(request.headers.get('authorization')).toBe('Bearer signed-token');
	});

	it('hides denied documentation behind the standard JSON 404', async () => {
		const response = apiDocsNotFound();
		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(await response.json()).toMatchObject({
			code: 310,
			status: false,
		});
	});
});
