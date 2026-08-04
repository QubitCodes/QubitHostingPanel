import { resp } from '@qubitcodes/qcresp';
import { UsageController } from '@controllers/UsageController';
import { usageObservationSchema, usageOverrideSchema } from '@schemas/usage';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const id = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); return id.success ? UsageController.admin(request, id.data, getRequestMetadata(request)) : Promise.resolve(resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404)); }
export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const id = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!id.success) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const metadata = getRequestMetadata(request); if (new URL(request.url).searchParams.get('action') === 'observe') { const input = await parseJson(request, usageObservationSchema); return input instanceof Response ? input : UsageController.observation(request, id.data, input, metadata); } const input = await parseJson(request, usageOverrideSchema); return input instanceof Response ? input : UsageController.override(request, id.data, input, metadata); }
