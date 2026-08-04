import { RuntimeImageController } from '@controllers/RuntimeImageController';
import { createRuntimeImageSchema } from '@schemas/runtimeImage';
import { getRequestMetadata, parseJson } from '@utils/request';
export async function loader({ request }: { request: Request }): Promise<Response> { return RuntimeImageController.index(request, getRequestMetadata(request)); }
export async function action({ request }: { request: Request }): Promise<Response> { const input = await parseJson(request, createRuntimeImageSchema); return input instanceof Response ? input : RuntimeImageController.create(request, input, getRequestMetadata(request)); }
