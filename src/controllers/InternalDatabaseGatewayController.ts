import { resp } from '@qubitcodes/qcresp';

import { getEnvironment } from '@config/env';
import type { z } from 'zod';
import type { databaseExternalAccessAcknowledgementSchema } from '@schemas/databaseExternalAccess';
import { acknowledgeDatabaseExternalAccess, databaseExternalAccessConfig } from '@services/databases/databaseExternalAccessConfigService';

type Acknowledgement = z.infer<typeof databaseExternalAccessAcknowledgementSchema>;

function authorized(request: Request): boolean {
	const environment = getEnvironment();
	return Boolean(environment.INTERNAL_JOB_SECRET && request.headers.get('x-internal-job-secret') === environment.INTERNAL_JOB_SECRET);
}

/** Internal contract consumed only by the root-owned database gateway synchronizer. */
export class InternalDatabaseGatewayController {
	public static async show(request: Request): Promise<Response> {
		if (!authorized(request)) return resp.failure('Resource not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		try { return resp.success('Database gateway configuration retrieved.', await databaseExternalAccessConfig()); }
		catch { return resp.failure('Database gateway configuration is unavailable.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 503); }
	}

	public static async acknowledge(request: Request, input: Acknowledgement): Promise<Response> {
		if (!authorized(request)) return resp.failure('Resource not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		try { await acknowledgeDatabaseExternalAccess(input.results); return resp.success('Database gateway reconciliation acknowledged.'); }
		catch { return resp.failure('Database gateway acknowledgement failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 503); }
	}
}
