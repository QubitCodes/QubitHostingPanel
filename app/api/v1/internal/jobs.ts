import { ProvisioningController } from '@controllers/ProvisioningController';

export async function action({ request }: { request: Request }): Promise<Response> { return ProvisioningController.process(request); }
