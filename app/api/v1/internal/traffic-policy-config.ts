import { InternalTrafficPolicyController } from '@controllers/InternalTrafficPolicyController';

/** Returns the authenticated host-agent routing contract. */
export const loader = ({ request }: { request: Request }) =>
	InternalTrafficPolicyController.show(request);
