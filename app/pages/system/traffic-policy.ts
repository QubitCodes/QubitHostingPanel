import { ApplicationTrafficPolicyController } from '@controllers/ApplicationTrafficPolicyController';

/** Provider-facing policy route used for both safe reads and state-changing requests. */
export const loader = ({ request }: { request: Request }) =>
	ApplicationTrafficPolicyController.evaluate(request);

/** Provider-facing policy route used for both safe reads and state-changing requests. */
export const action = ({ request }: { request: Request }) =>
	ApplicationTrafficPolicyController.evaluate(request);
