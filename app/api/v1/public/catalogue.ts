import { PublicCommerceController } from '@controllers/PublicCommerceController';
export async function loader() { return PublicCommerceController.catalogue(); }
