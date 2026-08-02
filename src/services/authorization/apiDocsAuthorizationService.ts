import { resp } from '@qubitcodes/qcresp';

import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import { getRequestMetadata } from '@utils/request';

export const API_DOCS_PERMISSION = 'api_docs.view';
export const API_DOCS_COOKIE = 'qubit_api_docs_access';

/** Returns a deliberately indistinguishable JSON 404 for hidden API documentation. */
export function apiDocsNotFound(): Response {
	return resp.failure(
		'Resource not found.',
		resp.codes.RESOURCE_NOT_FOUND,
		undefined,
		null,
		undefined,
		404,
	);
}

/** Converts the scoped HttpOnly documentation cookie into an authorization header. */
function requestWithDocumentationToken(request: Request): Request {
	if (request.headers.has('authorization')) return request;
	const token = request.headers
		.get('cookie')
		?.split(';')
		.map((value) => value.trim().split('='))
		.find(([name]) => name === API_DOCS_COOKIE)?.[1];
	if (!token) return request;
	const headers = new Headers(request.headers);
	headers.set('authorization', `Bearer ${decodeURIComponent(token)}`);
	return new Request(request, { headers });
}

/** Authorizes documentation without disclosing whether the protected resource exists. */
export async function authorizeApiDocs(request: Request): Promise<boolean> {
	try {
		const authorizedRequest = requestWithDocumentationToken(request);
		await authorizeAdmin(
			authorizedRequest,
			API_DOCS_PERMISSION,
			getRequestMetadata(authorizedRequest),
		);
		return true;
	} catch {
		return false;
	}
}

