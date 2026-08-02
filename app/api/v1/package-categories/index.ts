import { PackageController } from '@controllers/PackageController';
import { createPackageCategorySchema } from '@schemas/package';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({ request }: { request: Request }): Promise<Response> {
	return PackageController.categories(request, getRequestMetadata(request));
}

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, createPackageCategorySchema);
	return input instanceof Response
		? input
		: PackageController.createCategory(
				request,
				input,
				getRequestMetadata(request),
			);
}
