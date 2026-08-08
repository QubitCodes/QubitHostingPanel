import { resp } from '@qubitcodes/qcresp';

import { getEnvironment } from '@config/env';
import { managedTrafficPolicyConfig } from '@services/applications/applicationTrafficPolicyConfigService';

/** Internal host-agent contract for managed Traefik policy reconciliation. */
export class InternalTrafficPolicyController {
	public static async show(request: Request): Promise<Response> {
		const environment = getEnvironment();
		const supplied = request.headers.get('x-internal-job-secret');
		if (!environment.INTERNAL_JOB_SECRET || supplied !== environment.INTERNAL_JOB_SECRET)
			return resp.failure(
				'Resource not found.',
				resp.codes.RESOURCE_NOT_FOUND,
				undefined,
				null,
				undefined,
				404,
			);
		try {
			return resp.success(
				'Managed traffic policy configuration retrieved.',
				await managedTrafficPolicyConfig(),
			);
		} catch {
			return resp.failure(
				'Managed traffic policy configuration is unavailable.',
				resp.codes.INTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				503,
			);
		}
	}
}
