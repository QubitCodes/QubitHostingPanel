import { resp } from '@qubitcodes/qcresp';
import { DnsProviderController } from '@controllers/DnsProviderController';
import { dnsProviderCodeSchema, saveDnsProviderSchema } from '@schemas/dnsProvider';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { provider?: string }; request: Request }): Promise<Response> { const provider = dnsProviderCodeSchema.safeParse(params.provider); if (!provider.success) return resp.failure('DNS provider not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); if (request.method === 'DELETE') return DnsProviderController.remove(request, provider.data, getRequestMetadata(request)); const input = await parseJson(request, saveDnsProviderSchema); return input instanceof Response ? input : DnsProviderController.save(request, provider.data, input, getRequestMetadata(request)); }
