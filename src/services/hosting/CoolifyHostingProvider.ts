import { getEnvironment } from "@config/env";
import type {
  HostingProvider,
  ProviderConnectionResult,
  ProviderJob,
  ProviderJobStatus,
  ProviderResource,
  ProviderUsage,
  ProvisionApplicationInput,
} from "@services/hosting/HostingProvider";

interface CoolifyApplication {
  fqdn?: string | null;
  name?: string;
  status?: string;
  uuid?: string;
}
interface CoolifyDatabase {
  name?: string;
  status?: string;
  uuid?: string;
}
export interface CreateCoolifyDatabaseInput {
  engine: "postgresql" | "mysql";
  name: string;
  password: string;
  username: string;
  databaseName: string;
  image: string;
  limitsMemory: string;
  limitsCpus: string;
}
export interface CoolifyConnectionConfig {
  apiToken: string;
  baseUrl: string;
  defaultEnvironmentName?: string;
  defaultProjectUuid?: string | null;
  destinationUuid?: string | null;
  serverUuid?: string | null;
  wildcardDomain?: string | null;
}
export type CoolifyImportKind =
  "server" | "application" | "database" | "service" | "deployment";

/** Converts a configured wildcard URL or hostname into a bare DNS suffix. */
export function normalizeCoolifyWildcardDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\*\./, "")
    .replace(/\/+$/, "");
}

/** Finds an exact-name provider application created before a panel retry could persist it. */
export function reusableCoolifyApplication(
  applications: CoolifyApplication[],
  name: string,
): CoolifyApplication | undefined {
  return applications.find(
    (application) => application.name === name && application.uuid,
  );
}

/** Identifies Coolify's duplicate-key response so an existing generated variable can be updated. */
export function isCoolifyEnvironmentConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^Coolify 409:.*environment variable already exists/i.test(error.message)
  );
}

/** Determines whether a recovered partial application needs a fresh provider deployment. */
export function shouldRedeployCoolifyApplication(status?: string): boolean {
  return /failed|exited|stopped|cancelled/i.test(status ?? "");
}

/** Least-privilege Coolify v4 REST adapter for starter workload provisioning. */
export class CoolifyHostingProvider implements HostingProvider {
  private readonly environment = getEnvironment();
  private readonly config: CoolifyConnectionConfig;

