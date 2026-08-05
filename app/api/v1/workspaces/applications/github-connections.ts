import { GithubConnectionController } from '@controllers/GithubConnectionController';
import { getRequestMetadata } from '@utils/request';

export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { return GithubConnectionController.index(request, Number(params.workspaceId), getRequestMetadata(request)); }
export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { return GithubConnectionController.connect(request, Number(params.workspaceId), getRequestMetadata(request)); }
