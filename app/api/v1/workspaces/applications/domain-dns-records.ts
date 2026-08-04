import { resp } from '@qubitcodes/qcresp';
import { DnsController } from '@controllers/DnsController';
import { createDnsRecordSchema } from '@schemas/dns';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { domainId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!workspaceId.success || !params.domainId) return resp.failure('Domain not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, createDnsRecordSchema); return input instanceof Response ? input : DnsController.createRecord(request, workspaceId.data, params.domainId, input, getRequestMetadata(request)); }
