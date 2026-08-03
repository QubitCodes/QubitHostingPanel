import { resp } from '@qubitcodes/qcresp';
import { z } from 'zod';
import { OperationsController } from '@controllers/OperationsController';
import { getRequestMetadata } from '@utils/request';
export async function action({ params, request }: { params: { jobId?: string }; request: Request }): Promise<Response> { const parsed = z.uuid().safeParse(params.jobId); return parsed.success ? OperationsController.retry(request, parsed.data, getRequestMetadata(request)) : resp.failure('Job not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
