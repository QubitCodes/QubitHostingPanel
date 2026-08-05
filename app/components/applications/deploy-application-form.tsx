import {
  Braces,
  Check,
  ChevronDown,
  Code2,
  Database,
  FileCode2,
  Github,
  Globe2,
  Info,
  LoaderCircle,
  Plus,
  ServerCog,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { authenticatedFetch } from "@root/app/utils/authenticatedFetch";
import {
  frameworkDefinition,
  frameworksForLanguage,
  type RuntimeLanguage,
} from "@config/frameworkCatalog";

interface RuntimeOption {
  code: string;
  defaultPort: number;
  isDefault: boolean;
  language: RuntimeLanguage;
  version: string;
}
interface DatabaseOption {
  databaseName: string;
  id: string;
}
interface Options {
  applicationBaseDomain?: string;
  databases: DatabaseOption[];
  limits?: {
    customDomains: { allowed: boolean; current: number; limit: number | null };
  };
  runtimes: RuntimeOption[];
  suggestedDomainSuffix?: string;
}
interface SourceAnalysis {
  branches: string[];
  candidates: Array<{
    framework?: string;
    projectDirectory: string;
    stack: RuntimeOption["language"];
  }>;
  environmentKeys: Array<{ isSecret: boolean; key: string; required: boolean }>;
  evidence: string[];
  outputDirectory?: string;
}
interface EnvironmentVariable {
  isSecret: boolean;
  key: string;
  scope: "runtime" | "build" | "both";
  value: string;
}
interface GithubConnection {
  accountLogin: string;
  accountName: string;
  avatarUrl?: string;
  id: string;
  reviewUrl: string;
  providerSyncError?: string;
  providerSyncStatus: "pending" | "ready" | "failed";
}
interface GithubRepository {
  defaultBranch: string;
  fullName: string;
  isPrivate: boolean;
  url: string;
}
interface ApiBody<T> {
  data?: T;
  message: string;
  status: boolean;
}

const inputClass =
  "rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-brand-action dark:bg-gray-800 dark:text-gray-100";
const hintClass =
  "flex items-start gap-1.5 text-xs font-normal leading-5 text-app-muted";
const STACKS: Array<{
  code: RuntimeOption["language"];
  label: string;
  mark: string;
  color: string;
}> = [
  {
    code: "node",
    label: "Node.js",
    mark: "JS",
    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  {
    code: "php",
    label: "PHP",
    mark: "php",
    color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  },
  {
    code: "python",
    label: "Python",
    mark: "Py",
    color: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  },
  {
    code: "static",
    label: "Static site",
    mark: "</>",
    color: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    code: "ruby",
    label: "Ruby",
    mark: "Rb",
    color: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
];
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, init);
  const body = (await response.json()) as ApiBody<T>;
  if (!response.ok || !body.status || body.data === undefined)
    throw new Error(body.message);
  return body.data;
}
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function Hint({ children }: { children: string }) {
  return (
    <span className={hintClass}>
      <Info className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </span>
  );
}
function Section({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof Code2;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="rounded-xl bg-brand-action/15 p-2 text-brand-primary dark:text-brand-action">
          <Icon className="size-5" />
        </span>
        <div>
          <h3 className="font-black">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
        </div>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export function DeployApplicationForm({
  onCreated,
  options,
  workspaceId,
}: {
  onCreated: (id: string) => void;
  options: Options;
  workspaceId: number;
}) {
  const [name, setName] = useState("");
  const [domainLabel, setDomainLabel] = useState("");
  const [labelEdited, setLabelEdited] = useState(false);
  const [repository, setRepository] = useState("");
  const [sourceMode, setSourceMode] = useState<"public" | "github">("public");
  const [githubConnections, setGithubConnections] = useState<
    GithubConnection[]
  >([]);
  const [githubConnectionId, setGithubConnectionId] = useState("");
  const [githubRepositories, setGithubRepositories] = useState<
    GithubRepository[]
  >([]);
  const [branch, setBranch] = useState("main");
  const [analysis, setAnalysis] = useState<SourceAnalysis>();
  const [analyzing, setAnalyzing] = useState(false);
  const [stack, setStack] = useState<RuntimeOption["language"]>("node");
  const [runtimeCode, setRuntimeCode] = useState("");
  const [framework, setFramework] = useState<string>("");
  const [projectDirectory, setProjectDirectory] = useState("/");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
  const [databaseMode, setDatabaseMode] = useState<"new" | "existing" | "none">(
    "new",
  );
  const [databaseEngine, setDatabaseEngine] = useState<"postgresql" | "mysql">(
    "postgresql",
  );
  const [existingDatabaseId, setExistingDatabaseId] = useState("");
  const [customDomains, setCustomDomains] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const stackRuntimes = useMemo(
    () => options.runtimes.filter((runtime) => runtime.language === stack),
    [options.runtimes, stack],
  );
  const selectedRuntime =
    options.runtimes.find((runtime) => runtime.code === runtimeCode) ??
    stackRuntimes.find((runtime) => runtime.isDefault) ??
    stackRuntimes[0];
  const selectedFramework = frameworkDefinition(framework);

  useEffect(() => {
    void request<GithubConnection[]>(
      `/api/v1/workspaces/${workspaceId}/applications/github-connections`,
    )
      .then((connections) => {
        setGithubConnections(connections);
        if (connections[0]) setGithubConnectionId(connections[0].id);
      })
      .catch(() => undefined);
  }, [workspaceId]);

  useEffect(() => {
    if (!githubConnectionId) return;
    void request<GithubRepository[]>(
      `/api/v1/workspaces/${workspaceId}/applications/github-connections/${githubConnectionId}/repositories`,
    )
      .then(setGithubRepositories)
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load GitHub repositories.",
        ),
      );
  }, [githubConnectionId, workspaceId]);

  async function connectGithub(): Promise<void> {
    try {
      const result = await request<{ url: string }>(
        `/api/v1/workspaces/${workspaceId}/applications/github-connections`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      window.location.assign(result.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to connect GitHub.",
      );
    }
  }

  async function syncGithubProvider(): Promise<void> {
    if (!githubConnectionId) return;
    try {
      await request<{ providerSyncStatus: "ready" }>(
        `/api/v1/workspaces/${workspaceId}/applications/github-connections/${githubConnectionId}/sync`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      setGithubConnections((connections) =>
        connections.map((connection) =>
          connection.id === githubConnectionId
            ? {
                ...connection,
                providerSyncStatus: "ready",
                providerSyncError: undefined,
              }
            : connection,
        ),
      );
      toast.success("GitHub deployment provider is ready.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Provider synchronization failed.",
      );
    }
  }

  function changeName(value: string): void {
    setName(value);
    if (!labelEdited) setDomainLabel(slug(value));
  }
  function selectStack(value: RuntimeOption["language"]): void {
    setStack(value);
    const available = options.runtimes.filter(
      (runtime) => runtime.language === value,
    );
    setRuntimeCode(
      (available.find((runtime) => runtime.isDefault) ?? available[0])?.code ??
        "",
    );
    setFramework("");
  }
  function selectFramework(code: string): void {
    setFramework(code);
    const definition = frameworkDefinition(code);
    if (!definition) return;
    if (definition.outputDirectory) setOutputDirectory(definition.outputDirectory);
    if (definition.databaseEngines.length === 0) setDatabaseMode("none");
    else if (databaseMode === "none") setDatabaseMode("new");
    if (
      definition.databaseEngines.length === 1 &&
      definition.databaseEngines[0]
    )
      setDatabaseEngine(definition.databaseEngines[0]);
  }
  async function inspectSource(): Promise<void> {
    setAnalyzing(true);
    try {
      const result = await request<SourceAnalysis>(
        `/api/v1/workspaces/${workspaceId}/applications/analyze-source`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repository,
            branch,
            githubConnectionId:
              sourceMode === "github" ? githubConnectionId : undefined,
          }),
        },
      );
      setAnalysis(result);
      const candidate = result.candidates[0];
      if (candidate) {
        selectStack(candidate.stack);
        setProjectDirectory(candidate.projectDirectory);
        if (candidate.framework) selectFramework(candidate.framework);
      }
      setOutputDirectory(result.outputDirectory ?? "");
      setVariables(
        result.environmentKeys.map((item) => ({
          key: item.key,
          value: "",
          isSecret: item.isSecret,
          scope: "runtime",
        })),
      );
      if (result.branches.includes(branch) === false && result.branches[0])
        setBranch(result.branches[0]);
      toast.success(
        "Repository configuration detected. Review every suggestion before deploying.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Repository analysis failed.",
      );
    } finally {
      setAnalyzing(false);
    }
  }
  function updateVariable(
    index: number,
    patch: Partial<EnvironmentVariable>,
  ): void {
    setVariables((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedRuntime) {
      toast.error("Choose a stack version.");
      return;
    }
    setSubmitting(true);
    try {
      let databaseId = existingDatabaseId;
      if (databaseMode === "new") {
        const data = new FormData(event.currentTarget);
        const created = await request<{ database: { id: string } }>(
          `/api/v1/workspaces/${workspaceId}/databases`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              engine: databaseEngine,
              name: String(data.get("newDatabaseName") || `${name} database`),
              connectionLimit: 10,
              storageQuotaMb: 1024,
            }),
          },
        );
        databaseId = created.database.id;
      }
      const data = new FormData(event.currentTarget);
      const result = await request<{ id: string }>(
        `/api/v1/workspaces/${workspaceId}/applications`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            subdomain: domainLabel,
            subdomainSuffix: options.suggestedDomainSuffix,
            repository,
            githubConnectionId:
              sourceMode === "github" ? githubConnectionId : undefined,
            branch,
            runtimeCode: selectedRuntime.code,
            framework: framework || null,
            deploymentEnvironment: data.get("deploymentEnvironment"),
            buildPack: stack === "static" ? "static" : "nixpacks",
            port: Number(data.get("port") || selectedRuntime.defaultPort),
            baseDirectory: projectDirectory,
            publishDirectory:
              stack === "static" ? outputDirectory || undefined : undefined,
            installCommand: data.get("installCommand") || undefined,
            buildCommand: data.get("buildCommand") || undefined,
            startCommand: data.get("startCommand") || undefined,
            domains: options.limits?.customDomains.allowed
              ? customDomains
                  .map((item) => item.trim().toLowerCase())
                  .filter(Boolean)
              : [],
            databases:
              databaseMode !== "none" && databaseId
                ? [{ databaseId, environmentPrefix: "DATABASE" }]
                : [],
            environmentVariables: variables
              .filter((item) => item.key)
              .map((item) => ({ ...item, key: item.key.trim().toUpperCase() })),
          }),
        },
      );
      toast.success("Application deployment queued.");
      onCreated(result.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Application deployment failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="mx-auto grid max-w-[96rem] gap-5 pb-24 lg:grid-cols-2"
      onSubmit={(event) => void submit(event)}
    >
      <div className="grid content-start gap-5">
        <Section
          description="Name the project and choose where this first deployment belongs."
          icon={FileCode2}
          title="Project"
        >
          <label className="grid gap-2 font-semibold">
            Application name
            <input
              className={inputClass}
              maxLength={80}
              onChange={(event) => changeName(event.target.value)}
              placeholder="Customer API"
              required
              value={name}
            />
            <Hint>
              This name identifies the project in your workspace and is used to
              suggest its default domain and database name.
            </Hint>
          </label>
          <label className="grid gap-2 font-semibold">
            Deployment environment
            <select
              className={inputClass}
              defaultValue="production"
              name="deploymentEnvironment"
            >
              <option value="development">Development</option>
              <option value="testing">Testing</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
            <Hint>
              This labels the current deployment configuration. Multiple
              independently configured environments per project will be
              supported later.
            </Hint>
          </label>
        </Section>
        <Section
          description="Choose a repository and branch, then let Ghost Deploy inspect safe manifest and template files."
          icon={Github}
          title="Source repository"
        >
          <fieldset>
            <legend className="font-semibold">Repository access</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["public", "github"] as const).map((mode) => (
                <button
                  className={`rounded-xl border px-4 py-3 text-left font-bold ${sourceMode === mode ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                  key={mode}
                  onClick={() => setSourceMode(mode)}
                  type="button"
                >
                  {mode === "public"
                    ? "Public repository"
                    : "GitHub connection"}
                </button>
              ))}
            </div>
            <Hint>
              Connect GitHub for private repositories or public repositories
              with restricted organisation access.
            </Hint>
          </fieldset>
          {sourceMode === "github" && (
            <div className="grid gap-3 rounded-xl border border-brand-primary/10 bg-app-canvas p-4">
              {githubConnections.length ? (
                <>
                  <label className="grid gap-2 font-semibold">
                    GitHub account
                    <select
                      className={inputClass}
                      onChange={(event) =>
                        setGithubConnectionId(event.target.value)
                      }
                      value={githubConnectionId}
                    >
                      {githubConnections.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.accountName} (@{connection.accountLogin})
                        </option>
                      ))}
                    </select>
                    <Hint>
                      This workspace can deploy only repositories granted to the
                      selected GitHub App installation.
                    </Hint>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <a
                      className="rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold"
                      href={
                        githubConnections.find(
                          (item) => item.id === githubConnectionId,
                        )?.reviewUrl
                      }
                      rel="noreferrer"
                      target="_blank"
                    >
                      Review repository access
                    </a>
                    <button
                      className="rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold"
                      onClick={() => void connectGithub()}
                      type="button"
                    >
                      Connect another account
                    </button>
                  </div>
                  {githubConnections.find(
                    (item) => item.id === githubConnectionId,
                  )?.providerSyncStatus !== "ready" && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                      <p className="font-bold">
                        GitHub connected; deployment provider setup pending.
                      </p>
                      <p className="mt-1 text-xs text-app-muted">
                        Retry synchronization before deploying a private
                        repository.
                      </p>
                      <button
                        className="mt-3 rounded-lg border border-amber-500/40 px-3 py-2 font-bold"
                        onClick={() => void syncGithubProvider()}
                        type="button"
                      >
                        Retry provider setup
                      </button>
                    </div>
                  )}
                  <label className="grid gap-2 font-semibold">
                    Permitted repository
                    <select
                      className={inputClass}
                      onChange={(event) => {
                        const selected = githubRepositories.find(
                          (item) => item.url === event.target.value,
                        );
                        setRepository(event.target.value);
                        setBranch(selected?.defaultBranch ?? "main");
                        setAnalysis(undefined);
                      }}
                      required
                      value={repository}
                    >
                      <option value="">Select a repository</option>
                      {githubRepositories.map((item) => (
                        <option key={item.fullName} value={item.url}>
                          {item.fullName}
                            {item.isPrivate ? " (private)" : ""}
                        </option>
                      ))}
                    </select>
                    <Hint>
                      Only repositories explicitly approved in GitHub are listed
                      here.
                    </Hint>
                  </label>
                </>
              ) : (
                <>
                  <p className="text-sm text-app-muted">
                    GitHub is not connected to this workspace yet.
                  </p>
                  <button
                    className="rounded-xl bg-brand-action px-4 py-3 font-black text-slate-950"
                    onClick={() => void connectGithub()}
                    type="button"
                  >
                    Connect GitHub
                  </button>
                </>
              )}
            </div>
          )}
          <label className="grid gap-2 font-semibold">
            Repository URL
            <div className="flex gap-2">
              <input
                className={`${inputClass} min-w-0 flex-1`}
                onChange={(event) => {
                  setRepository(event.target.value);
                  setAnalysis(undefined);
                }}
                placeholder="https://github.com/organisation/repository"
                readOnly={sourceMode === "github"}
                required
                type="url"
                value={repository}
              />
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 font-bold"
                disabled={!repository || analyzing}
                onClick={() => void inspectSource()}
                type="button"
              >
                {analyzing ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}{" "}
                Detect
              </button>
            </div>
            <Hint>
              Use the repository root URL. Detection reads manifests and
              environment templates but never reads real .env files.
            </Hint>
          </label>
          <label className="grid gap-2 font-semibold">
            Branch
            {analysis?.branches.length ? (
              <select
                className={inputClass}
                onChange={(event) => setBranch(event.target.value)}
                value={branch}
              >
                {analysis.branches.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                onChange={(event) => setBranch(event.target.value)}
                required
                value={branch}
              />
            )}
            <Hint>
              The selected branch is built and redeployed. Available branches
              appear after repository detection.
            </Hint>
          </label>
          {analysis && (
            <div className="rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              <Check className="mr-1 inline size-4" />
              {analysis.evidence.join(" · ") ||
                "Repository inspected; no specific framework was detected."}
            </div>
          )}
        </Section>
        <Section
          description="Detected values are suggestions. You remain in control of the deployment configuration."
          icon={Code2}
          title="Stack and framework"
        >
          <fieldset>
            <legend className="font-semibold">Stack</legend>
            <Hint>
              Select the language environment used to build and run this
              application.
            </Hint>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STACKS.map((item) => (
                <button
                  className={`rounded-2xl border p-4 text-left ${stack === item.code ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                  key={item.code}
                  onClick={() => selectStack(item.code)}
                  type="button"
                >
                  <span
                    className={`grid h-10 w-12 place-items-center rounded-xl text-sm font-black ${item.color}`}
                  >
                    {item.mark}
                  </span>
                  <span className="mt-3 block font-bold">{item.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="font-semibold">Version</legend>
            <Hint>
              Only active platform-approved versions are shown; internal image
              revisions remain managed by Ghost Deploy.
            </Hint>
            <div className="mt-3 flex flex-wrap gap-2">
              {stackRuntimes.map((runtime) => (
                <button
                  className={`rounded-xl border px-4 py-2 font-bold ${selectedRuntime?.code === runtime.code ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                  key={runtime.code}
                  onClick={() => setRuntimeCode(runtime.code)}
                  type="button"
                >
                  {runtime.version}
                  {runtime.isDefault ? " · Recommended" : ""}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="font-semibold">
              Framework{" "}
              <span className="font-normal text-app-muted">Optional</span>
            </legend>
            <Hint>
              Framework detection tunes directory and build suggestions. Select
              None whenever the suggestion does not match your application.
            </Hint>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={`rounded-xl border px-3 py-2 text-sm font-bold ${!framework ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                onClick={() => setFramework("")}
                type="button"
              >
                None
              </button>
              {frameworksForLanguage(stack).map((item) => (
                <button
                  className={`rounded-xl border px-3 py-2 text-sm font-bold ${framework === item.code ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                  key={item.code}
                  onClick={() => selectFramework(item.code)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            {selectedFramework && (
              <p className="mt-3 text-xs text-app-muted">
                {selectedFramework.description}
                {selectedFramework.persistentDirectories?.length
                  ? ` Persistent data: ${selectedFramework.persistentDirectories.join(", ")}.`
                  : ""}
              </p>
            )}
          </fieldset>
          <label className="grid gap-2 font-semibold">
            Project directory
            <input
              className={inputClass}
              onChange={(event) => setProjectDirectory(event.target.value)}
              placeholder="/ or apps/api"
              required
              value={projectDirectory}
            />
            <Hint>
              The repository folder containing this application. It is detected
              from package.json, composer.json, or Python configuration when
              possible.
            </Hint>
          </label>
          {stack === "static" && (
            <label className="grid gap-2 font-semibold">
              Output directory
              <input
                className={inputClass}
                onChange={(event) => setOutputDirectory(event.target.value)}
                placeholder="dist"
                value={outputDirectory}
              />
              <Hint>
                The folder containing built static files, such as dist for Vite
                or build for Create React App.
              </Hint>
            </label>
          )}
          <label className="grid gap-2 font-semibold">
            Application port
            <input
              className={inputClass}
              defaultValue={selectedRuntime?.defaultPort ?? 3000}
              key={selectedRuntime?.code}
              max="65535"
              min="1"
              name="port"
              type="number"
            />
            <Hint>
              The internal port where the application listens. The selected
              stack version provides the recommended default.
            </Hint>
          </label>
          <details className="rounded-xl border border-brand-primary/10 p-4">
            <summary className="cursor-pointer font-bold">
              Advanced build settings{" "}
              <ChevronDown className="ml-1 inline size-4" />
            </summary>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 font-semibold">
                Build method
                <input
                  className={`${inputClass} opacity-70`}
                  disabled
                  value={
                    stack === "static" ? "Static site" : "Automatic (Nixpacks)"
                  }
                />
                <Hint>
                  Automatic builds are recommended. Dockerfile execution is
                  disabled until package controls and stronger build isolation
                  are enabled.
                </Hint>
              </label>
              <label className="grid gap-2 font-semibold">
                Install command
                <input
                  className={inputClass}
                  name="installCommand"
                  placeholder="Detected automatically"
                />
                <Hint>
                  Optional override for installing dependencies. Leave blank to
                  use framework detection.
                </Hint>
              </label>
              <label className="grid gap-2 font-semibold">
                Build command
                <input
                  className={inputClass}
                  name="buildCommand"
                  placeholder="Detected automatically"
                />
                <Hint>
                  Optional command that compiles or prepares the application
                  before deployment.
                </Hint>
              </label>
              <label className="grid gap-2 font-semibold">
                Start command
                <input
                  className={inputClass}
                  name="startCommand"
                  placeholder="Detected automatically"
                />
                <Hint>
                  Optional command used to start server applications. Static
                  sites do not require one.
                </Hint>
              </label>
            </div>
          </details>
        </Section>
      </div>
      <div className="grid content-start gap-5">
        <Section
          description="Every application receives a unique free address; custom domains depend on the active package."
          icon={Globe2}
          title="Domains"
        >
          <label className="grid gap-2 font-semibold">
            Default domain
            <div className="flex items-stretch overflow-hidden rounded-xl border border-brand-primary/15 bg-white dark:bg-gray-800">
              <input
                className="min-w-0 flex-1 bg-transparent px-4 py-3 outline-none"
                onChange={(event) => {
                  setDomainLabel(slug(event.target.value));
                  setLabelEdited(true);
                }}
                placeholder="customer-api"
                required
                value={domainLabel}
              />
              <span className="flex items-center border-l border-brand-primary/10 bg-app-canvas px-3 text-xs font-bold">
                -{options.suggestedDomainSuffix}.{options.applicationBaseDomain}
              </span>
            </div>
            <Hint>
              Edit the readable portion only. The six-character suffix is fixed
              for this form and makes the complete hostname globally unique.
            </Hint>
          </label>
          <fieldset
            className={`rounded-xl border p-4 ${options.limits?.customDomains.allowed ? "border-brand-primary/10" : "border-amber-500/30 bg-amber-500/5"}`}
            disabled={!options.limits?.customDomains.allowed}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <legend className="font-bold">Custom domains</legend>
                <Hint>
                  DNS and ownership are checked without blocking the initial
                  save. Pending domains can be completed later.
                </Hint>
              </div>
              <button
                className="rounded-lg border p-2"
                onClick={() => setCustomDomains((current) => [...current, ""])}
                type="button"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {!options.limits?.customDomains.allowed && (
              <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
                Your package custom-domain limit has been reached (
                {options.limits?.customDomains.current} of{" "}
                {options.limits?.customDomains.limit ?? "unlimited"} used).
              </p>
            )}
            <div className="mt-3 grid gap-2">
              {customDomains.map((domain, index) => (
                <div className="flex gap-2" key={index}>
                  <input
                    className={`${inputClass} min-w-0 flex-1`}
                    onChange={(event) =>
                      setCustomDomains((current) =>
                        current.map((item, position) =>
                          position === index ? event.target.value : item,
                        ),
                      )
                    }
                    placeholder="app.example.com"
                    value={domain}
                  />
                  <button
                    aria-label="Remove domain"
                    className="rounded-xl border border-rose-500/20 p-3 text-rose-500"
                    onClick={() =>
                      setCustomDomains((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    type="button"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </fieldset>
        </Section>
        <Section
          description="Create an isolated database with an autogenerated password, connect an existing database, or deploy without one."
          icon={Database}
          title="Database"
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["new", "Create new"],
                ["existing", "Use existing"],
                ["none", "No database"],
              ] as const
            ).map(([code, label]) => (
              <button
                className={`rounded-xl border p-3 text-sm font-bold ${databaseMode === code ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                key={code}
                onClick={() => setDatabaseMode(code)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {databaseMode === "new" && (
            <>
              <fieldset>
                <legend className="font-semibold">Database engine</legend>
                <Hint>
                  Choose the engine required by your framework. Ghost Deploy generates
                  restricted credentials and injects them securely.
                </Hint>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    className={`rounded-2xl border p-4 text-left ${databaseEngine === "postgresql" ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                    onClick={() => setDatabaseEngine("postgresql")}
                    disabled={
                      selectedFramework !== undefined &&
                      !selectedFramework.databaseEngines.includes("postgresql")
                    }
                    type="button"
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-blue-500/15 font-black text-blue-700 dark:text-blue-300">
                      Pg
                    </span>
                    <strong className="mt-3 block">PostgreSQL</strong>
                    <span className="text-xs text-app-muted">
                      Recommended default
                    </span>
                  </button>
                  <button
                    className={`rounded-2xl border p-4 text-left ${databaseEngine === "mysql" ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                    onClick={() => setDatabaseEngine("mysql")}
                    disabled={
                      selectedFramework !== undefined &&
                      !selectedFramework.databaseEngines.includes("mysql")
                    }
                    type="button"
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-orange-500/15 font-black text-orange-700 dark:text-orange-300">
                      My
                    </span>
                    <strong className="mt-3 block">MySQL</strong>
                    <span className="text-xs text-app-muted">
                      Broad compatibility
                    </span>
                  </button>
                </div>
              </fieldset>
              <label className="grid gap-2 font-semibold">
                Database name
                <input
                  className={inputClass}
                  defaultValue={name ? `${name} database` : ""}
                  key={name || "database"}
                  name="newDatabaseName"
                  placeholder="Customer API database"
                  required
                />
                <Hint>
                  This is the workspace display name. The actual database,
                  username, and password are generated securely by the platform.
                </Hint>
              </label>
            </>
          )}
          {databaseMode === "existing" && (
            <label className="grid gap-2 font-semibold">
              Existing database
              <select
                className={inputClass}
                onChange={(event) => setExistingDatabaseId(event.target.value)}
                required
                value={existingDatabaseId}
              >
                <option value="">Choose a database</option>
                {options.databases.map((database) => (
                  <option key={database.id} value={database.id}>
                    {database.databaseName}
                  </option>
                ))}
              </select>
              <Hint>
                Only active databases owned by this workspace are available.
                Credentials are injected without exposing the password.
              </Hint>
            </label>
          )}
        </Section>
        <Section
          description="Repository templates generate keys only. Secret values are encrypted and never returned in plain text after saving."
          icon={Braces}
          title="Environment variables"
        >
          {variables.map((variable, index) => (
            <div
              className="grid gap-2 rounded-xl border border-brand-primary/10 p-3 sm:grid-cols-[1fr_1.4fr_auto]"
              key={`${variable.key}-${index}`}
            >
              <input
                aria-label="Variable key"
                className={inputClass}
                onChange={(event) =>
                  updateVariable(index, {
                    key: event.target.value.toUpperCase(),
                  })
                }
                placeholder="VARIABLE_NAME"
                value={variable.key}
              />
              <input
                aria-label={`Value for ${variable.key || "variable"}`}
                className={inputClass}
                onChange={(event) =>
                  updateVariable(index, { value: event.target.value })
                }
                placeholder={variable.isSecret ? "Secret value" : "Value"}
                type={variable.isSecret ? "password" : "text"}
                value={variable.value}
              />
              <button
                aria-label="Remove variable"
                className="rounded-xl border p-3"
                onClick={() =>
                  setVariables((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
                type="button"
              >
                <Trash2 className="size-4" />
              </button>
              <label className="flex items-center gap-2 text-xs">
                <input
                  checked={variable.isSecret}
                  onChange={(event) =>
                    updateVariable(index, { isSecret: event.target.checked })
                  }
                  type="checkbox"
                />{" "}
                Secret
              </label>
              <label className="grid gap-1 text-xs sm:col-span-2">
                Available during
                <select
                  className="rounded-lg border bg-white px-2 py-1 dark:bg-gray-800"
                  onChange={(event) =>
                    updateVariable(index, {
                      scope: event.target.value as EnvironmentVariable["scope"],
                    })
                  }
                  value={variable.scope}
                >
                  <option value="runtime">Runtime</option>
                  <option value="build">Build only</option>
                  <option value="both">Build and runtime</option>
                </select>
              </label>
            </div>
          ))}
          <button
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold"
            onClick={() =>
              setVariables((current) => [
                ...current,
                { key: "", value: "", isSecret: true, scope: "runtime" },
              ])
            }
            type="button"
          >
            <Plus className="size-4" /> Add variable
          </button>
          <Hint>
            Use uppercase keys. Database connection variables are managed
            separately and override conflicting manual keys.
          </Hint>
        </Section>
        <Section
          description="Review the detected configuration before creating resources."
          icon={ServerCog}
          title="Deployment summary"
        >
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-app-muted">Stack</dt>
              <dd className="font-bold">
                {STACKS.find((item) => item.code === stack)?.label}{" "}
                {selectedRuntime?.version ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-app-muted">Framework</dt>
              <dd className="font-bold">
                {frameworkDefinition(framework)?.label ?? "None"}
              </dd>
            </div>
            <div>
              <dt className="text-app-muted">Environment</dt>
              <dd className="font-bold">Selected above</dd>
            </div>
            <div>
              <dt className="text-app-muted">Database</dt>
              <dd className="font-bold capitalize">
                {databaseMode === "new" ? databaseEngine : databaseMode}
              </dd>
            </div>
          </dl>
        </Section>
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-10 flex justify-end border-t border-brand-primary/10 bg-app-surface/95 px-5 py-4 backdrop-blur lg:left-[var(--app-sidebar-width,16rem)]">
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-6 py-3 font-black text-brand-ink disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ServerCog className="size-4" />
          )}{" "}
          Deploy application
        </button>
      </div>
    </form>
  );
}
