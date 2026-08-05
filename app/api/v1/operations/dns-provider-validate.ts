import { resp } from '@qubitcodes/qcresp';
import { DnsProviderController } from '@controllers/DnsProviderController';
import { dnsProviderCodeSchema } from '@schemas/dnsProvider';
import { getRequestMetadata } from '@utils/request';

export async function action({ params, request }: { params: { provider?: string }; request: Request }): Promise<Response> { const provider = dnsProviderCodeSchema.safeParse(params.provider); return provider.success ? DnsProviderController.validate(request, provider.data, getRequestMetadata(request)) : resp.failure('DNS provider not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
