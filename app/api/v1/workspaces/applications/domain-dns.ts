import { resp } from '@qubitcodes/qcresp';
import { DnsController } from '@controllers/DnsController';
import { dnsZoneActionSchema } from '@schemas/dns';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({
	params,
	request,
}: {
	params: { domainId?: string; workspaceId?: string };
	request: Request;
}): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(
		Number(params.workspaceId),
	);
	return workspaceId.success && params.domainId
		? DnsController.show(
				request,
				workspaceId.data,
				params.domainId,
				getRequestMetadata(request),
			)
		: resp.failure(
				'Domain not found.',
				resp.codes.RESOURCE_NOT_FOUND,
				undefined,
				null,
				undefined,
				404,
			);
}
export async function action({
	params,
	request,
}: {
	params: { domainId?: string; workspaceId?: string };
	request: Request;
}): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(
		Number(params.workspaceId),
	);
	if (!workspaceId.success || !params.domainId)
		return resp.failure(
			'Domain not found.',
			resp.codes.RESOURCE_NOT_FOUND,
			undefined,
			null,
			undefined,
			404,
		);
	const input = await parseJson(request, dnsZoneActionSchema);
	if (input instanceof Response) return input;
	return input.action === 'refresh'
		? DnsController.refresh(
				request,
				workspaceId.data,
				params.domainId,
				getRequestMetadata(request),
			)
		: DnsController.provision(
				request,
				workspaceId.data,
				params.domainId,
				getRequestMetadata(request),
			);
}
