import { PackageController } from '@controllers/PackageController';
import { createPackageSchema } from '@schemas/package';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({ request }: { request: Request }): Promise<Response> {
	return PackageController.index(request, getRequestMetadata(request));
}

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, createPackageSchema);
	return input instanceof Response
		? input
		: PackageController.create(request, input, getRequestMetadata(request));
}
