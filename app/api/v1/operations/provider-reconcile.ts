import { ProviderConnectionController } from '@controllers/ProviderConnectionController';
import { getRequestMetadata } from '@utils/request';
export async function action({ params, request }: { params: { connectionId?: string }; request: Request }): Promise<Response> { return ProviderConnectionController.reconcile(request, params.connectionId ?? '', getRequestMetadata(request)); }
