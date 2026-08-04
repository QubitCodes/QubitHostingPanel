import { PlatformSettingsController } from '@controllers/PlatformSettingsController';
import { verifyPlatformDomainSchema } from '@schemas/platformSettings';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> { const input = await parseJson(request, verifyPlatformDomainSchema); return input instanceof Response ? input : PlatformSettingsController.verify(request, input, getRequestMetadata(request)); }
