import { GithubConnectionController } from '@controllers/GithubConnectionController';

export async function loader({ request }: { request: Request }): Promise<Response> { return GithubConnectionController.callback(new URL(request.url)); }
