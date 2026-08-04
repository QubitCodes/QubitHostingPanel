import { PlatformSettingsController } from '@controllers/PlatformSettingsController';
import { updatePlatformSettingsSchema } from '@schemas/platformSettings';
import { getRequestMetadata, parseJson } from '@utils/request';

export function loader({ request }: { request: Request }): Promise<Response> { return PlatformSettingsController.show(request, getRequestMetadata(request)); }
export async function action({ request }: { request: Request }): Promise<Response> { const input = await parseJson(request, updatePlatformSettingsSchema); return input instanceof Response ? input : PlatformSettingsController.update(request, input, getRequestMetadata(request)); }
