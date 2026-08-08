import { ApplicationTrafficPolicyController } from '@controllers/ApplicationTrafficPolicyController';

/** Renders a suspended page even when the customer container is offline. */
export const loader = ({ request }: { request: Request }) =>
	ApplicationTrafficPolicyController.suspendedFallback(request);
