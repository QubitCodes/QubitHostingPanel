import { DatabaseClusterController } from '@controllers/DatabaseClusterController';
import { createDatabaseClusterSchema } from '@schemas/databaseCluster';
import { getRequestMetadata, parseJson } from '@utils/request';
export async function loader({ request }: { request: Request }): Promise<Response> { return DatabaseClusterController.index(request, getRequestMetadata(request)); }
export async function action({ request }: { request: Request }): Promise<Response> { const input = await parseJson(request, createDatabaseClusterSchema); return input instanceof Response ? input : DatabaseClusterController.create(request, input, getRequestMetadata(request)); }
