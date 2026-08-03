import { ProvisioningController } from '@controllers/ProvisioningController';

export async function loader({ request }: { request: Request }): Promise<Response> { return ProvisioningController.health(request); }
