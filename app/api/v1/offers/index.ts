import { OfferController } from '@controllers/OfferController';
import { createOfferSchema } from '@schemas/offer';
import { getRequestMetadata, parseJson } from '@utils/request';
export async function loader({ request }: { request: Request }) { return OfferController.index(request, getRequestMetadata(request)); }
export async function action({ request }: { request: Request }) { if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405); const input = await parseJson(request, createOfferSchema); return input instanceof Response ? input : OfferController.create(request, input, getRequestMetadata(request)); }
import { resp } from '@qubitcodes/qcresp';
