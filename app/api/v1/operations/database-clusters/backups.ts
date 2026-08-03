import { resp } from '@qubitcodes/qcresp';
import { DatabaseClusterController } from '@controllers/DatabaseClusterController';
import { clusterCodeSchema, createClusterBackupSchema } from '@schemas/databaseCluster';
import { getRequestMetadata, parseJson } from '@utils/request';
export async function action({ request, params }: { request: Request; params: { clusterCode?: string } }): Promise<Response> { const code = clusterCodeSchema.safeParse(params.clusterCode); if (!code.success) return resp.failure('Invalid cluster code.', resp.codes.VALIDATION_ERROR, code.error.issues, null, undefined, 400); const input = await parseJson(request, createClusterBackupSchema); return input instanceof Response ? input : DatabaseClusterController.backup(request, code.data, input, getRequestMetadata(request)); }
