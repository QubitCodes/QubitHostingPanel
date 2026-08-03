import { PaymentController } from '@controllers/PaymentController';

export async function loader(): Promise<Response> { return PaymentController.providers(); }
