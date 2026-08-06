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
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { authenticatedFetch } from "@root/app/utils/authenticatedFetch";
import { SearchableSelect } from "@root/app/components/forms/searchable-select";
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
  availableDomains?: Array<{
    attachedHostnames: string[];
    hostname: string;
    id: string;
    rootAvailable: boolean;
    status: string;
  }>;
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
interface DomainCheck {
  approvalRequired?: boolean;
  available: boolean;
  dnsReady: boolean;
  reason?: string | null;
  records: string[];
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

/** Opens a centered GitHub setup window while keeping the deployment form mounted. */
function openGithubPopup(url: string, name: string): Window | null {
  const width = Math.min(960, window.screen.availWidth - 40);
  const height = Math.min(760, window.screen.availHeight - 80);
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  return window.open(url, name, `popup=yes,width=${Math.round(width)},height=${Math.round(height)},left=${Math.round(left)},top=${Math.round(top)},resizable=yes,scrollbars=yes`);
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
  const [githubConnecting, setGithubConnecting] = useState(false);
  const githubPopupRef = useRef<Window | null>(null);
  const githubPollRef = useRef<number | undefined>(undefined);
  const [branch, setBranch] = useState("main");
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
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
  const [domainChecks, setDomainChecks] = useState<Record<number, DomainCheck | "checking">>({});
  const [selectedOwnedDomain, setSelectedOwnedDomain] = useState("");
  const [ownedSubdomain, setOwnedSubdomain] = useState("");
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
  const branchOptions = useMemo(() => [...new Set([...availableBranches, branch].filter(Boolean))].map((item) => ({ label: item, value: item })), [availableBranches, branch]);

  const loadGithubConnections = useCallback(async (): Promise<GithubConnection[]> => {
    const connections = await request<GithubConnection[]>(
      `/api/v1/workspaces/${workspaceId}/applications/github-connections`,
    );
    setGithubConnections(connections);
    setGithubConnectionId((current) => connections.some(({ id }) => id === current) ? current : connections[0]?.id ?? "");
    return connections;
  }, [workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadGithubConnections().catch(() => undefined), 0);
    return () => window.clearTimeout(timeout);
  }, [loadGithubConnections]);

