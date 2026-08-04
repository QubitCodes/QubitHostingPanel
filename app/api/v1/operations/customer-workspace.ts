import { resp } from '@qubitcodes/qcresp';
import { SubscriptionAdministrationController } from '@controllers/SubscriptionAdministrationController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const id = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); return id.success ? SubscriptionAdministrationController.show(request, id.data, getRequestMetadata(request)) : Promise.resolve(resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404)); }
