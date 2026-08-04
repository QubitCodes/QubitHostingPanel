import { resp } from '@qubitcodes/qcresp';
import { UsageController } from '@controllers/UsageController';
import { revokeUsageOverrideSchema, usageOverrideIdSchema } from '@schemas/usage';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { workspaceId?: string; overrideId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const overrideId = usageOverrideIdSchema.safeParse(params.overrideId); if (!workspaceId.success || !overrideId.success) return resp.failure('Override not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, revokeUsageOverrideSchema); return input instanceof Response ? input : UsageController.revoke(request, workspaceId.data, overrideId.data, input, getRequestMetadata(request)); }
