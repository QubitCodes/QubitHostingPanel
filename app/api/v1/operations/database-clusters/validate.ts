import { resp } from '@qubitcodes/qcresp';
import { DatabaseClusterController } from '@controllers/DatabaseClusterController';
import { clusterCodeSchema } from '@schemas/databaseCluster';
import { getRequestMetadata } from '@utils/request';
export async function action({ request, params }: { request: Request; params: { clusterCode?: string } }): Promise<Response> { const code = clusterCodeSchema.safeParse(params.clusterCode); return code.success ? DatabaseClusterController.validate(request, code.data, getRequestMetadata(request)) : resp.failure('Invalid cluster code.', resp.codes.VALIDATION_ERROR, code.error.issues, null, undefined, 400); }
