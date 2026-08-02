import { PublicCommerceController } from '@controllers/PublicCommerceController';
import { checkoutQuoteSchema } from '@schemas/checkout';
import { parseJson } from '@utils/request';
export async function action({ request }: { request: Request }) { const input = await parseJson(request, checkoutQuoteSchema); return input instanceof Response ? input : PublicCommerceController.quote(input); }
