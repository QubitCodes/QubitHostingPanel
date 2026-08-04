import { SubscriptionAdministrationController } from '@controllers/SubscriptionAdministrationController';
import { getRequestMetadata } from '@utils/request';

export function loader({ request }: { request: Request }): Promise<Response> { return SubscriptionAdministrationController.index(request, getRequestMetadata(request)); }
