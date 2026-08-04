import { resp } from '@qubitcodes/qcresp';
import { DnsController } from '@controllers/DnsController';
import { updateDnsRecordSchema } from '@schemas/dns';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { domainId?: string; recordId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!workspaceId.success || !params.domainId || !params.recordId) return resp.failure('DNS record not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); if (request.method === 'DELETE') return DnsController.mutateRecord(request, workspaceId.data, params.domainId, params.recordId, undefined, getRequestMetadata(request)); const input = await parseJson(request, updateDnsRecordSchema); return input instanceof Response ? input : DnsController.mutateRecord(request, workspaceId.data, params.domainId, params.recordId, input, getRequestMetadata(request)); }