  useEffect(() => {
    const refresh = (): void => {
      if (sourceMode !== "github") return;
      void loadGithubConnections().catch(() => undefined);
    };
    const message = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "ghostdeploy:github-connected") refresh();
      if (event.data?.type === "ghostdeploy:github-error") {
        if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
        githubPollRef.current = undefined;
        setGithubConnecting(false);
        toast.error(typeof event.data.message === "string" ? event.data.message : "GitHub connection failed.");
      }
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("message", message);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("message", message);
    };
  }, [loadGithubConnections, sourceMode]);

  useEffect(() => () => {
    if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
    if (githubPopupRef.current && !githubPopupRef.current.closed) githubPopupRef.current.close();
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

  useEffect(() => {
    const timers = customDomains.map((hostname, index) => window.setTimeout(() => {
      const value = hostname.trim().toLowerCase();
      if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) return;
      setDomainChecks((current) => ({ ...current, [index]: "checking" }));
      void request<DomainCheck>(`/api/v1/workspaces/${workspaceId}/domains`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hostname: value }) })
        .then((result) => setDomainChecks((current) => ({ ...current, [index]: result })))
        .catch((error: unknown) => setDomainChecks((current) => ({ ...current, [index]: { available: false, dnsReady: false, records: [], reason: error instanceof Error ? error.message : "Domain check failed." } })));
    }, 500));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [customDomains, workspaceId]);

  function addCustomDomain(hostname: string): void {
    const normalized = hostname.trim().toLowerCase();
    if (!normalized) return;
    setCustomDomains((current) => current.includes(normalized) ? current : [...current.filter(Boolean), normalized]);
  }

  async function connectGithub(): Promise<void> {
    const popup = openGithubPopup("about:blank", "ghostdeploy-github-install");
    if (!popup) {
      toast.error("Allow popups for Ghost Deploy, then try connecting GitHub again.");
      return;
    }
    githubPopupRef.current = popup;
    setGithubConnecting(true);
    try {
      const result = await request<{ url: string }>(
        `/api/v1/workspaces/${workspaceId}/applications/github-connections`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      popup.location.replace(result.url);
      const deadline = Date.now() + 5 * 60_000;
      if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
      githubPollRef.current = window.setInterval(() => {
        if (Date.now() >= deadline) {
          if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
          githubPollRef.current = undefined;
          setGithubConnecting(false);
          return;
        }
        void loadGithubConnections().then((connections) => {
          if (!connections.length) return;
          if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
          githubPollRef.current = undefined;
          setGithubConnecting(false);
          if (!popup.closed) popup.close();
          toast.success("GitHub connected to this workspace.");
        }).catch(() => undefined);
      }, 2_000);
    } catch (error) {
      popup.close();
      setGithubConnecting(false);
      toast.error(
        error instanceof Error ? error.message : "Unable to connect GitHub.",
      );
    }
  }

  function configureGithub(reviewUrl: string | undefined): void {
    if (!reviewUrl) return;
    const popup = openGithubPopup(reviewUrl, "ghostdeploy-github-configure");
    if (!popup) toast.error("Allow popups for Ghost Deploy, then try configuring GitHub again.");
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
  function selectSourceMode(mode: "public" | "github"): void {
    setSourceMode(mode);
    setRepository("");
    setBranch("main");
    setAvailableBranches([]);
    setAnalysis(undefined);
  }
  function selectGithubConnection(connectionId: string): void {
    setGithubConnectionId(connectionId);
    setRepository("");
    setBranch("main");
    setAvailableBranches([]);
    setAnalysis(undefined);
    setGithubRepositories([]);
  }
  async function inspectSource(source?: { branch: string; repository: string }): Promise<void> {
    const sourceRepository = source?.repository ?? repository;
    const sourceBranch = source?.branch ?? branch;
    setAnalyzing(true);
    try {
      const result = await request<SourceAnalysis>(
        `/api/v1/workspaces/${workspaceId}/applications/analyze-source`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repository: sourceRepository,
            branch: sourceBranch,
            githubConnectionId:
              sourceMode === "github" ? githubConnectionId : undefined,
          }),
        },
      );
      setAnalysis(result);
      setAvailableBranches(result.branches);
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
      if (result.branches.includes(sourceBranch) === false && result.branches[0])
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
                  onClick={() => selectSourceMode(mode)}
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
                    <div className="grid grid-cols-[minmax(0,1fr)_3rem_3rem] gap-2">
                      <SearchableSelect
                        ariaLabel="Choose connected GitHub account"
                        onChange={(value) => selectGithubConnection(value)}
                        options={githubConnections.map((connection) => ({
                          keywords: `${connection.accountName} ${connection.accountLogin}`,
                          label: `${connection.accountName} (@${connection.accountLogin})`,
                          value: connection.id,
                        }))}
                        placeholder="Choose GitHub account"
                        searchPlaceholder="Search GitHub accounts"
                        value={githubConnectionId}
                      />
                      <button
                        aria-label="Configure GitHub connection"
                        className="grid size-12 place-items-center rounded-xl border border-brand-primary/15"
                        onClick={() => configureGithub(githubConnections.find((item) => item.id === githubConnectionId)?.reviewUrl)}
                        title="Configure GitHub connection"
                        type="button"
                      >
                        <Settings className="size-4" />
                      </button>
                      <button
                        aria-label="Connect another GitHub account"
                        className="grid size-12 place-items-center rounded-xl border border-brand-primary/15"
                        onClick={() => void connectGithub()}
                        title="Connect another GitHub account"
                        type="button"
                      >
                        <UserPlus className="size-4" />
                      </button>
                    </div>
                    <Hint>
                      This workspace can deploy only repositories granted to the
                      selected GitHub App installation.
                    </Hint>
                  </label>
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
                    <SearchableSelect
                      ariaLabel="Choose a permitted GitHub repository"
                      emptyMessage="No permitted repositories found. Use the gear button to review access."
                      onChange={(value) => {
                        const selected = githubRepositories.find((item) => item.url === value);
                        const defaultBranch = selected?.defaultBranch ?? "main";
                        setRepository(value);
                        setBranch(defaultBranch);
                        setAvailableBranches([defaultBranch]);
                        setAnalysis(undefined);
                        if (value) void inspectSource({ repository: value, branch: defaultBranch });
                      }}
                      options={githubRepositories.map((item) => ({
                        keywords: `${item.fullName} ${item.isPrivate ? "private" : "public"}`,
                        label: `${item.fullName}${item.isPrivate ? " (private)" : ""}`,
                        value: item.url,
                      }))}
                      placeholder="Select a repository"
                      searchPlaceholder="Search permitted repositories"
                      value={repository}
                    />
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
                    disabled={githubConnecting}
                    onClick={() => void connectGithub()}
                    type="button"
                  >
                    {githubConnecting ? "Waiting for GitHub…" : "Connect GitHub"}
                  </button>
                </>
              )}
            </div>
          )}
          {sourceMode === "public" && <label className="grid gap-2 font-semibold">
            Repository URL
            <div className="flex gap-2">
              <input
                className={`${inputClass} min-w-0 flex-1`}
                onChange={(event) => {
                  setRepository(event.target.value);
                  setAnalysis(undefined);
                }}
                placeholder="https://github.com/organisation/repository"
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
          </label>}
          {repository.trim() && <label className="grid gap-2 font-semibold">
            Branch
            <SearchableSelect
              allowCreate
              ariaLabel="Choose repository branch"
              emptyMessage="No matching branches found. Enter the exact branch name to add it."
              onChange={(value) => {
                setBranch(value);
                setAnalysis(undefined);
                if (sourceMode === "github") void inspectSource({ repository, branch: value });
              }}
              onCreate={(label) => ({ label, value: label })}
              options={branchOptions}
              placeholder="Choose a branch"
              searchPlaceholder="Search or enter a branch"
              value={branch}
            />
            <Hint>
              The selected branch is built and redeployed. Available branches
              appear after repository detection.
            </Hint>
          </label>}
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
          {!!options.availableDomains?.length && (
            <div className="rounded-xl border border-brand-primary/10 p-4">
              <h4 className="font-bold">Workspace Domains</h4>
              <Hint>
                Reuse an unattached root domain, or create a unique subdomain under any domain owned by this workspace.
              </Hint>
              <div className="mt-3 flex flex-wrap gap-2">
                {options.availableDomains.filter(({ rootAvailable }) => rootAvailable).map((domain) => (
                  <button
                    className={`rounded-xl border px-3 py-2 text-sm font-bold ${customDomains.includes(domain.hostname) ? "border-brand-action bg-brand-action/10" : "border-brand-primary/10"}`}
                    key={domain.id}
                    onClick={() => addCustomDomain(domain.hostname)}
                    type="button"
                  >
                    {domain.hostname}
                  </button>
                ))}
                {!options.availableDomains.some(({ rootAvailable }) => rootAvailable) && <span className="text-sm text-app-muted">No unused root domains.</span>}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input className={inputClass} onChange={(event) => setOwnedSubdomain(slug(event.target.value))} placeholder="Subdomain, e.g. api" value={ownedSubdomain} />
                <select className={inputClass} onChange={(event) => setSelectedOwnedDomain(event.target.value)} value={selectedOwnedDomain}>
                  <option value="">Choose an owned domain</option>
                  {options.availableDomains.map((domain) => <option key={domain.id} value={domain.hostname}>{domain.hostname}</option>)}
                </select>
                <button className="rounded-xl border border-brand-primary/15 px-4 py-3 font-bold" disabled={!ownedSubdomain || !selectedOwnedDomain} onClick={() => { addCustomDomain(`${ownedSubdomain}.${selectedOwnedDomain}`); setOwnedSubdomain(""); }} type="button">Add Subdomain</button>
              </div>
            </div>
          )}
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
              {customDomains.map((domain, index) => {
                const check = domainChecks[index];
                return <div className="grid gap-1" key={index}><div className="flex gap-2">
                  <input
                    className={`${inputClass} min-w-0 flex-1`}
                    onChange={(event) => {
                      setCustomDomains((current) =>
                        current.map((item, position) =>
                          position === index ? event.target.value : item,
                        ),
                      );
                      setDomainChecks((current) => { const next = { ...current }; delete next[index]; return next; });
                    }}
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
                </div>{check === "checking" ? <span className="flex items-center gap-2 text-xs text-app-muted"><LoaderCircle className="size-3 animate-spin" />Checking Availability...</span> : check ? <span className={`text-xs ${check.available ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>{check.available ? check.approvalRequired ? check.reason : check.dnsReady ? `Available · DNS visible: ${check.records.join(", ")}` : "Available · DNS can be configured later" : check.reason}</span> : null}</div>;
              })}
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
                ["new", "Create New"],
                ["existing", "Use Existing"],
                ["none", "No Database"],
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
            <Plus className="size-4" /> Add Variable
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
          Deploy Application
        </button>
      </div>
    </form>
  );
}
