import { resp } from '@qubitcodes/qcresp';
import { ApplicationDomainController } from '@controllers/ApplicationDomainController';
import { createApplicationDomainSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({ params, request }: { params: { applicationId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); return workspaceId.success && params.applicationId ? ApplicationDomainController.index(request, workspaceId.data, params.applicationId, getRequestMetadata(request)) : resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
export async function action({ params, request }: { params: { applicationId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!workspaceId.success || !params.applicationId) return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, createApplicationDomainSchema); return input instanceof Response ? input : ApplicationDomainController.create(request, workspaceId.data, params.applicationId, input, getRequestMetadata(request)); }
