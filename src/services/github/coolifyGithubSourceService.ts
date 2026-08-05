import { getEnvironment } from "@config/env";

interface CoolifyGithubSource {
  app_id: number;
  id: number;
  installation_id: number;
  uuid: string;
}

export function matchingCoolifyGithubSource(
  sources: CoolifyGithubSource[],
  appId: number,
  installationId: number,
): CoolifyGithubSource | undefined {
  return sources.find(
    (source) =>
      Number(source.app_id) === appId &&
      Number(source.installation_id) === installationId,
  );
}

async function coolify<T>(path: string, init?: RequestInit): Promise<T> {
  const environment = getEnvironment();
  if (!environment.COOLIFY_BASE_URL || !environment.COOLIFY_API_TOKEN)
    throw new Error("Coolify credentials are unavailable.");
  const response = await fetch(
    `${environment.COOLIFY_BASE_URL.replace(/\/$/, "")}/api/v1${path}`,
    {
      ...init,
      headers: {
        authorization: `Bearer ${environment.COOLIFY_API_TOKEN}`,
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : {};
  if (!response.ok)
    throw new Error(
      `Coolify ${response.status}: ${String((body as { message?: unknown }).message ?? "request failed")}`,
    );
  return body as T;
}

/** Ensures exactly one Coolify GitHub source exists for a GitHub App installation. */
export async function syncCoolifyGithubSource(input: {
  accountLogin: string;
  accountType: string;
  installationId: string;
  workspacePublicId: number;
}): Promise<string> {
  const environment = getEnvironment();
  if (
    !environment.GITHUB_APP_ID ||
    !environment.GITHUB_APP_CLIENT_ID ||
    !environment.GITHUB_APP_CLIENT_SECRET ||
    !environment.GITHUB_APP_WEBHOOK_SECRET ||
    !environment.COOLIFY_GITHUB_PRIVATE_KEY_UUID
  )
    throw new Error(
      "Dynamic Coolify GitHub source credentials are incomplete.",
    );
  const appId = Number(environment.GITHUB_APP_ID);
  const installationId = Number(input.installationId);
  const sources = await coolify<CoolifyGithubSource[]>("/github-apps");
  const existing = matchingCoolifyGithubSource(sources, appId, installationId);
  if (existing?.uuid) return existing.uuid;
  const created = await coolify<CoolifyGithubSource>("/github-apps", {
    method: "POST",
    body: JSON.stringify({
      name: `Ghost Deploy workspace ${input.workspacePublicId} - ${input.accountLogin}`.slice(
        0,
        255,
      ),
      organization:
        input.accountType.toLowerCase() === "organization"
          ? input.accountLogin
          : undefined,
      api_url: "https://api.github.com",
      html_url: "https://github.com",
      app_id: appId,
      installation_id: installationId,
      client_id: environment.GITHUB_APP_CLIENT_ID,
      client_secret: environment.GITHUB_APP_CLIENT_SECRET,
      webhook_secret: environment.GITHUB_APP_WEBHOOK_SECRET,
      private_key_uuid: environment.COOLIFY_GITHUB_PRIVATE_KEY_UUID,
      is_system_wide: false,
    }),
  });
  if (!created.uuid)
    throw new Error("Coolify did not return a GitHub Source UUID.");
  return created.uuid;
}
