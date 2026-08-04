import { resp } from '@qubitcodes/qcresp';
import { SubscriptionAdministrationController } from '@controllers/SubscriptionAdministrationController';
import { subscriptionAddOnCancellationSchema } from '@schemas/subscriptionAdministration';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { workspaceId?: string; itemId?: string }; request: Request }): Promise<Response> { const id = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!id.success || !params.itemId) return resp.failure('Subscription item not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, subscriptionAddOnCancellationSchema); return input instanceof Response ? input : SubscriptionAdministrationController.cancelAddOn(request, id.data, params.itemId, input, getRequestMetadata(request)); }
