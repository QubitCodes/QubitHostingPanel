import { resp } from '@qubitcodes/qcresp';
import { InternalDatabaseGatewayController } from '@controllers/InternalDatabaseGatewayController';
import { databaseExternalAccessAcknowledgementSchema } from '@schemas/databaseExternalAccess';
import { parseJson } from '@utils/request';

export function loader({ request }: { request: Request }): Promise<Response> { return InternalDatabaseGatewayController.show(request); }

export async function action({ request }: { request: Request }): Promise<Response> {
	if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = await parseJson(request, databaseExternalAccessAcknowledgementSchema);
	return input instanceof Response ? input : InternalDatabaseGatewayController.acknowledge(request, input);
}
