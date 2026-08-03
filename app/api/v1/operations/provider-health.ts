import { OperationsController } from '@controllers/OperationsController';
import { getRequestMetadata } from '@utils/request';
export async function loader({ request }: { request: Request }): Promise<Response> { return OperationsController.providerHealth(request, getRequestMetadata(request)); }
