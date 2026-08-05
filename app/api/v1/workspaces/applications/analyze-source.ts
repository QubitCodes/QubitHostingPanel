import { ApplicationController } from '@controllers/ApplicationController';
import { analyzeApplicationSourceSchema } from '@schemas/application';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const input = await parseJson(request, analyzeApplicationSourceSchema); return input instanceof Response ? input : ApplicationController.analyzeSource(request, Number(params.workspaceId), input, getRequestMetadata(request)); }
