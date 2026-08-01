import { resp } from '@qubitcodes/qcresp';

import { SessionController } from '@controllers/SessionController';
import { sessionIdSchema, updateSessionLabelSchema } from '@schemas/auth';
import { getRequestMetadata, parseJson } from '@utils/request';

interface SessionRouteArguments { params: { sessionId?: string }; request: Request }

export async function loader({ params, request }: SessionRouteArguments): Promise<Response> {
	const sessionId = sessionIdSchema.safeParse(params.sessionId);
	return sessionId.success
		? SessionController.show(request, sessionId.data, getRequestMetadata(request))
		: resp.failure('Invalid session ID.', resp.codes.VALIDATION_ERROR, sessionId.error.issues, null, undefined, 400);
}

export async function action({ params, request }: SessionRouteArguments): Promise<Response> {
	const sessionId = sessionIdSchema.safeParse(params.sessionId);
	if (!sessionId.success) return resp.failure('Invalid session ID.', resp.codes.VALIDATION_ERROR, sessionId.error.issues, null, undefined, 400);
	const metadata = getRequestMetadata(request);
	if (request.method === 'DELETE') return SessionController.revoke(request, sessionId.data, metadata);
	if (request.method === 'PATCH') {
		const input = await parseJson(request, updateSessionLabelSchema);
		return input instanceof Response ? input : SessionController.updateLabel(request, sessionId.data, input.label, metadata);
	}
	return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
}

