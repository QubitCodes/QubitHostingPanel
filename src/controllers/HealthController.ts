import { resp } from '@qubitcodes/qcresp';

export class HealthController {
	/** Returns process health without requiring database or provider availability. */
	public static show(): Response {
		return resp.success('Ghost Deploy is healthy.', {
			service: 'ghost-deploy',
			status: 'healthy'
		});
	}
}
