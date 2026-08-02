import { resp } from '@qubitcodes/qcresp';
import { z } from 'zod';

import { PackageController } from '@controllers/PackageController';
import { packageSlugSchema } from '@schemas/package';
import { getRequestMetadata } from '@utils/request';

interface Arguments { params: { packageSlug?: string; priceId?: string }; request: Request; }

function parse(params: Arguments['params']) {
	return z.object({ packageSlug: packageSlugSchema, priceId: z.uuid() }).safeParse(params);
}

export async function loader({ params, request }: Arguments): Promise<Response> {
	const input = parse(params);
	return input.success ? PackageController.priceDeletionImpact(request, input.data.packageSlug, input.data.priceId, getRequestMetadata(request)) : resp.failure('Invalid package price.', resp.codes.VALIDATION_ERROR, input.error.issues, null, undefined, 400);
}

export async function action({ params, request }: Arguments): Promise<Response> {
	if (request.method !== 'DELETE') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = parse(params);
	return input.success ? PackageController.removePrice(request, input.data.packageSlug, input.data.priceId, getRequestMetadata(request)) : resp.failure('Invalid package price.', resp.codes.VALIDATION_ERROR, input.error.issues, null, undefined, 400);
}
