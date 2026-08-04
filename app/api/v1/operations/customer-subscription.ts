import { resp } from '@qubitcodes/qcresp';
import { SubscriptionAdministrationController } from '@controllers/SubscriptionAdministrationController';
import { subscriptionLifecycleSchema } from '@schemas/subscriptionAdministration';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const id = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!id.success) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, subscriptionLifecycleSchema); return input instanceof Response ? input : SubscriptionAdministrationController.lifecycle(request, id.data, input, getRequestMetadata(request)); }
