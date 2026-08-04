import { resp } from '@qubitcodes/qcresp';
import { ApplicationDomainController } from '@controllers/ApplicationDomainController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export async function action({ params, request }: { params: { applicationId?: string; domainId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); return workspaceId.success && params.applicationId && params.domainId ? ApplicationDomainController.verify(request, workspaceId.data, params.applicationId, params.domainId, getRequestMetadata(request)) : resp.failure('Domain not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
