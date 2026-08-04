import { WorkspaceLifecycleController } from '@controllers/WorkspaceLifecycleController'; import { getRequestMetadata } from '@utils/request';
export function loader({request}:{request:Request}):Promise<Response>{return WorkspaceLifecycleController.transfers(request,getRequestMetadata(request));}
