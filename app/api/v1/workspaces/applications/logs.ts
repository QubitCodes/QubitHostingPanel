import { ApplicationController } from '@controllers/ApplicationController';
import { applicationPublicIdSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';
export async function loader({ params, request }: { params: { applicationId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const applicationId = applicationPublicIdSchema.safeParse(params.applicationId); return workspaceId.success && applicationId.success ? ApplicationController.logs(request, workspaceId.data, applicationId.data, getRequestMetadata(request)) : resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
