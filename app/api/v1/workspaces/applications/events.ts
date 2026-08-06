import { resp } from '@qubitcodes/qcresp';

import { ApplicationController } from '@controllers/ApplicationController';
import { applicationPublicIdSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

/** Opens an authenticated server-sent event stream for one application. */
export function loader({
	params,
	request,
}: {
	params: { applicationId?: string; workspaceId?: string };
	request: Request;
}): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(
		Number(params.workspaceId),
	);
	const applicationId = applicationPublicIdSchema.safeParse(
		params.applicationId,
	);
	return workspaceId.success && applicationId.success
		? ApplicationController.events(
				request,
				workspaceId.data,
				applicationId.data,
				getRequestMetadata(request),
			)
		: Promise.resolve(
				resp.failure(
					'Application not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				),
			);
}
