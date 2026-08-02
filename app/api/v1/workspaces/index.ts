import { WorkspaceController } from '@controllers/WorkspaceController';
import { getRequestMetadata } from '@utils/request';

export function loader({ request }: { request: Request }): Promise<Response> {
	return WorkspaceController.index(request, getRequestMetadata(request));
}
