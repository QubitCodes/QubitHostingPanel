import { resp } from '@qubitcodes/qcresp';
import type { z } from 'zod';

export interface RequestMetadata {
	ipAddress?: string;
	userAgent?: string;
}

/** Extracts bounded request metadata without trusting it for authorization. */
export function getRequestMetadata(request: Request): RequestMetadata {
	const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	return {
		...(forwarded ? { ipAddress: forwarded.slice(0, 64) } : {}),
		...(request.headers.get('user-agent') ? { userAgent: request.headers.get('user-agent')!.slice(0, 500) } : {})
	};
}

/** Parses a strict JSON request and returns a standardized validation failure. */
export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
		return resp.failure('Content-Type must be application/json.', resp.codes.UNSUPPORTED_MEDIA_TYPE, undefined, null, undefined, 415);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return resp.failure('Request body must contain valid JSON.', resp.codes.INVALID_FORMAT, undefined, null, undefined, 400);
	}

	const result = schema.safeParse(body);
	if (!result.success) {
		return resp.failure('Validation failed.', resp.codes.VALIDATION_ERROR, result.error.issues, null, undefined, 400);
	}
	return result.data;
}

