import { importPKCS8, jwtVerify, SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";

import { getEnvironment } from "@config/env";

interface InstallationAccount {
  avatar_url?: string;
  login: string;
  name?: string | null;
  type: string;
}
export interface GitHubInstallation {
  account: InstallationAccount;
  html_url?: string;
  id: number;
  repository_selection?: string;
}
export interface GitHubRepositoryOption {
  defaultBranch: string;
  fullName: string;
  id: number;
  isPrivate: boolean;
  name: string;
  owner: string;
  url: string;
}

function configuration(): {
  appId: string;
  appSlug: string;
  privateKey: string;
  stateSecret: string;
} {
  const environment = getEnvironment();
  if (
    !environment.GITHUB_APP_ID ||
    !environment.GITHUB_APP_SLUG ||
    !environment.GITHUB_APP_PRIVATE_KEY ||
    !environment.GITHUB_APP_STATE_SECRET
  )
    throw new Error("GitHub App integration is not configured.");
  return {
    appId: environment.GITHUB_APP_ID,
    appSlug: environment.GITHUB_APP_SLUG,
    privateKey: environment.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    stateSecret: environment.GITHUB_APP_STATE_SECRET,
  };
}

async function appToken(): Promise<string> {
  const config = configuration();
  const normalizedPrivateKey = normalizeGithubPrivateKey(config.privateKey);
  const key = await importPKCS8(normalizedPrivateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(config.appId)
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 540)
    .sign(key);
}

/** Accepts GitHub's downloaded PKCS#1 PEM and emits the PKCS#8 form required by jose. */
export function normalizeGithubPrivateKey(privateKey: string): string {
  return createPrivateKey(privateKey.replace(/\\n/g, "\n"))
    .export({ format: "pem", type: "pkcs8" })
    .toString();
}

async function github<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "QubitHostingPanel",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function createGithubInstallationState(input: {
  actorUserId: string;
  workspaceId: string;
  workspacePublicId: number;
}): Promise<string> {
  const config = configuration();
  return new SignJWT(input)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .setIssuer("qubit-hosting-panel")
    .setAudience("github-installation")
    .sign(new TextEncoder().encode(config.stateSecret));
}
export async function verifyGithubInstallationState(state: string): Promise<{
  actorUserId: string;
  workspaceId: string;
  workspacePublicId: number;
}> {
  const config = configuration();
  const { payload } = await jwtVerify(
    state,
    new TextEncoder().encode(config.stateSecret),
    { issuer: "qubit-hosting-panel", audience: "github-installation" },
  );
  return {
    actorUserId: String(payload.actorUserId),
    workspaceId: String(payload.workspaceId),
    workspacePublicId: Number(payload.workspacePublicId),
  };
}
export function githubInstallationUrl(state: string): string {
  return `https://github.com/apps/${encodeURIComponent(configuration().appSlug)}/installations/new?state=${encodeURIComponent(state)}`;
}
export async function githubInstallation(
  installationId: string,
): Promise<GitHubInstallation> {
  return github<GitHubInstallation>(
    `/app/installations/${encodeURIComponent(installationId)}`,
    await appToken(),
  );
}
export async function githubInstallationToken(
  installationId: string,
): Promise<string> {
  const result = await github<{ token: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    await appToken(),
    { method: "POST", body: "{}" },
  );
  return result.token;
}
export async function githubInstallationRepositories(
  installationId: string,
): Promise<GitHubRepositoryOption[]> {
  const result = await github<{
    repositories: Array<{
      default_branch: string;
      full_name: string;
      html_url: string;
      id: number;
      name: string;
      owner: { login: string };
      private: boolean;
    }>;
  }>(
    "/installation/repositories?per_page=100",
    await githubInstallationToken(installationId),
  );
  return result.repositories.map((repository) => ({
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    owner: repository.owner.login,
    url: repository.html_url,
    defaultBranch: repository.default_branch,
    isPrivate: repository.private,
  }));
}
export async function githubRepositoryBranches(
  installationId: string,
  owner: string,
  repository: string,
): Promise<string[]> {
  const rows = await github<Array<{ name: string }>>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/branches?per_page=100`,
    await githubInstallationToken(installationId),
  );
  return rows.map(({ name }) => name);
}
