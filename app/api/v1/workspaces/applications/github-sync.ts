import { GithubConnectionController } from "@controllers/GithubConnectionController";
import { getRequestMetadata } from "@utils/request";

export async function action({
  params,
  request,
}: {
  params: { connectionId?: string; workspaceId?: string };
  request: Request;
}): Promise<Response> {
  return GithubConnectionController.sync(
    request,
    Number(params.workspaceId),
    String(params.connectionId),
    getRequestMetadata(request),
  );
}
