import { resp } from '@qubitcodes/qcresp';
import { ApplicationDomainController } from '@controllers/ApplicationDomainController';
import { updateApplicationDomainSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { applicationId?: string; domainId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!workspaceId.success || !params.applicationId || !params.domainId) return resp.failure('Domain not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); if (request.method === 'DELETE') return ApplicationDomainController.remove(request, workspaceId.data, params.applicationId, params.domainId, getRequestMetadata(request)); const input = await parseJson(request, updateApplicationDomainSchema); return input instanceof Response ? input : ApplicationDomainController.update(request, workspaceId.data, params.applicationId, params.domainId, input, getRequestMetadata(request)); }
