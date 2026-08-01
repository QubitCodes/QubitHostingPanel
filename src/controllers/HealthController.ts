import { resp } from '@qubitcodes/qcresp';

export class HealthController {
	/** Returns process health without requiring database or provider availability. */
	public static show(): Response {
		return resp.success('Qubit Hosting Panel is healthy.', {
			service: 'qubit-hosting-panel',
			status: 'healthy'
		});
	}
}
