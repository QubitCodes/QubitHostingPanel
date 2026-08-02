import { resp } from '@qubitcodes/qcresp';
import { PackageController } from '@controllers/PackageController';
import { packageSlugSchema, setPackageEntitlementsSchema } from '@schemas/package';
import { getRequestMetadata, parseJson } from '@utils/request';

interface Arguments { params: { packageSlug?: string }; request: Request; }
export async function action({ params, request }: Arguments): Promise<Response> {
	if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const slug = packageSlugSchema.safeParse(params.packageSlug);
	if (!slug.success) return resp.failure('Invalid package slug.', resp.codes.VALIDATION_ERROR, slug.error.issues, null, undefined, 400);
	const input = await parseJson(request, setPackageEntitlementsSchema);
	return input instanceof Response ? input : PackageController.setEntitlements(request, slug.data, input, getRequestMetadata(request));
}
