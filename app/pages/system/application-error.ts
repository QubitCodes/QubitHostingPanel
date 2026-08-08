import { ApplicationTrafficPolicyController } from '@controllers/ApplicationTrafficPolicyController';

/** Renders the standard application failure page used by Traefik's error middleware. */
export const loader = ({ request }: { request: Request }) =>
	ApplicationTrafficPolicyController.errorPage(request);
