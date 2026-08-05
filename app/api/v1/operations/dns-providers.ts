import { DnsProviderController } from '@controllers/DnsProviderController';
import { getRequestMetadata } from '@utils/request';

export async function loader({ request }: { request: Request }): Promise<Response> { return DnsProviderController.index(request, getRequestMetadata(request)); }
