import { ProviderConnectionController } from '@controllers/ProviderConnectionController';
import { createProviderConnectionSchema } from '@schemas/providerConnection';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({ request }: { request: Request }): Promise<Response> { return ProviderConnectionController.index(request, getRequestMetadata(request)); }
export async function action({ request }: { request: Request }): Promise<Response> { const input = await parseJson(request, createProviderConnectionSchema); return input instanceof Response ? input : ProviderConnectionController.create(request, input, getRequestMetadata(request)); }
