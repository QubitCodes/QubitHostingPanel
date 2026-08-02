import { resp } from '@qubitcodes/qcresp';
import { OfferController } from '@controllers/OfferController';
import { offerSlugSchema, updateOfferSchema } from '@schemas/offer';
import { getRequestMetadata, parseJson } from '@utils/request';
interface Arguments { params: { offerSlug?: string }; request: Request }
export async function loader({ params, request }: Arguments) { const slug = offerSlugSchema.safeParse(params.offerSlug); return slug.success ? OfferController.show(request, slug.data, getRequestMetadata(request)) : resp.failure('Invalid offer slug.', resp.codes.VALIDATION_ERROR, slug.error.issues, null, undefined, 400); }
export async function action({ params, request }: Arguments) { const slug = offerSlugSchema.safeParse(params.offerSlug); if (!slug.success) return resp.failure('Invalid offer slug.', resp.codes.VALIDATION_ERROR, slug.error.issues, null, undefined, 400); if (request.method === 'DELETE') return OfferController.remove(request, slug.data, getRequestMetadata(request)); if (request.method !== 'PATCH') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405); const input = await parseJson(request, updateOfferSchema); return input instanceof Response ? input : OfferController.update(request, slug.data, input, getRequestMetadata(request)); }
