import { resp } from '@qubitcodes/qcresp';

import { PackageController } from '@controllers/PackageController';
import {
	deletePackageSchema,
	packageSlugSchema,
	updatePackageSchema,
} from '@schemas/package';
import { getRequestMetadata, parseJson } from '@utils/request';

interface Arguments {
	params: { packageSlug?: string };
	request: Request;
}

export async function loader({ params, request }: Arguments): Promise<Response> {
	const slug = packageSlugSchema.safeParse(params.packageSlug);
	return slug.success
		? PackageController.show(request, slug.data, getRequestMetadata(request))
		: resp.failure(
				'Invalid package slug.',
				resp.codes.VALIDATION_ERROR,
				slug.error.issues,
				null,
				undefined,
				400,
			);
}

export async function action({ params, request }: Arguments): Promise<Response> {
	const slug = packageSlugSchema.safeParse(params.packageSlug);
	if (!slug.success)
		return resp.failure(
			'Invalid package slug.',
			resp.codes.VALIDATION_ERROR,
			slug.error.issues,
			null,
			undefined,
			400,
		);
	const metadata = getRequestMetadata(request);
	if (request.method === 'PATCH') {
		const input = await parseJson(request, updatePackageSchema);
		return input instanceof Response
			? input
			: PackageController.update(request, slug.data, input, metadata);
	}
	if (request.method === 'DELETE') {
		const input = await parseJson(request, deletePackageSchema);
		return input instanceof Response
			? input
			: PackageController.remove(request, slug.data, input.reason, metadata);
	}
	return resp.failure(
		'Method not allowed.',
		resp.codes.GENERAL_CLIENT_ERROR,
		undefined,
		null,
		undefined,
		405,
	);
}
