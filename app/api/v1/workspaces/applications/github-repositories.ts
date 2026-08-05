import { GithubConnectionController } from '@controllers/GithubConnectionController';
import { getRequestMetadata } from '@utils/request';

export async function loader({ params, request }: { params: { workspaceId?: string; connectionId?: string }; request: Request }): Promise<Response> { return GithubConnectionController.repositories(request, Number(params.workspaceId), params.connectionId ?? '', getRequestMetadata(request)); }