  public constructor(config?: CoolifyConnectionConfig) {
    this.config = config ?? {
      apiToken: this.environment.COOLIFY_API_TOKEN ?? "",
      baseUrl: this.environment.COOLIFY_BASE_URL ?? "",
      defaultEnvironmentName: this.environment.COOLIFY_DEFAULT_ENVIRONMENT_NAME,
      defaultProjectUuid: this.environment.COOLIFY_DEFAULT_PROJECT_UUID,
      destinationUuid: this.environment.COOLIFY_DESTINATION_UUID,
      serverUuid: this.environment.COOLIFY_SERVER_UUID,
      wildcardDomain: this.environment.COOLIFY_WILDCARD_DOMAIN,
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.config.baseUrl || !this.config.apiToken)
      throw new Error("Coolify credentials are unavailable.");
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, "")}/api/v1${path}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.apiToken}`,
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...init?.headers,
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    const text = await response.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { message: text };
    }
    if (!response.ok)
      throw new Error(
        `Coolify ${response.status}: ${String((body as { message?: unknown }).message ?? "request failed")}`,
      );
    return body as T;
  }

  public async validateConnection(): Promise<ProviderConnectionResult> {
    await this.request<unknown[]>("/applications");
    return { connected: true, provider: "coolify" };
  }

  public async listResources(): Promise<readonly ProviderResource[]> {
    const applications =
      await this.request<CoolifyApplication[]>("/applications");
    return applications
      .filter((item) => item.uuid)
      .map((item) => ({
        id: item.uuid!,
        kind: "application" as const,
        name: item.name ?? item.uuid!,
      }));
  }

  /** Reads one supported Coolify inventory endpoint for connection-scoped reconciliation. */
  public async listImportResources(
    kind: CoolifyImportKind,
  ): Promise<readonly Record<string, unknown>[]> {
    const paths: Record<CoolifyImportKind, string> = {
      application: "/applications",
      database: "/databases",
      deployment: "/deployments",
      server: "/servers",
      service: "/services",
    };
    const result = await this.request<unknown>(paths[kind]);
    if (Array.isArray(result))
      return result.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      );
    const data = (result as { data?: unknown } | null)?.data;
    return Array.isArray(data)
      ? data.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object",
        )
      : [];
  }

  public async getUsage(): Promise<readonly ProviderUsage[]> {
    return [];
  }

  /** Creates a literal application variable or updates the provider-generated key when it already exists. */
  private async upsertApplicationEnvironment(
    applicationUuid: string,
    key: string,
    value: string,
    scope: "runtime" | "build" | "both" = "runtime",
  ): Promise<void> {
    const path = `/applications/${encodeURIComponent(applicationUuid)}/envs`;
    const body = JSON.stringify({
      key,
      value,
      is_preview: false,
      is_literal: true,
      is_multiline: value.includes("\n"),
      is_build_time: scope === "build" || scope === "both",
      is_runtime: scope === "runtime" || scope === "both",
    });
    try {
      await this.request(path, { method: "POST", body });
    } catch (error) {
      if (!isCoolifyEnvironmentConflict(error)) throw error;
      await this.request(path, { method: "PATCH", body });
    }
  }

  public async createSharedDatabase(
    input: CreateCoolifyDatabaseInput,
  ): Promise<{ uuid: string }> {
    if (!this.config.defaultProjectUuid || !this.config.serverUuid)
      throw new Error("Coolify placement is incomplete.");
    const common = {
      server_uuid: this.config.serverUuid,
      project_uuid: this.config.defaultProjectUuid,
      environment_name: this.config.defaultEnvironmentName ?? "production",
      destination_uuid: this.config.destinationUuid,
      name: input.name,
      description: "Ghost Deploy shared database cluster",
      image: input.image,
      is_public: false,
      limits_memory: input.limitsMemory,
      limits_cpus: input.limitsCpus,
      instant_deploy: true,
    };
    const credentials =
      input.engine === "postgresql"
        ? {
            postgres_user: input.username,
            postgres_password: input.password,
            postgres_db: input.databaseName,
          }
        : {
            mysql_root_password: input.password,
            mysql_user: "qubit_admin",
            mysql_password: input.password,
            mysql_database: input.databaseName,
          };
    return this.request<{ uuid: string }>(`/databases/${input.engine}`, {
      method: "POST",
      body: JSON.stringify({ ...common, ...credentials }),
    });
  }

  public async getSharedDatabase(uuid: string): Promise<CoolifyDatabase> {
    return this.request<CoolifyDatabase>(
      `/databases/${encodeURIComponent(uuid)}`,
    );
  }

  public async createDatabaseBackup(
    uuid: string,
    input: { frequency: string; s3StorageUuid?: string },
  ): Promise<{ uuid: string }> {
    return this.request<{ uuid: string }>(
      `/databases/${encodeURIComponent(uuid)}/backups`,
      {
        method: "POST",
        body: JSON.stringify({
          frequency: input.frequency,
          enabled: true,
          save_s3: Boolean(input.s3StorageUuid),
          s3_storage_uuid: input.s3StorageUuid,
          dump_all: true,
          backup_now: true,
          database_backup_retention_amount_locally: 7,
          database_backup_retention_days_locally: 7,
          database_backup_retention_amount_s3: 30,
          database_backup_retention_days_s3: 30,
        }),
      },
    );
  }

  public async provisionApplication(
    input: ProvisionApplicationInput,
  ): Promise<ProviderJob> {
    if (!this.config.defaultProjectUuid || !this.config.serverUuid)
      throw new Error("Coolify placement is incomplete.");
    const wildcardDomain = this.config.wildcardDomain
      ? normalizeCoolifyWildcardDomain(this.config.wildcardDomain)
      : undefined;
    const runtimePort = String(
      input.runtimeImage?.port ?? this.environment.COOLIFY_STARTER_PORT,
    );
    const domains = input.domains?.length
      ? input.domains.map((domain) => `https://${domain}`).join(",")
      : wildcardDomain
        ? `https://${input.name}.${wildcardDomain}`
        : undefined;
    const applications =
      await this.request<CoolifyApplication[]>("/applications");
    const existing = reusableCoolifyApplication(applications, input.name);
    const common = {
      project_uuid: this.config.defaultProjectUuid,
      server_uuid: this.config.serverUuid,
      environment_name:
        input.deploymentEnvironment ??
        this.config.defaultEnvironmentName ??
        "production",
      destination_uuid: this.config.destinationUuid,
      ports_exposes: runtimePort,
      name: input.name,
      description: `Ghost Deploy workspace ${input.workspaceId}`,
      autogenerate_domain: !domains,
      domains,
      health_check_enabled: true,
      health_check_path: "/",
      health_check_port: runtimePort,
      instant_deploy: !input.persistentStorages?.length,
      force_domain_override: false,
    };
    const sourcePayload = input.source
      ? {
          ...common,
          git_repository: input.source.repository,
          git_branch: input.source.branch,
          build_pack: input.buildPack ?? "nixpacks",
          install_command: input.installCommand,
          build_command: input.buildCommand,
          start_command: input.startCommand,
          base_directory: input.baseDirectory,
          publish_directory: input.publishDirectory,
          is_static: input.buildPack === "static",
        }
      : undefined;
    const body = existing?.uuid
      ? { uuid: existing.uuid }
      : input.source
        ? input.source.githubAppUuid
          ? await this.request<{ uuid: string }>(
              "/applications/private-github-app",
              {
                method: "POST",
                body: JSON.stringify({
                  ...sourcePayload,
                  github_app_uuid: input.source.githubAppUuid,
                }),
              },
            )
          : await this.request<{ uuid: string }>("/applications/public", {
              method: "POST",
              body: JSON.stringify(sourcePayload),
            })
        : await this.request<{ uuid: string }>("/applications/dockerimage", {
            method: "POST",
            body: JSON.stringify({
              ...common,
              docker_registry_image_name:
                input.runtimeImage?.repository ??
                this.environment.COOLIFY_STARTER_IMAGE,
              docker_registry_image_tag:
                input.runtimeImage?.tag ??
                this.environment.COOLIFY_STARTER_IMAGE_TAG,
            }),
          });
    if (existing?.uuid && input.source)
      await this.request(`/applications/${encodeURIComponent(existing.uuid)}`, {
        method: "PATCH",
        body: JSON.stringify({
          build_pack: input.buildPack ?? "nixpacks",
          install_command: input.installCommand ?? "",
          build_command: input.buildCommand ?? "",
          start_command: input.startCommand ?? "",
          base_directory: input.baseDirectory,
          publish_directory: input.publishDirectory ?? "",
          ports_exposes: runtimePort,
          domains,
          health_check_port: runtimePort,
        }),
      });
    for (const variable of input.databaseEnvironment ?? [])
      await this.upsertApplicationEnvironment(
        body.uuid,
        variable.key,
        variable.value,
      );
    for (const variable of input.environmentVariables ?? [])
      await this.upsertApplicationEnvironment(
        body.uuid,
        variable.key,
        variable.value,
        variable.scope,
      );
    if (input.persistentStorages?.length) {
      const currentStorages = await this.request<{
        persistent_storages?: Array<{ mount_path?: string; name?: string }>;
      }>(`/applications/${encodeURIComponent(body.uuid)}/storages`);
      for (const storage of input.persistentStorages)
        if (
          !currentStorages.persistent_storages?.some(
            (current) =>
              current.name === storage.name ||
              current.mount_path === storage.mountPath,
          )
        )
        await this.request(
          `/applications/${encodeURIComponent(body.uuid)}/storages`,
          {
            method: "POST",
            body: JSON.stringify({
              type: "persistent",
              name: storage.name,
              mount_path: storage.mountPath,
            }),
          },
        );
    }
    if (
      (existing?.uuid &&
        (input.source || shouldRedeployCoolifyApplication(existing.status))) ||
      (!existing?.uuid && Boolean(input.persistentStorages?.length))
    )
      await this.request("/deploy", {
        method: "POST",
        body: JSON.stringify({ force: true, uuid: body.uuid }),
      });
    return {
      id: body.uuid,
      publicUrl: existing?.fqdn?.split(",")[0] ?? domains?.split(",")[0],
      status: "pending",
    };
  }

  public async getDeployment(jobId: string): Promise<ProviderJobStatus> {
    const application = await this.request<CoolifyApplication>(
      `/applications/${encodeURIComponent(jobId)}`,
    );
    const status = application.status?.toLowerCase() ?? "";
    if (status.includes("running")) return "succeeded";
    if (status.includes("failed") || status.includes("exited")) return "failed";
    return status.includes("building") || status.includes("starting")
      ? "running"
      : "pending";
  }

  public async getApplicationLogs(
    applicationId: string,
    lines = 100,
  ): Promise<string> {
    const result = await this.request<{ logs?: string }>(
      `/applications/${encodeURIComponent(applicationId)}/logs?lines=${Math.max(1, Math.min(1000, Math.trunc(lines)))}`,
    );
    return result.logs ?? "";
  }

  public async updateApplicationDomains(
    applicationId: string,
    domains: string[],
  ): Promise<void> {
    await this.request(`/applications/${encodeURIComponent(applicationId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        domains: domains.map((domain) => `https://${domain}`).join(","),
        force_domain_override: true,
      }),
    });
  }
}
