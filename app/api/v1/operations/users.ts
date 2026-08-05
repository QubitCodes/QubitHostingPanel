import { AdminCustomerControlController } from '@controllers/AdminCustomerControlController';
import { getRequestMetadata } from '@utils/request';

export function loader({ request }: { request: Request }): Promise<Response> { return AdminCustomerControlController.index(request, getRequestMetadata(request)); }
