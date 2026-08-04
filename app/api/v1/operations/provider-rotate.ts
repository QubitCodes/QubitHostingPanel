import { ProviderConnectionController } from '@controllers/ProviderConnectionController';
import { rotateProviderTokenSchema } from '@schemas/providerConnection';
import { getRequestMetadata, parseJson } from '@utils/request';
export async function action({ params, request }: { params: { connectionId?: string }; request: Request }): Promise<Response> { const input = await parseJson(request, rotateProviderTokenSchema); return input instanceof Response ? input : ProviderConnectionController.rotate(request, params.connectionId ?? '', input.apiToken, getRequestMetadata(request)); }
