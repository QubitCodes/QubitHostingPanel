import {
	Braces,
	Check,
	ChevronDown,
	Code2,
	Copy,
	Database,
	ExternalLink,
	FileCode2,
	FileUp,
	FolderTree,
	Github,
	Globe2,
	Info,
	LoaderCircle,
	Pencil,
	Plus,
	RefreshCw,
	ServerCog,
	Settings,
	Sparkles,
	Trash2,
	UserPlus,
} from 'lucide-react';
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { toast } from 'sonner';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';
import { RepositoryDirectoryBrowser } from '@root/app/components/applications/repository-directory-browser';
import { SearchableSelect } from '@root/app/components/forms/searchable-select';
import {
	TechnologyLogo,
	type TechnologyLogoName,
} from '@root/app/components/technology-logo';
import { Offcanvas } from '@root/app/components/ui/offcanvas';
import {
	isLikelySecretEnvKey,
	parseEnvFile,
} from '@root/app/utils/envFileParser';
import {
	frameworkDefinition,
	frameworksForLanguage,
	type RuntimeLanguage,
} from '@config/frameworkCatalog';

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
interface DatabaseUserOption {
	databaseCount: number;
	engine: 'mysql' | 'postgresql';
	id: string;
	username: string;
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
		databases: { allowed: boolean; current: number; limit: number | null };
		deployments?: { autoEnabled: boolean; manualEnabled: boolean };
	};
	runtimes: RuntimeOption[];
	suggestedDomainSuffix?: string;
}
interface SourceAnalysis {
	branches: string[];
	directories: string[];
	candidates: Array<{
		commands?: { build?: string; install?: string; start?: string };
		deploymentContract?: {
			checks: Array<{
				code: string;
				message: string;
				status: 'error' | 'pass' | 'warning';
			}>;
			healthCheckPath: string;
			port: number;
			publishDirectory?: string;
			recipeVersion: string;
		};
		environmentKeys?: Array<{
			isSecret: boolean;
			key: string;
			required: boolean;
		}>;
		databaseEngine?: 'mysql' | 'postgresql';
		databaseEvidence?: string[];
		framework?: string;
		packageManager?: string;
		projectDirectory: string;
		stack: RuntimeOption['language'];
	}>;
	environmentKeys: Array<{ isSecret: boolean; key: string; required: boolean }>;
	evidence: string[];
	outputDirectory?: string;
}
interface EnvironmentVariable {
	isSecret: boolean;
	key: string;
	required: boolean;
	scope: 'runtime' | 'build' | 'both';
	value: string;
}
interface GithubConnection {
	accountLogin: string;
	accountName: string;
	avatarUrl?: string;
	id: string;
	reviewUrl: string;
	providerSyncError?: string;
	providerSyncStatus: 'pending' | 'ready' | 'failed';
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
	'rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 outline-none transition focus:border-brand-action dark:bg-gray-800 dark:text-gray-100';
const hintClass =
	'flex items-start gap-1.5 text-xs font-normal leading-5 text-app-muted';
const STACKS: Array<{
	code: RuntimeOption['language'];
	label: string;
	logo: TechnologyLogoName;
	color: string;
}> = [
	{
		code: 'node',
		label: 'Node.js',
		logo: 'node',
		color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
	},
	{
		code: 'php',
		label: 'PHP',
		logo: 'php',
		color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
	},
	{
		code: 'python',
		label: 'Python',
		logo: 'python',
		color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
	},
	{
		code: 'static',
		label: 'Static site',
		logo: 'html',
		color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
	},
	{
		code: 'ruby',
		label: 'Ruby',
		logo: 'ruby',
		color: 'bg-red-500/15 text-red-700 dark:text-red-300',
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
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 50);
}

/** Converts a customer label into a database-safe snake_case identifier. */
function databaseIdentifier(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.replace(/_+/g, '_')
		.slice(0, 70);
}

/** Creates a Laravel-compatible 32-byte application key in the browser. */
function generatedEnvironmentValue(framework: string | undefined, key: string): string {
	if (framework !== 'laravel' || key !== 'APP_KEY') return '';
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return `base64:${btoa(String.fromCharCode(...bytes))}`;
}

/** Generates a strong URL-safe password that works with PostgreSQL, MySQL and connection URLs. */
function generateDatabasePassword(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const generated = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
	return `Gd${generated.slice(2)}7a`;
}

/** Copies one configuration value while keeping clipboard failures visible. */
async function copyConfigurationValue(value: string, label: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(value);
		toast.success(`${label} copied.`);
	} catch {
		toast.error(`Unable to copy ${label.toLowerCase()}.`);
	}
}

function Hint({ children }: { children: string }) {
	return (
		<span className={hintClass}>
			<Info className="mt-0.5 size-3.5 shrink-0" />
			{children}
		</span>
	);
}

/** Splits repository scan evidence into a file path and a readable result. */
function evidenceParts(evidence: string): { detail: string; path: string } {
	for (const separator of [' identifies ', ' provides ']) {
		const separatorIndex = evidence.indexOf(separator);
		if (separatorIndex >= 0) {
			return {
				path: evidence.slice(0, separatorIndex),
				detail: `${separator.trim()} ${evidence.slice(separatorIndex + separator.length)}`,
			};
		}
	}
	return { detail: evidence, path: 'Repository scan' };
}

/** Presents detected source metadata without overwhelming the deployment form. */
function DetectionSummary({
	analysis,
	candidate,
}: {
	analysis: SourceAnalysis;
	candidate: SourceAnalysis['candidates'][number];
}) {
	const stackLabel = STACKS.find(
		({ code }) => code === candidate?.stack,
	)?.label;
	const detectedFramework = frameworkDefinition(candidate?.framework)?.label;
	const evidence = analysis.evidence.map(evidenceParts);
	const checks = candidate?.deploymentContract?.checks ?? [];
	const passedChecks = checks.filter(({ status }) => status === 'pass').length;
	const actionChecks = checks.filter(({ status }) => status !== 'pass').length;

	return (
		<div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06]">
			<div className="flex items-start gap-3 p-4">
				<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
					<Check className="size-5" />
				</span>
				<div className="min-w-0 flex-1">
					<p className="font-bold text-emerald-800 dark:text-emerald-200">
						Source detection complete
					</p>
					<p className="mt-1 text-xs leading-5 text-app-muted">
						We inspected repository manifests and suggested the configuration
						below.
					</p>
				</div>
			</div>

			<dl className="grid gap-px border-y border-emerald-500/15 bg-emerald-500/15 sm:grid-cols-2">
				{[
					['Stack', stackLabel ?? 'Not detected'],
					['Framework', detectedFramework ?? 'Not detected'],
					[
						'Database',
						candidate.databaseEngine === 'postgresql'
							? 'PostgreSQL detected'
							: candidate.databaseEngine === 'mysql'
								? 'MySQL detected'
								: 'Not detected',
					],
					[
						'Project directory',
						!candidate?.projectDirectory || candidate.projectDirectory === '/' ? 'Repository root' : candidate.projectDirectory,
					],
					['Package manager', candidate?.packageManager ?? 'Automatic'],
					[
						'Configuration checks',
						checks.length
							? `${passedChecks} passed${actionChecks ? ` · ${actionChecks} to review` : ''}`
							: 'Pending',
					],
					[
						'Environment variables',
						(candidate.environmentKeys ?? analysis.environmentKeys).length
							? `${(candidate.environmentKeys ?? analysis.environmentKeys).length} keys found`
							: 'None found',
					],
				].map(([label, value]) => (
					<div className="min-w-0 bg-app-surface/95 px-4 py-3" key={label}>
						<dt className="text-[0.68rem] font-bold uppercase tracking-wide text-app-muted">
							{label}
						</dt>
						<dd className="mt-1 truncate text-sm font-semibold" title={value}>
							{value}
						</dd>
					</div>
				))}
			</dl>

			<details className="group">
				<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-emerald-800 marker:content-none dark:text-emerald-200">
					<span>
						View detection details
						{evidence.length ? ` (${evidence.length})` : ''}
					</span>
					<ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
				</summary>
				<div className="max-h-64 overflow-y-auto border-t border-emerald-500/15 px-4 py-2">
					{checks.length > 0 && (
						<ul className="mb-2 divide-y divide-brand-primary/10 border-b border-brand-primary/10">
							{checks.map((check) => (
								<li className="flex items-start gap-3 py-3" key={check.code}>
									<span
										className={`mt-1 size-2 shrink-0 rounded-full ${check.status === 'pass' ? 'bg-emerald-500' : check.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`}
									/>
									<p className="text-xs text-app-muted">{check.message}</p>
								</li>
							))}
						</ul>
					)}
					{evidence.length ? (
						<ul className="divide-y divide-brand-primary/10">
							{evidence.map((item, index) => (
								<li
									className="flex min-w-0 items-start gap-3 py-3"
									key={`${item.path}-${index}`}
								>
									<FileCode2 className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
									<div className="min-w-0">
										<p
											className="truncate text-xs font-semibold"
											title={item.path}
										>
											{item.path}
										</p>
										<p className="mt-0.5 text-xs text-app-muted">
											{item.detail}
										</p>
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="py-3 text-xs text-app-muted">
							Repository inspected; no specific framework evidence was found.
						</p>
					)}
				</div>
			</details>
		</div>
	);
}

interface PopupViewport {
	availableHeight: number;
	availableWidth: number;
	outerHeight: number;
	outerWidth: number;
	screenX: number;
	screenY: number;
}

/** Builds a centered, resizable popup geometry constrained to the current display. */
export function githubPopupFeatures(viewport: PopupViewport): string {
	const width = Math.max(360, Math.min(720, viewport.availableWidth - 32));
	const height = Math.max(520, Math.min(760, viewport.availableHeight - 32));
	const left = Math.max(0, Math.round(viewport.screenX + (viewport.outerWidth - width) / 2));
	const top = Math.max(0, Math.round(viewport.screenY + (viewport.outerHeight - height) / 2));
	return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,location=no,menubar=no,status=no`;
}

/** Creates a collision-free browser-context name for a fresh GitHub setup popup. */
export function githubPopupName(prefix: string, uniqueId: string): string {
	return `${prefix}-${uniqueId}`;
}

/** Opens or reuses only the popup owned by this form, never a stale named tab or the current page. */
function openGithubPopup(url: string, namePrefix: string, existing?: Window | null): Window | null {
	if (existing && existing !== window && !existing.closed) {
		existing.location.href = url;
		existing.focus();
		return existing;
	}
	const popup = window.open('', githubPopupName(namePrefix, crypto.randomUUID()), githubPopupFeatures({
		availableHeight: window.screen.availHeight,
		availableWidth: window.screen.availWidth,
		outerHeight: window.outerHeight,
		outerWidth: window.outerWidth,
		screenX: window.screenX,
		screenY: window.screenY,
	}));
	if (!popup || popup === window) return null;
	popup.location.replace(url);
	popup.focus();
	return popup;
}

function Section({
	action,
	children,
	description,
	icon: Icon,
	title,
}: {
	action?: React.ReactNode;
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
				<div className="min-w-0 flex-1">
					<h3 className="font-black">{title}</h3>
					<p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
				</div>
				{action}
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
	const [name, setName] = useState('');
	const [domainLabel, setDomainLabel] = useState('');
	const [labelEdited, setLabelEdited] = useState(false);
	const [repository, setRepository] = useState('');
	const [sourceMode, setSourceMode] = useState<'public' | 'github'>('public');
	const [githubConnections, setGithubConnections] = useState<
		GithubConnection[]
	>([]);
	const [githubConnectionId, setGithubConnectionId] = useState('');
	const [githubRepositories, setGithubRepositories] = useState<
		GithubRepository[]
	>([]);
	const [githubConnecting, setGithubConnecting] = useState(false);
	const githubPopupRef = useRef<Window | null>(null);
	const githubPollRef = useRef<number | undefined>(undefined);
	const repositoryRef = useRef(repository);
	const [branch, setBranch] = useState('main');
	const [availableBranches, setAvailableBranches] = useState<string[]>([]);
	const [analysis, setAnalysis] = useState<SourceAnalysis>();
	const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
	const [analyzing, setAnalyzing] = useState(false);
	const [stack, setStack] = useState<RuntimeOption['language']>('node');
	const [runtimeCode, setRuntimeCode] = useState('');
	const [framework, setFramework] = useState<string>('');
	const [projectDirectory, setProjectDirectory] = useState('/');
	const [outputDirectory, setOutputDirectory] = useState('');
	const [directoryTarget, setDirectoryTarget] = useState<
		'output' | 'project' | null
	>(null);
	const [installCommand, setInstallCommand] = useState('');
	const [buildCommand, setBuildCommand] = useState('');
	const [startCommand, setStartCommand] = useState('');
	const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
	const [deploymentEnvironment, setDeploymentEnvironment] = useState<'development' | 'testing' | 'staging' | 'production'>('production');
	const [environmentEditorOpen, setEnvironmentEditorOpen] = useState(false);
	const [environmentImportOpen, setEnvironmentImportOpen] = useState(false);
	const [environmentImportSource, setEnvironmentImportSource] = useState('');
	const [clearEnvironmentBeforeImport, setClearEnvironmentBeforeImport] =
		useState(false);
	const [databaseSuffix] = useState(
		() =>
			options.suggestedDomainSuffix ??
			crypto.randomUUID().replaceAll('-', '').slice(0, 6),
	);
	const [databaseNamePrefix, setDatabaseNamePrefix] = useState('');
	const [databaseNameEdited, setDatabaseNameEdited] = useState(false);
	const [databaseNameAvailability, setDatabaseNameAvailability] = useState<
		'idle' | 'checking' | 'available' | 'unavailable' | 'error'
	>('idle');
	const [databaseMode, setDatabaseMode] = useState<'new' | 'existing' | 'none'>(
		options.limits?.databases.allowed === false
			? options.databases.length
				? 'existing'
				: 'none'
			: 'new',
	);
	const [databaseEngine, setDatabaseEngine] = useState<'postgresql' | 'mysql'>(
		'postgresql',
	);
	const [databaseUserMode, setDatabaseUserMode] = useState<'new' | 'existing'>('new');
	const [databaseUsername, setDatabaseUsername] = useState('');
	const [databaseUsernameEdited, setDatabaseUsernameEdited] = useState(false);
	const [databasePassword, setDatabasePassword] = useState(generateDatabasePassword);
	const [databaseUsers, setDatabaseUsers] = useState<DatabaseUserOption[]>([]);
	const [existingDatabaseUserId, setExistingDatabaseUserId] = useState('');
	const [existingDatabaseId, setExistingDatabaseId] = useState(
		options.limits?.databases.allowed === false
			? (options.databases[0]?.id ?? '')
			: '',
	);
	const [customDomains, setCustomDomains] = useState<string[]>(['']);
	const [domainChecks, setDomainChecks] = useState<
		Record<number, DomainCheck | 'checking'>
	>({});
	const [selectedOwnedDomain, setSelectedOwnedDomain] = useState('');
	const [ownedSubdomain, setOwnedSubdomain] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const stackRuntimes = useMemo(
		() => options.runtimes.filter((runtime) => runtime.language === stack),
		[options.runtimes, stack],
	);
	const selectedRuntime =
		options.runtimes.find((runtime) => runtime.code === runtimeCode) ??
		stackRuntimes.find((runtime) => runtime.isDefault) ??
		stackRuntimes[0];
	const [applicationPort, setApplicationPort] = useState(3000);
	const selectedFramework = frameworkDefinition(framework);
	const branchOptions = useMemo(
		() =>
			[...new Set([...availableBranches, branch].filter(Boolean))].map(
				(item) => ({ label: item, value: item }),
			),
		[availableBranches, branch],
	);
	const combinedDatabaseName = databaseNamePrefix
		? `${databaseNamePrefix}_${databaseSuffix}`
		: '';
	const effectiveDatabaseUsername = databaseUsernameEdited ? databaseUsername : combinedDatabaseName;
	const platformHostname = domainLabel && options.applicationBaseDomain
		? `${domainLabel}-${databaseSuffix}.${options.applicationBaseDomain}`
		: '';
	const configurationValues = useMemo(() => {
		const values: Array<{ label: string; value: string; secret?: boolean }> = [
			{ label: 'Application name', value: name || 'Not set' },
			{ label: 'Environment', value: deploymentEnvironment },
			{ label: 'Application URL', value: platformHostname ? `https://${platformHostname}` : 'Generated after naming the application' },
			{ label: 'Hostname', value: platformHostname || 'Generated after naming the application' },
			{ label: 'Repository', value: repository || 'Not selected' },
			{ label: 'Branch', value: branch || 'Not selected' },
			{ label: 'Stack', value: STACKS.find(({ code }) => code === stack)?.label ?? stack },
			{ label: 'Stack version', value: selectedRuntime?.version ?? 'Not selected' },
			{ label: 'Framework', value: frameworkDefinition(framework)?.label ?? 'None' },
			{ label: 'Project directory', value: projectDirectory || '/' },
			{ label: 'Output directory', value: outputDirectory || 'Not required' },
			{ label: 'Application port', value: String(applicationPort) },
		];
		if (databaseMode === 'new') values.push(
			{ label: 'Database type', value: databaseEngine },
			{ label: 'Database port', value: databaseEngine === 'postgresql' ? '5432' : '3306' },
			{ label: 'Database name', value: combinedDatabaseName || 'Generated after naming the application' },
			{ label: 'Database username', value: effectiveDatabaseUsername || 'Generated after naming the application' },
			...(databaseUserMode === 'new' ? [{ label: 'Database password', value: databasePassword, secret: true }] : []),
			{ label: 'Database host', value: 'Assigned during provisioning' },
			{ label: 'Database URL', value: 'Completed during provisioning', secret: true },
		);
		else if (databaseMode === 'existing') values.push({ label: 'Database', value: options.databases.find(({ id }) => id === existingDatabaseId)?.databaseName ?? 'Not selected' });
		return values;
	}, [applicationPort, branch, combinedDatabaseName, databaseEngine, databaseMode, databasePassword, databaseUserMode, deploymentEnvironment, effectiveDatabaseUsername, existingDatabaseId, framework, name, options.databases, outputDirectory, platformHostname, projectDirectory, repository, selectedRuntime?.version, stack]);
	const environmentPreview = useMemo(() => variables.filter(({ key }) => key.trim()).map(({ key, value }) => `${key.trim().toUpperCase()}=${value}`).join('\n'), [variables]);

	useEffect(() => {
		if (databaseMode !== 'new') return;
		const controller = new AbortController();
		void request<DatabaseUserOption[]>(`/api/v1/workspaces/${workspaceId}/database-users?engine=${databaseEngine}`, { signal: controller.signal })
			.then((users) => {
				setDatabaseUsers(users);
				setExistingDatabaseUserId((current) => users.some(({ id }) => id === current) ? current : (users[0]?.id ?? ''));
				if (!users.length) setDatabaseUserMode('new');
			})
			.catch((error: unknown) => {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				setDatabaseUsers([]);
			});
		return () => controller.abort();
	}, [databaseEngine, databaseMode, workspaceId]);
	const parsedEnvironmentImport = useMemo(
		() => parseEnvFile(environmentImportSource),
		[environmentImportSource],
	);
	const environmentImportPreview = useMemo(() => {
		const existing = new Map(
			variables
				.filter(({ key }) => key.trim())
				.map((variable) => [variable.key.trim().toUpperCase(), variable]),
		);
		const importedKeys = new Set(
			parsedEnvironmentImport.entries.map(({ key }) => key),
		);
		const added = parsedEnvironmentImport.entries.filter(
			({ key }) => !existing.has(key),
		).length;
		const updated = parsedEnvironmentImport.entries.filter(({ key, value }) => {
			const current = existing.get(key);
			return current !== undefined && current.value !== value;
		}).length;
		const same = parsedEnvironmentImport.entries.filter(({ key, value }) => {
			const current = existing.get(key);
			return current !== undefined && current.value === value;
		}).length;
		const untouched = clearEnvironmentBeforeImport
			? 0
			: [...existing.keys()].filter((key) => !importedKeys.has(key)).length;
		const removed = clearEnvironmentBeforeImport
			? [...existing.keys()].filter((key) => !importedKeys.has(key)).length
			: 0;
		const total = clearEnvironmentBeforeImport
			? importedKeys.size
			: new Set([...existing.keys(), ...importedKeys]).size;
		return { added, removed, total, unchanged: same + untouched, updated };
	}, [clearEnvironmentBeforeImport, parsedEnvironmentImport, variables]);

	useEffect(() => {
		if (databaseMode !== 'new' || !combinedDatabaseName) return;
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			setDatabaseNameAvailability('checking');
			void request<{ available: boolean; name: string }>(
				`/api/v1/workspaces/${workspaceId}/databases/name-availability?name=${encodeURIComponent(combinedDatabaseName)}`,
				{ signal: controller.signal },
			)
				.then((result) => {
					setDatabaseNameAvailability(
						result.available ? 'available' : 'unavailable',
					);
				})
				.catch((error: unknown) => {
					if (error instanceof DOMException && error.name === 'AbortError')
						return;
					setDatabaseNameAvailability('error');
				});
		}, 450);
		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [combinedDatabaseName, databaseMode, workspaceId]);

	const loadGithubConnections = useCallback(async (): Promise<
		GithubConnection[]
	> => {
		const connections = await request<GithubConnection[]>(
			`/api/v1/workspaces/${workspaceId}/applications/github-connections`,
		);
		setGithubConnections(connections);
		setGithubConnectionId((current) =>
			connections.some(({ id }) => id === current)
				? current
				: (connections[0]?.id ?? ''),
		);
		return connections;
	}, [workspaceId]);

	const loadGithubRepositories = useCallback(async (connectionId: string): Promise<GithubRepository[]> => {
		if (!connectionId) {
			setGithubRepositories([]);
			return [];
		}
		const repositories = await request<GithubRepository[]>(
			`/api/v1/workspaces/${workspaceId}/applications/github-connections/${connectionId}/repositories`,
		);
		setGithubRepositories(repositories);
		if (repositoryRef.current && !repositories.some(({ url }) => url === repositoryRef.current)) {
			repositoryRef.current = '';
			setRepository('');
			setBranch('main');
			setAvailableBranches([]);
			setAnalysis(undefined);
		}
		return repositories;
	}, [workspaceId]);

	const refreshGithubAccess = useCallback(async (notify = false): Promise<void> => {
		const connections = await request<GithubConnection[]>(
			`/api/v1/workspaces/${workspaceId}/applications/github-connections/reconcile`,
			{ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
		);
		setGithubConnections(connections);
		const selectedConnectionId = connections.some(({ id }) => id === githubConnectionId)
			? githubConnectionId
			: (connections[0]?.id ?? '');
		setGithubConnectionId(selectedConnectionId);
		await loadGithubRepositories(selectedConnectionId);
		if (notify) toast.success('GitHub accounts and repository access refreshed.');
	}, [githubConnectionId, loadGithubRepositories, workspaceId]);

	useEffect(() => { repositoryRef.current = repository; }, [repository]);

	useEffect(() => {
		const timeout = window.setTimeout(
			() => void loadGithubConnections().catch(() => undefined),
			0,
		);
		return () => window.clearTimeout(timeout);
	}, [loadGithubConnections]);

	useEffect(() => {
		const refresh = (): void => {
			if (sourceMode !== 'github') return;
			void refreshGithubAccess().catch(() => undefined);
		};
		const message = (event: MessageEvent): void => {
			if (event.origin !== window.location.origin) return;
			if (event.data?.type === 'ghostdeploy:github-connected') {
				if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
				githubPollRef.current = undefined;
				void loadGithubConnections().then((connections) => {
					const connectionId = typeof event.data.connectionId === 'string' ? event.data.connectionId : undefined;
					if (connectionId && connections.some(({ id }) => id === connectionId)) setGithubConnectionId(connectionId);
					setGithubConnecting(false);
					toast.success('GitHub account connected to this workspace.');
				}).catch(() => undefined);
			}
			if (event.data?.type === 'ghostdeploy:github-existing') {
				if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
				githubPollRef.current = undefined;
				setGithubConnecting(false);
				void refreshGithubAccess().catch(() => undefined);
				toast.info('That GitHub account is already connected. Choose a different account or installation.');
			}
			if (event.data?.type === 'ghostdeploy:github-error') {
				if (githubPollRef.current !== undefined)
					window.clearInterval(githubPollRef.current);
				githubPollRef.current = undefined;
				setGithubConnecting(false);
				toast.error(
					typeof event.data.message === 'string'
						? event.data.message
						: 'GitHub connection failed.',
				);
			}
		};
		window.addEventListener('focus', refresh);
		window.addEventListener('message', message);
		return () => {
			window.removeEventListener('focus', refresh);
			window.removeEventListener('message', message);
		};
	}, [loadGithubConnections, refreshGithubAccess, sourceMode]);

	useEffect(
		() => () => {
			if (githubPollRef.current !== undefined)
				window.clearInterval(githubPollRef.current);
			if (githubPopupRef.current && !githubPopupRef.current.closed)
				githubPopupRef.current.close();
		},
		[workspaceId],
	);

	useEffect(() => {
		if (!githubConnectionId) return;
		const timeout = window.setTimeout(() => void loadGithubRepositories(githubConnectionId)
			.catch((error) =>
				toast.error(
					error instanceof Error
						? error.message
						: 'Unable to load GitHub repositories.',
				),
			), 0);
		return () => window.clearTimeout(timeout);
	}, [githubConnectionId, loadGithubRepositories]);

	useEffect(() => {
		const timers = customDomains.map((hostname, index) =>
			window.setTimeout(() => {
				const value = hostname.trim().toLowerCase();
				if (
					!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
						value,
					)
				)
					return;
				setDomainChecks((current) => ({ ...current, [index]: 'checking' }));
				void request<DomainCheck>(`/api/v1/workspaces/${workspaceId}/domains`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ hostname: value }),
				})
					.then((result) =>
						setDomainChecks((current) => ({ ...current, [index]: result })),
					)
					.catch((error: unknown) =>
						setDomainChecks((current) => ({
							...current,
							[index]: {
								available: false,
								dnsReady: false,
								records: [],
								reason:
									error instanceof Error
										? error.message
										: 'Domain check failed.',
							},
						})),
					);
			}, 500),
		);
		return () => timers.forEach((timer) => window.clearTimeout(timer));
	}, [customDomains, workspaceId]);

	function addCustomDomain(hostname: string): void {
		const normalized = hostname.trim().toLowerCase();
		if (!normalized) return;
		setCustomDomains((current) =>
			current.includes(normalized)
				? current
				: [...current.filter(Boolean), normalized],
		);
	}

	async function connectGithub(): Promise<void> {
		const existingConnectionIds = new Set(githubConnections.map(({ id }) => id));
		const popup = openGithubPopup('about:blank', 'ghostdeploy-github-install', githubPopupRef.current);
		if (!popup) {
			toast.error(
				'Allow popups for Ghost Deploy, then try connecting GitHub again.',
			);
			return;
		}
		githubPopupRef.current = popup;
		setGithubConnecting(true);
		try {
			const result = await request<{ url: string }>(
				`/api/v1/workspaces/${workspaceId}/applications/github-connections`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: '{}',
				},
			);
			popup.location.replace(result.url);
			const deadline = Date.now() + 5 * 60_000;
			if (githubPollRef.current !== undefined)
				window.clearInterval(githubPollRef.current);
			githubPollRef.current = window.setInterval(() => {
				if (Date.now() >= deadline) {
					if (githubPollRef.current !== undefined)
						window.clearInterval(githubPollRef.current);
					githubPollRef.current = undefined;
					setGithubConnecting(false);
					return;
				}
				void loadGithubConnections()
					.then((connections) => {
						const addedConnection = connections.find(({ id }) => !existingConnectionIds.has(id));
						if (!addedConnection) return;
						if (githubPollRef.current !== undefined)
							window.clearInterval(githubPollRef.current);
						githubPollRef.current = undefined;
						setGithubConnecting(false);
						setGithubConnectionId(addedConnection.id);
						if (!popup.closed) popup.close();
						toast.success('GitHub connected to this workspace.');
					})
					.catch(() => undefined);
			}, 2_000);
		} catch (error) {
			popup.close();
			setGithubConnecting(false);
			toast.error(
				error instanceof Error ? error.message : 'Unable to connect GitHub.',
			);
		}
	}

	function configureGithub(reviewUrl: string | undefined): void {
		if (!reviewUrl) return;
		const popup = openGithubPopup(reviewUrl, 'ghostdeploy-github-configure', githubPopupRef.current);
		if (!popup)
			toast.error(
				'Allow popups for Ghost Deploy, then try configuring GitHub again.',
			);
		else {
			githubPopupRef.current = popup;
			if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
			const deadline = Date.now() + 10 * 60_000;
			githubPollRef.current = window.setInterval(() => {
				if (!popup.closed && Date.now() < deadline) return;
				if (githubPollRef.current !== undefined) window.clearInterval(githubPollRef.current);
				githubPollRef.current = undefined;
				githubPopupRef.current = null;
				void refreshGithubAccess(true).catch((error: unknown) =>
					toast.error(error instanceof Error ? error.message : 'Unable to refresh GitHub access.'),
				);
			}, 1_000);
		}
	}

	async function syncGithubProvider(): Promise<void> {
		if (!githubConnectionId) return;
		try {
			await request<{ providerSyncStatus: 'ready' }>(
				`/api/v1/workspaces/${workspaceId}/applications/github-connections/${githubConnectionId}/sync`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: '{}',
				},
			);
			setGithubConnections((connections) =>
				connections.map((connection) =>
					connection.id === githubConnectionId
						? {
								...connection,
								providerSyncStatus: 'ready',
								providerSyncError: undefined,
							}
						: connection,
				),
			);
			toast.success('GitHub deployment provider is ready.');
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Provider synchronization failed.',
			);
		}
	}

	function changeName(value: string): void {
		setName(value);
		if (!labelEdited) setDomainLabel(slug(value));
		if (!databaseNameEdited) {
			const identifier = databaseIdentifier(value);
			setDatabaseNamePrefix(identifier);
			setDatabaseNameAvailability(identifier ? 'checking' : 'idle');
		}
	}
	function selectStack(value: RuntimeOption['language']): void {
		setStack(value);
		const available = options.runtimes.filter(
			(runtime) => runtime.language === value,
		);
		const runtime = available.find((item) => item.isDefault) ?? available[0];
		setRuntimeCode(runtime?.code ?? '');
		setApplicationPort(runtime?.defaultPort ?? 3000);
		setFramework('');
	}
	function selectFramework(code: string): void {
		setFramework(code);
		const definition = frameworkDefinition(code);
		if (!definition) return;
		if (definition.outputDirectory)
			setOutputDirectory(definition.outputDirectory);
		if (definition.databaseEngines.length === 0) setDatabaseMode('none');
		else if (databaseMode === 'none') setDatabaseMode('new');
		if (
			definition.databaseEngines.length === 1 &&
			definition.databaseEngines[0]
		)
			setDatabaseEngine(definition.databaseEngines[0]);
	}
	function selectSourceMode(mode: 'public' | 'github'): void {
		setSourceMode(mode);
		setRepository('');
		setBranch('main');
		setAvailableBranches([]);
		setAnalysis(undefined);
		setSelectedCandidateIndex(0);
	}
	function selectGithubConnection(connectionId: string): void {
		setGithubConnectionId(connectionId);
		setRepository('');
		setBranch('main');
		setAvailableBranches([]);
		setAnalysis(undefined);
		setSelectedCandidateIndex(0);
		setGithubRepositories([]);
	}
	function applyDetectedCandidate(
		candidate: SourceAnalysis['candidates'][number],
		fallbackEnvironmentKeys: SourceAnalysis['environmentKeys'],
	): void {
		selectStack(candidate.stack);
		setProjectDirectory(candidate.projectDirectory);
		if (candidate.framework) selectFramework(candidate.framework);
		if (candidate.databaseEngine) setDatabaseEngine(candidate.databaseEngine);
		if (candidate.deploymentContract?.port) setApplicationPort(candidate.deploymentContract.port);
		setInstallCommand(candidate.commands?.install ?? '');
		setBuildCommand(candidate.commands?.build ?? '');
		setStartCommand(candidate.commands?.start ?? '');
		setOutputDirectory(candidate.deploymentContract?.publishDirectory ?? '');
		setVariables(
			(candidate.environmentKeys ?? fallbackEnvironmentKeys).map((item) => ({
				key: item.key,
				value: generatedEnvironmentValue(candidate.framework, item.key),
				isSecret: item.isSecret,
				required: item.required,
				scope: /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(item.key)
					? 'both'
					: 'runtime',
			})),
		);
	}
	async function inspectSource(source?: {
		branch: string;
		repository: string;
	}): Promise<void> {
		const sourceRepository = source?.repository ?? repository;
		const sourceBranch = source?.branch ?? branch;
		setAnalyzing(true);
		try {
			const result = await request<SourceAnalysis>(
				`/api/v1/workspaces/${workspaceId}/applications/analyze-source`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						repository: sourceRepository,
						branch: sourceBranch,
						githubConnectionId:
							sourceMode === 'github' ? githubConnectionId : undefined,
					}),
				},
			);
			setAnalysis(result);
			setSelectedCandidateIndex(0);
			setAvailableBranches(result.branches);
			const candidate = result.candidates[0];
			if (candidate) applyDetectedCandidate(candidate, result.environmentKeys);
			else setOutputDirectory(result.outputDirectory ?? '');
			if (
				result.branches.includes(sourceBranch) === false &&
				result.branches[0]
			)
				setBranch(result.branches[0]);
			toast.success(
				'Repository configuration detected. Review every suggestion before deploying.',
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Repository analysis failed.',
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

	/** Merges the locally parsed dotenv values into the deployment form. */
	function applyEnvironmentImport(): void {
		if (!parsedEnvironmentImport.entries.length) {
			toast.error('Add at least one valid environment variable.');
			return;
		}
		setVariables((current) => {
			const next = clearEnvironmentBeforeImport
				? current
						.filter(({ required }) => required)
						.map((item) => ({ ...item, value: '' }))
				: current.map((item) => ({ ...item }));
			const positions = new Map(
				next
					.map(
						(variable, index) =>
							[variable.key.trim().toUpperCase(), index] as const,
					)
					.filter(([key]) => key),
			);
			for (const entry of parsedEnvironmentImport.entries) {
				const position = positions.get(entry.key);
				if (position !== undefined) {
					const existing = next[position];
					if (existing) next[position] = { ...existing, value: entry.value };
					continue;
				}
				positions.set(entry.key, next.length);
				next.push({
					isSecret: isLikelySecretEnvKey(entry.key),
					key: entry.key,
					required: false,
					scope: 'runtime',
					value: entry.value,
				});
			}
			return next;
		});
		setEnvironmentImportOpen(false);
		setEnvironmentImportSource('');
		setClearEnvironmentBeforeImport(false);
		toast.success('Environment values imported into this deployment form.');
	}

	/** Reads a customer-selected dotenv file locally without uploading it. */
	async function readEnvironmentFile(file: File | undefined): Promise<void> {
		if (!file) return;
		if (file.size > 1_048_576) {
			toast.error('Environment file must be 1 MB or smaller.');
			return;
		}
		try {
			setEnvironmentImportSource(await file.text());
		} catch {
			toast.error('Unable to read the selected environment file.');
		}
	}

	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		if (!selectedRuntime) {
			toast.error('Choose a stack version.');
			return;
		}
		if (databaseMode === 'new' && databaseNameAvailability !== 'available') {
			toast.error(
				databaseNameAvailability === 'unavailable'
					? 'Choose an available database name.'
					: 'Wait for database name verification to finish.',
			);
			return;
		}
		if (databaseMode === 'new' && databaseUserMode === 'new' && !effectiveDatabaseUsername.trim()) {
			toast.error('Enter a database username.');
			return;
		}
		if (databaseMode === 'new' && databaseUserMode === 'new' && (databasePassword.length < 16 || !/[a-z]/.test(databasePassword) || !/[A-Z]/.test(databasePassword) || !/[0-9]/.test(databasePassword))) {
			toast.error('Database password must have at least 16 characters, including uppercase, lowercase, and a number.');
			return;
		}
		if (databaseMode === 'new' && databaseUserMode === 'existing' && !existingDatabaseUserId) {
			toast.error('Choose an existing database user.');
			return;
		}
		if (!Number.isInteger(applicationPort) || applicationPort < 1 || applicationPort > 65_535) {
			toast.error('Application port must be between 1 and 65535.');
			return;
		}
		const missingEnvironment = variables.filter(
			({ required, value }) => required && !value.trim(),
		);
		if (missingEnvironment.length) {
			toast.error(
				`Set required environment variable${missingEnvironment.length === 1 ? '' : 's'}: ${missingEnvironment.map(({ key }) => key).join(', ')}.`,
			);
			setEnvironmentEditorOpen(true);
			return;
		}
		setSubmitting(true);
		try {
			let databaseId = existingDatabaseId;
			if (databaseMode === 'new') {
				const created = await request<{ database: { id: string } }>(
					`/api/v1/workspaces/${workspaceId}/databases`,
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							engine: databaseEngine,
							name: combinedDatabaseName,
							userMode: databaseUserMode,
							username: databaseUserMode === 'new' ? effectiveDatabaseUsername : undefined,
							password: databaseUserMode === 'new' ? databasePassword : undefined,
							databaseUserId: databaseUserMode === 'existing' ? existingDatabaseUserId : undefined,
							connectionLimit: 10,
							storageQuotaMb: 1024,
						}),
					},
				);
				databaseId = created.database.id;
			}
			const result = await request<{ id: string }>(
				`/api/v1/workspaces/${workspaceId}/applications`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						name,
						subdomain: domainLabel,
						subdomainSuffix: databaseSuffix,
						repository,
						githubConnectionId:
							sourceMode === 'github' ? githubConnectionId : undefined,
						branch,
						runtimeCode: selectedRuntime.code,
						framework: framework || null,
						deploymentEnvironment,
						autoDeployEnabled:
							data.get('autoDeployEnabled') === 'on' &&
							options.limits?.deployments?.autoEnabled === true,
						buildPack: stack === 'static' ? 'static' : 'nixpacks',
						port: applicationPort,
						baseDirectory: projectDirectory,
						publishDirectory:
							stack === 'static' ? outputDirectory || undefined : undefined,
						installCommand: installCommand || undefined,
						buildCommand: buildCommand || undefined,
						startCommand: startCommand || undefined,
						domains: options.limits?.customDomains.allowed
							? customDomains
									.map((item) => item.trim().toLowerCase())
									.filter(Boolean)
							: [],
						databases:
							databaseMode !== 'none' && databaseId
								? [{ databaseId, environmentPrefix: 'DATABASE' }]
								: [],
					environmentVariables: variables
							.filter((item) => item.key)
							.map(({ isSecret, key, scope, value }) => ({
								isSecret,
								key: key.trim().toUpperCase(),
								scope,
								value,
							})),
					}),
				},
			);
			toast.success('Application deployment queued.');
			onCreated(result.id);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Application deployment failed.',
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
							onChange={(event) => setDeploymentEnvironment(event.target.value as typeof deploymentEnvironment)}
							name="deploymentEnvironment"
							value={deploymentEnvironment}
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
							{(['public', 'github'] as const).map((mode) => (
								<button
									className={`rounded-xl border px-4 py-3 text-left font-bold ${sourceMode === mode ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
									key={mode}
									onClick={() => selectSourceMode(mode)}
									type="button"
								>
									{mode === 'public'
										? 'Public repository'
										: 'GitHub connection'}
								</button>
							))}
						</div>
						<Hint>
							Connect GitHub for private repositories or public repositories
							with restricted organisation access.
						</Hint>
					</fieldset>
					{sourceMode === 'github' && (
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
												onClick={() =>
													configureGithub(
														githubConnections.find(
															(item) => item.id === githubConnectionId,
														)?.reviewUrl,
													)
												}
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
									)?.providerSyncStatus !== 'ready' && (
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
									<div className="grid gap-2 font-semibold">
										<span>Permitted repository</span>
										<div className="flex items-stretch gap-2">
											<div className="min-w-0 flex-1">
												<SearchableSelect
											ariaLabel="Choose a permitted GitHub repository"
											emptyMessage="No permitted repositories found. Use the gear button to review access."
											onChange={(value) => {
												const selected = githubRepositories.find(
													(item) => item.url === value,
												);
												const defaultBranch = selected?.defaultBranch ?? 'main';
												setRepository(value);
												setBranch(defaultBranch);
												setAvailableBranches([defaultBranch]);
												setAnalysis(undefined);
												if (value)
													void inspectSource({
														repository: value,
														branch: defaultBranch,
													});
											}}
											options={githubRepositories.map((item) => ({
												keywords: `${item.fullName} ${item.isPrivate ? 'private' : 'public'}`,
												label: `${item.fullName}${item.isPrivate ? ' (private)' : ''}`,
												value: item.url,
											}))}
											placeholder="Select a repository"
											searchPlaceholder="Search permitted repositories"
											value={repository}
												/>
											</div>
											<button
												aria-label="Open selected GitHub repository in a new tab"
												className="grid size-12 shrink-0 place-items-center rounded-xl border border-brand-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
												disabled={!repository}
												onClick={() => {
													if (repository) window.open(repository, '_blank', 'noopener,noreferrer');
												}}
												title="Open selected repository"
												type="button"
											>
												<ExternalLink className="size-4" />
											</button>
										</div>
										<Hint>
											Only repositories explicitly approved in GitHub are listed
											here.
										</Hint>
									</div>
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
										{githubConnecting
											? 'Waiting for GitHub…'
											: 'Connect GitHub'}
									</button>
								</>
							)}
						</div>
					)}
					{sourceMode === 'public' && (
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
									)}{' '}
									Detect
								</button>
							</div>
							<Hint>
								Use the repository root URL. Detection reads manifests and
								environment templates but never reads real .env files.
							</Hint>
						</label>
					)}
					{repository.trim() && (
						<label className="grid gap-2 font-semibold">
							Branch
							<SearchableSelect
								allowCreate
								ariaLabel="Choose repository branch"
								emptyMessage="No matching branches found. Enter the exact branch name to add it."
								onChange={(value) => {
									setBranch(value);
									setAnalysis(undefined);
									if (sourceMode === 'github')
										void inspectSource({ repository, branch: value });
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
						</label>
					)}
					{analysis && analysis.candidates[selectedCandidateIndex] && (
						<div className="grid gap-3">
							{analysis.candidates.length > 1 && (
								<label className="grid gap-2 font-semibold">
									Detected application
									<SearchableSelect
										ariaLabel="Choose detected application"
										onChange={(value) => {
											const index = Number(value);
											const candidate = analysis.candidates[index];
											if (!candidate) return;
											setSelectedCandidateIndex(index);
											applyDetectedCandidate(candidate, analysis.environmentKeys);
										}}
										options={analysis.candidates.map((candidate, index) => ({
											label: `${frameworkDefinition(candidate.framework)?.label ?? STACKS.find(({ code }) => code === candidate.stack)?.label ?? candidate.stack} — ${candidate.projectDirectory === '/' ? 'Repository root' : candidate.projectDirectory}`,
											value: String(index),
										}))}
										placeholder="Choose detected application"
										searchPlaceholder="Search detected applications"
										value={String(selectedCandidateIndex)}
									/>
									<Hint>
										Multiple deployable applications were found. Choose the one this deployment should use.
									</Hint>
								</label>
							)}
							<DetectionSummary
								analysis={analysis}
								candidate={analysis.candidates[selectedCandidateIndex]}
							/>
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
									className={`rounded-2xl border p-4 text-left ${stack === item.code ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
									key={item.code}
									onClick={() => selectStack(item.code)}
									type="button"
								>
									<span
										className={`grid h-10 w-12 place-items-center rounded-xl text-sm font-black ${item.color}`}
									>
										<TechnologyLogo className="size-7" name={item.logo} />
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
									className={`rounded-xl border px-4 py-2 font-bold ${selectedRuntime?.code === runtime.code ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
									key={runtime.code}
								onClick={() => {
									setRuntimeCode(runtime.code);
									setApplicationPort(runtime.defaultPort);
								}}
									type="button"
								>
									{runtime.version}
									{runtime.isDefault ? ' · Recommended' : ''}
								</button>
							))}
						</div>
					</fieldset>
					<fieldset>
						<legend className="font-semibold">
							Framework{' '}
							<span className="font-normal text-app-muted">Optional</span>
						</legend>
						<Hint>
							Framework detection tunes directory and build suggestions. Select
							None whenever the suggestion does not match your application.
						</Hint>
						<div className="mt-3 flex flex-wrap gap-2">
							<button
								className={`rounded-xl border px-3 py-2 text-sm font-bold ${!framework ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
								onClick={() => setFramework('')}
								type="button"
							>
								None
							</button>
							{frameworksForLanguage(stack).map((item) => (
								<button
									className={`rounded-xl border px-3 py-2 text-sm font-bold ${framework === item.code ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
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
									? ` Persistent data: ${selectedFramework.persistentDirectories.join(', ')}.`
									: ''}
							</p>
						)}
					</fieldset>
					<label className="grid gap-2 font-semibold">
						Project directory
						<div className="flex gap-2">
							<input
								className={`${inputClass} min-w-0 flex-1`}
								onChange={(event) => setProjectDirectory(event.target.value)}
								onBlur={() => {
									const candidate = analysis?.candidates.find(
										(item) => item.projectDirectory === projectDirectory,
									);
									if (candidate && analysis)
										applyDetectedCandidate(candidate, analysis.environmentKeys);
								}}
								placeholder="/ or apps/api"
								required
								value={projectDirectory}
							/>
							<button
								className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 font-bold"
								disabled={!analysis}
								onClick={() => setDirectoryTarget('project')}
								type="button"
							>
								<FolderTree className="size-4" />
								Browse
							</button>
						</div>
						<Hint>
							The repository folder containing this application. It is detected
							from package.json, composer.json, or Python configuration when
							possible.
						</Hint>
					</label>
					{stack === 'static' && (
						<label className="grid gap-2 font-semibold">
							Output directory
							<div className="flex gap-2">
								<input
									className={`${inputClass} min-w-0 flex-1`}
									onChange={(event) => setOutputDirectory(event.target.value)}
									placeholder="dist"
									value={outputDirectory}
								/>
								<button
									className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 font-bold"
									disabled={!analysis}
									onClick={() => setDirectoryTarget('output')}
									type="button"
								>
									<FolderTree className="size-4" />
									Browse
								</button>
							</div>
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
							max="65535"
							min="1"
							name="port"
							onChange={(event) => setApplicationPort(Number(event.target.value))}
							required
							type="number"
							value={applicationPort}
						/>
						<Hint>
							The internal container port detected from the framework or stack.
							Other applications may safely use the same port because containers
							are isolated; Ghost Deploy does not publish it as a host port.
						</Hint>
					</label>
					<label className="flex items-start gap-3 rounded-xl border border-brand-primary/10 p-4">
						<input
							className="mt-1"
							defaultChecked={options.limits?.deployments?.autoEnabled === true}
							disabled={!options.limits?.deployments?.autoEnabled}
							name="autoDeployEnabled"
							type="checkbox"
						/>
						<span>
							<strong>Auto-deploy on push</strong>
							<Hint>
								{options.limits?.deployments?.autoEnabled
									? 'Deploy new commits pushed to the selected branch. You can disable this later in application settings.'
									: 'Automatic deployments are not included in this package. Manual deployment remains available.'}
							</Hint>
						</span>
					</label>
					<details className="rounded-xl border border-brand-primary/10 p-4">
						<summary className="cursor-pointer font-bold">
							Advanced build settings{' '}
							<ChevronDown className="ml-1 inline size-4" />
						</summary>
						<div className="mt-4 grid gap-4">
							<label className="grid gap-2 font-semibold">
								Build method
								<input
									className={`${inputClass} opacity-70`}
									disabled
									value={
										stack === 'static' ? 'Static site' : 'Automatic (Nixpacks)'
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
									onChange={(event) => setInstallCommand(event.target.value)}
									placeholder="Detected automatically"
									value={installCommand}
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
									onChange={(event) => setBuildCommand(event.target.value)}
									placeholder="Detected automatically"
									value={buildCommand}
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
									onChange={(event) => setStartCommand(event.target.value)}
									placeholder="Detected automatically"
									value={startCommand}
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
								-{databaseSuffix}.{options.applicationBaseDomain}
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
								Reuse an unattached root domain, or create a unique subdomain
								under any domain owned by this workspace.
							</Hint>
							<div className="mt-3 flex flex-wrap gap-2">
								{options.availableDomains
									.filter(({ rootAvailable }) => rootAvailable)
									.map((domain) => (
										<button
											className={`rounded-xl border px-3 py-2 text-sm font-bold ${customDomains.includes(domain.hostname) ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
											key={domain.id}
											onClick={() => addCustomDomain(domain.hostname)}
											type="button"
										>
											{domain.hostname}
										</button>
									))}
								{!options.availableDomains.some(
									({ rootAvailable }) => rootAvailable,
								) && (
									<span className="text-sm text-app-muted">
										No unused root domains.
									</span>
								)}
							</div>
							<div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
								<input
									className={inputClass}
									onChange={(event) =>
										setOwnedSubdomain(slug(event.target.value))
									}
									placeholder="Subdomain, e.g. api"
									value={ownedSubdomain}
								/>
								<select
									className={inputClass}
									onChange={(event) =>
										setSelectedOwnedDomain(event.target.value)
									}
									value={selectedOwnedDomain}
								>
									<option value="">Choose an owned domain</option>
									{options.availableDomains.map((domain) => (
										<option key={domain.id} value={domain.hostname}>
											{domain.hostname}
										</option>
									))}
								</select>
								<button
									className="rounded-xl border border-brand-primary/15 px-4 py-3 font-bold"
									disabled={!ownedSubdomain || !selectedOwnedDomain}
									onClick={() => {
										addCustomDomain(`${ownedSubdomain}.${selectedOwnedDomain}`);
										setOwnedSubdomain('');
									}}
									type="button"
								>
									Add Subdomain
								</button>
							</div>
						</div>
					)}
					<fieldset
						className={`rounded-xl border p-4 ${options.limits?.customDomains.allowed ? 'border-brand-primary/10' : 'border-amber-500/30 bg-amber-500/5'}`}
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
								onClick={() => setCustomDomains((current) => [...current, ''])}
								type="button"
							>
								<Plus className="size-4" />
							</button>
						</div>
						{!options.limits?.customDomains.allowed && (
							<p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
								Your package custom-domain limit has been reached (
								{options.limits?.customDomains.current} of{' '}
								{options.limits?.customDomains.limit ?? 'unlimited'} used).
							</p>
						)}
						<div className="mt-3 grid gap-2">
							{customDomains.map((domain, index) => {
								const check = domainChecks[index];
								return (
									<div className="grid gap-1" key={index}>
										<div className="flex gap-2">
											<input
												className={`${inputClass} min-w-0 flex-1`}
												onChange={(event) => {
													setCustomDomains((current) =>
														current.map((item, position) =>
															position === index ? event.target.value : item,
														),
													);
													setDomainChecks((current) => {
														const next = { ...current };
														delete next[index];
														return next;
													});
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
										</div>
										{check === 'checking' ? (
											<span className="flex items-center gap-2 text-xs text-app-muted">
												<LoaderCircle className="size-3 animate-spin" />
												Checking Availability...
											</span>
										) : check ? (
											<span
												className={`text-xs ${check.available ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}
											>
												{check.available
													? check.approvalRequired
														? check.reason
														: check.dnsReady
															? `Available · DNS visible: ${check.records.join(', ')}`
															: 'Available · DNS can be configured later'
													: check.reason}
											</span>
										) : null}
									</div>
								);
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
								['new', 'Create New'],
								['existing', 'Use Existing'],
								['none', 'No Database'],
							] as const
						).map(([code, label]) => (
							<button
								className={`rounded-xl border p-3 text-sm font-bold ${databaseMode === code ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
								key={code}
								disabled={
									code === 'new' && options.limits?.databases.allowed === false
								}
								onClick={() => {
									setDatabaseMode(code);
									if (code === 'new' && combinedDatabaseName)
										setDatabaseNameAvailability('checking');
								}}
								type="button"
							>
								{label}
							</button>
						))}
					</div>
					{options.limits?.databases.allowed === false && (
						<p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
							Database limit reached ({options.limits.databases.current} of{' '}
							{options.limits.databases.limit ?? 'unlimited'} used). Select an
							existing database or continue without one.
						</p>
					)}
					{databaseMode === 'new' && (
						<>
							<fieldset>
								<legend className="font-semibold">Database engine</legend>
								<Hint>
									Choose the engine required by your framework. Ghost Deploy
									generates restricted credentials and injects them securely.
								</Hint>
								<div className="mt-3 grid grid-cols-2 gap-3">
									<button
										className={`rounded-2xl border p-4 text-left ${databaseEngine === 'postgresql' ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
										onClick={() => setDatabaseEngine('postgresql')}
										disabled={
											selectedFramework !== undefined &&
											!selectedFramework.databaseEngines.includes('postgresql')
										}
										type="button"
									>
										<span className="grid size-11 place-items-center rounded-xl bg-blue-500/15 text-blue-700 dark:text-blue-300">
											<TechnologyLogo className="size-7" name="postgresql" />
										</span>
										<strong className="mt-3 block">PostgreSQL</strong>
										<span className="text-xs text-app-muted">
											Recommended default
										</span>
									</button>
									<button
										className={`rounded-2xl border p-4 text-left ${databaseEngine === 'mysql' ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`}
										onClick={() => setDatabaseEngine('mysql')}
										disabled={
											selectedFramework !== undefined &&
											!selectedFramework.databaseEngines.includes('mysql')
										}
										type="button"
									>
										<span className="grid size-11 place-items-center rounded-xl bg-orange-500/15 text-orange-700 dark:text-orange-300">
											<TechnologyLogo className="size-7" name="mysql" />
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
								<div className="flex items-stretch overflow-hidden rounded-xl border border-brand-primary/15 bg-white focus-within:border-brand-action dark:bg-gray-800">
									<input
										className="min-w-0 flex-1 bg-transparent px-4 py-3 text-gray-900 outline-none dark:text-gray-100"
										maxLength={56}
										name="newDatabaseNamePrefix"
										onChange={(event) => {
											setDatabaseNameEdited(true);
											const prefix = databaseIdentifier(event.target.value);
											setDatabaseNamePrefix(prefix);
											setDatabaseNameAvailability(prefix ? 'checking' : 'idle');
										}}
										pattern="[a-z0-9]+(?:_[a-z0-9]+)*"
										placeholder="customer_api"
										required
										value={databaseNamePrefix}
									/>
									<span className="flex select-none items-center border-l border-brand-primary/10 bg-app-canvas px-3 font-mono text-xs font-bold text-app-muted">
										_{databaseSuffix}
									</span>
								</div>
								{combinedDatabaseName && (
									<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
										<div className="flex min-w-0 items-center gap-2">
											<span className="text-app-muted">Combined name:</span>
											<code
												className="select-all truncate font-semibold"
												title={combinedDatabaseName}
											>
												{combinedDatabaseName}
											</code>
											<button
												aria-label="Copy combined database name"
												className="rounded-md p-1 text-app-muted transition hover:bg-brand-primary/5 hover:text-app-text"
												onClick={() => {
													void navigator.clipboard.writeText(
														combinedDatabaseName,
													);
													toast.success('Database name copied.');
												}}
												title="Copy database name"
												type="button"
											>
												<Copy className="size-3.5" />
											</button>
										</div>
										<span
											className={
												databaseNameAvailability === 'available'
													? 'font-semibold text-emerald-700 dark:text-emerald-300'
													: databaseNameAvailability === 'unavailable' ||
														  databaseNameAvailability === 'error'
														? 'font-semibold text-red-600 dark:text-red-300'
														: 'text-app-muted'
											}
										>
											{databaseNameAvailability === 'available'
												? 'Database name available'
												: databaseNameAvailability === 'unavailable'
													? 'Database name already used'
													: databaseNameAvailability === 'error'
														? 'Unable to verify database name'
														: 'Checking database name…'}
										</span>
									</div>
								)}
							</label>
							<fieldset className="grid gap-3">
								<legend className="font-semibold">Database user</legend>
								<Hint>Use a new restricted login or grant this database to an existing workspace login. Existing-user passwords are never changed.</Hint>
								<div className="grid grid-cols-2 gap-3">
									<button className={`rounded-xl border p-3 text-sm font-bold ${databaseUserMode === 'new' ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`} onClick={() => setDatabaseUserMode('new')} type="button">Create New User</button>
									<button className={`rounded-xl border p-3 text-sm font-bold ${databaseUserMode === 'existing' ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`} disabled={!databaseUsers.length} onClick={() => setDatabaseUserMode('existing')} type="button">Use Existing User</button>
								</div>
								{databaseUserMode === 'new' ? (
									<div className="grid gap-4">
										<label className="grid gap-2 font-semibold">
											Database username
											<input className={inputClass} maxLength={63} onChange={(event) => { setDatabaseUsernameEdited(true); setDatabaseUsername(databaseIdentifier(event.target.value).slice(0, 63)); }} pattern="[a-z0-9]+(?:_[a-z0-9]+)*" required value={effectiveDatabaseUsername} />
											<Hint>This restricted user owns the new database.</Hint>
										</label>
										<label className="grid gap-2 font-semibold">
											Database password
											<div className="flex gap-2">
												<input autoComplete="new-password" className={`${inputClass} min-w-0 flex-1 font-mono`} maxLength={256} minLength={16} onChange={(event) => setDatabasePassword(event.target.value)} required type="text" value={databasePassword} />
												<button aria-label="Regenerate database password" className="rounded-xl border border-brand-primary/15 px-4 transition hover:bg-brand-primary/5" onClick={() => setDatabasePassword(generateDatabasePassword())} title="Regenerate password" type="button"><RefreshCw className="size-4" /></button>
												<button aria-label="Copy database password" className="rounded-xl border border-brand-primary/15 px-4 transition hover:bg-brand-primary/5" onClick={() => void copyConfigurationValue(databasePassword, 'Database password')} title="Copy password" type="button"><Copy className="size-4" /></button>
											</div>
											<Hint>Generated automatically. Edit or regenerate it before deployment, then store it securely.</Hint>
										</label>
									</div>
								) : (
									<label className="grid gap-2 font-semibold">Existing workspace user<SearchableSelect ariaLabel="Choose an existing database user" onChange={setExistingDatabaseUserId} options={databaseUsers.map((user) => ({ label: `${user.username} · ${user.databaseCount} database${user.databaseCount === 1 ? '' : 's'}`, value: user.id, keywords: `${user.username} ${user.engine}` }))} placeholder="Choose a database user" searchable value={existingDatabaseUserId} /><Hint>This user's current password is reused without being revealed, regenerated, or changed.</Hint></label>
								)}
							</fieldset>
						</>
					)}
					{databaseMode === 'existing' && (
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
					action={
						<button
							aria-label="Edit environment variables"
							className="rounded-lg border border-brand-primary/15 p-2 transition hover:bg-brand-primary/5"
							onClick={() => setEnvironmentEditorOpen(true)}
							title="Edit environment variables"
							type="button"
						>
							<Pencil className="size-4" />
						</button>
					}
					description="Repository templates generate keys only. Secret values are encrypted and never returned in plain text after saving."
					icon={Braces}
					title="Environment variables"
				>
					<div className="max-h-64 overflow-auto rounded-xl border border-brand-primary/10">
						<table className="w-full min-w-[34rem] table-fixed text-left text-xs">
							<thead className="sticky top-0 bg-app-canvas text-[0.68rem] font-bold uppercase tracking-wide text-app-muted">
								<tr>
									<th className="w-[34%] px-3 py-2">Key</th>
									<th className="w-[36%] px-3 py-2">Value</th>
									<th className="w-[18%] px-3 py-2">Scope</th>
									<th className="w-[12%] px-3 py-2">Type</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-brand-primary/10">
								{variables.map((variable, index) => (
									<tr key={`${variable.key}-${index}`}>
										<td
											className="truncate px-3 py-2 font-mono font-semibold"
											title={variable.key}
										>
											{variable.key || 'Untitled variable'}
										</td>
										<td
											className="truncate px-3 py-2 font-mono text-app-muted"
											title={
												variable.isSecret
													? 'Secret value is masked'
													: variable.value
											}
										>
											{variable.value
												? variable.isSecret
													? '••••••••'
													: variable.value
												: 'Not set'}
										</td>
										<td className="px-3 py-2 capitalize text-app-muted">
											{variable.scope === 'both'
												? 'Build + runtime'
												: variable.scope}
										</td>
										<td className="px-3 py-2 text-app-muted">
										{variable.required
											? variable.isSecret
												? 'Required secret'
												: 'Required'
											: variable.isSecret
												? 'Secret'
												: 'Plain'}
										</td>
									</tr>
								))}
								{!variables.length && (
									<tr>
										<td
											className="px-3 py-6 text-center text-app-muted"
											colSpan={4}
										>
											No environment variables configured.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					<Hint>
						Use the edit button to manage values. Database connection variables
						are injected separately and override conflicting manual keys.
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
								{STACKS.find((item) => item.code === stack)?.label}{' '}
								{selectedRuntime?.version ?? '—'}
							</dd>
						</div>
						<div>
							<dt className="text-app-muted">Framework</dt>
							<dd className="font-bold">
								{frameworkDefinition(framework)?.label ?? 'None'}
							</dd>
						</div>
						<div>
							<dt className="text-app-muted">Environment</dt>
							<dd className="font-bold">Selected above</dd>
						</div>
						<div>
							<dt className="text-app-muted">Database</dt>
							<dd className="font-bold capitalize">
								{databaseMode === 'new' ? databaseEngine : databaseMode}
							</dd>
						</div>
					</dl>
				</Section>
			</div>
			{environmentEditorOpen && (
				<Offcanvas
					layer="nested"
					onClose={() => setEnvironmentEditorOpen(false)}
					scrollable={false}
					title="Environment configuration"
					width="full"
				>
					<div className="grid h-full min-h-0 gap-5 lg:grid-cols-2">
						<section className="min-h-0 overflow-y-auto pr-1 lg:pr-3">
							<div className="grid gap-4 pb-10">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<p className="max-w-xl text-sm leading-6 text-app-muted">
								Use uppercase keys. Secret values are encrypted when the
								application is saved.
							</p>
							<button
								className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-2.5 text-sm font-bold"
								onClick={() => setEnvironmentImportOpen((current) => !current)}
								type="button"
							>
								<FileUp className="size-4" /> Import .env
							</button>
						</div>
						{environmentImportOpen && (
							<section className="grid gap-4 rounded-2xl border border-brand-action/30 bg-brand-action/[0.04] p-4">
								<div>
									<h3 className="font-bold">Import environment values</h3>
									<p className="mt-1 text-xs leading-5 text-app-muted">
										Paste or select a dotenv file. Parsing happens only in this
										browser.
									</p>
								</div>
								<textarea
									aria-label="Environment file contents"
									className={`${inputClass} min-h-48 resize-y font-mono text-xs leading-5`}
									onChange={(event) =>
										setEnvironmentImportSource(event.target.value)
									}
									maxLength={1_048_576}
									placeholder={
										'APP_NAME=Ghost Deploy\nDATABASE_URL=postgresql://...\nAPI_TOKEN=...'
									}
									spellCheck={false}
									value={environmentImportSource}
								/>
								<label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-primary/25 px-4 py-3 text-sm font-bold transition hover:bg-brand-primary/5">
									<FileUp className="size-4" /> Choose .env file
									<input
										accept=".env,.txt,text/plain"
										className="sr-only"
										onChange={(event) => {
											void readEnvironmentFile(event.target.files?.[0]);
											event.target.value = '';
										}}
										type="file"
									/>
								</label>
								<label className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-sm">
									<input
										checked={clearEnvironmentBeforeImport}
										className="mt-1"
										onChange={(event) =>
											setClearEnvironmentBeforeImport(event.target.checked)
										}
										type="checkbox"
									/>
									<span>
										<strong className="block">
											Clear existing variables before import
										</strong>
										<span className="mt-1 block text-xs leading-5 text-app-muted">
											Off by default. Leave this disabled to update matching
											keys, preserve other existing variables, and add new keys.
										</span>
									</span>
								</label>
								{!!environmentImportSource.trim() && (
									<>
										<dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
											{[
												['Updated', environmentImportPreview.updated],
												['Added', environmentImportPreview.added],
												['Unchanged', environmentImportPreview.unchanged],
												['Removed', environmentImportPreview.removed],
											].map(([label, count]) => (
												<div
													className="rounded-xl bg-app-surface px-3 py-2"
													key={label}
												>
													<dt className="text-app-muted">{label}</dt>
													<dd className="mt-1 text-lg font-black">{count}</dd>
												</div>
											))}
										</dl>
										{!!parsedEnvironmentImport.duplicateKeys.length && (
											<p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
												Duplicate keys use their final value:{' '}
												{parsedEnvironmentImport.duplicateKeys.join(', ')}
											</p>
										)}
										{!!parsedEnvironmentImport.invalidLines.length && (
											<div className="max-h-28 overflow-y-auto rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
												{parsedEnvironmentImport.invalidLines.map((issue) => (
													<p key={`${issue.line}-${issue.reason}`}>
														Line {issue.line}: {issue.reason}
													</p>
												))}
											</div>
										)}
										{environmentImportPreview.total > 200 && (
											<p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
												This import would create{' '}
												{environmentImportPreview.total} variables. A deployment
												can contain at most 200.
											</p>
										)}
									</>
								)}
								<div className="flex flex-wrap justify-end gap-2">
									<button
										className="rounded-xl border border-brand-primary/15 px-4 py-2.5 text-sm font-bold"
										onClick={() => {
											setEnvironmentImportOpen(false);
											setEnvironmentImportSource('');
											setClearEnvironmentBeforeImport(false);
										}}
										type="button"
									>
										Cancel
									</button>
									<button
										className="rounded-xl bg-brand-action px-4 py-2.5 text-sm font-bold text-brand-ink disabled:opacity-50"
										disabled={
											!parsedEnvironmentImport.entries.length ||
											environmentImportPreview.total > 200
										}
										onClick={applyEnvironmentImport}
										type="button"
									>
										Apply Import
									</button>
								</div>
							</section>
						)}
						{variables.map((variable, index) => (
							<div
								className="grid gap-3 rounded-2xl border border-brand-primary/10 p-4"
								key={`${variable.key}-${index}`}
							>
								<div className="flex items-start gap-3">
									<input
										aria-label="Variable key"
										className={`${inputClass} min-w-0 flex-1 font-mono`}
										onChange={(event) =>
											updateVariable(index, {
												key: event.target.value.toUpperCase(),
											})
										}
										placeholder="VARIABLE_NAME"
										value={variable.key}
									/>
									<button
										aria-label="Remove variable"
										className="rounded-xl border border-red-500/20 p-3 text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300"
										disabled={variable.required}
										onClick={() =>
											setVariables((current) =>
												current.filter((_, position) => position !== index),
											)
										}
										type="button"
										title={
											variable.required
												? 'Required variables cannot be removed.'
												: 'Remove variable'
										}
									>
										<Trash2 className="size-4" />
									</button>
								</div>
								<input
									aria-label={`Value for ${variable.key || 'variable'}`}
									className={`${inputClass} font-mono`}
									onChange={(event) =>
										updateVariable(index, { value: event.target.value })
									}
									placeholder={variable.isSecret ? 'Secret value' : 'Value'}
									type={variable.isSecret ? 'password' : 'text'}
									value={variable.value}
								/>
								<div className="grid gap-3 sm:grid-cols-2">
									<label className="flex items-center gap-2 rounded-xl border border-brand-primary/10 px-3 py-2 text-sm">
										<input
											checked={variable.isSecret}
											onChange={(event) =>
												updateVariable(index, {
													isSecret: event.target.checked,
												})
											}
											type="checkbox"
										/>
										Treat as secret
									</label>
									<label className="grid gap-1 text-xs font-semibold">
										Available during
										<select
											className="rounded-xl border border-brand-primary/15 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
											onChange={(event) =>
												updateVariable(index, {
													scope: event.target
														.value as EnvironmentVariable['scope'],
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
							</div>
						))}
						<button
							className="inline-flex w-fit items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-2.5 text-sm font-bold"
							onClick={() =>
								setVariables((current) => [
									...current,
									{
										key: '',
										value: '',
										isSecret: true,
										required: false,
										scope: 'runtime',
									},
								])
							}
							type="button"
						>
							<Plus className="size-4" /> Add Variable
						</button>
								<button
							className="rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink"
							onClick={() => setEnvironmentEditorOpen(false)}
							type="button"
						>
							Done
						</button>
							</div>
						</section>
						<aside className="min-h-0 overflow-y-auto rounded-3xl border border-brand-primary/10 bg-app-canvas p-4 sm:p-6">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<h3 className="text-xl font-black">Application configuration</h3>
									<p className="mt-1 text-sm leading-6 text-app-muted">Live preview of values that may help configure this application's environment.</p>
								</div>
								<button className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-bold disabled:opacity-50" disabled={!environmentPreview} onClick={() => void copyConfigurationValue(environmentPreview, '.env block')} type="button"><Copy className="size-4" /> Copy .env</button>
							</div>
							<dl className="mt-5 grid gap-3">
								{configurationValues.map(({ label, value, secret }) => (
									<div className="rounded-2xl border border-brand-primary/10 bg-app-surface p-4" key={label}>
										<dt className="text-xs font-bold uppercase tracking-wide text-app-muted">{label}</dt>
										<dd className="mt-2 flex items-start justify-between gap-3">
											<code className="min-w-0 break-all text-sm">{value}</code>
											<button aria-label={`Copy ${label}`} className="shrink-0 rounded-lg border border-brand-primary/15 p-2 transition hover:bg-brand-primary/5" onClick={() => void copyConfigurationValue(value, label)} title={`Copy ${label}`} type="button"><Copy className="size-3.5" /></button>
										</dd>
										{secret && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Sensitive value. Store it securely.</p>}
									</div>
								))}
							</dl>
							<section className="mt-5 rounded-2xl border border-brand-primary/10 bg-app-surface p-4">
								<div className="flex items-center justify-between gap-3"><h4 className="font-bold">Current .env values</h4><button aria-label="Copy environment values" className="rounded-lg border border-brand-primary/15 p-2 disabled:opacity-50" disabled={!environmentPreview} onClick={() => void copyConfigurationValue(environmentPreview, '.env block')} type="button"><Copy className="size-4" /></button></div>
								<pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{environmentPreview || '# No environment variables configured yet.'}</pre>
							</section>
						</aside>
					</div>
				</Offcanvas>
			)}
			{directoryTarget && analysis && (
				<Offcanvas
					layer="nested"
					onClose={() => setDirectoryTarget(null)}
					title={`Choose ${directoryTarget === 'project' ? 'project' : 'output'} directory`}
					width="md"
				>
					<RepositoryDirectoryBrowser
						directories={analysis.directories}
						initialDirectory={
							directoryTarget === 'project'
								? projectDirectory
								: outputDirectory || '/'
						}
						onSelect={(directory) => {
							if (directoryTarget === 'project') {
								const candidate = analysis.candidates.find(
									(item) => item.projectDirectory === directory,
								);
								if (candidate)
									applyDetectedCandidate(candidate, analysis.environmentKeys);
								else setProjectDirectory(directory);
							} else setOutputDirectory(directory === '/' ? '' : directory);
							setDirectoryTarget(null);
						}}
					/>
				</Offcanvas>
			)}
			<div className="fixed bottom-0 left-0 right-0 z-10 flex justify-end border-t border-brand-primary/10 bg-app-surface/95 px-5 py-4 backdrop-blur lg:left-[var(--app-sidebar-width,16rem)]">
				<button
					className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-6 py-3 font-black text-brand-ink disabled:opacity-60"
					disabled={submitting}
				>
					{submitting ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<ServerCog className="size-4" />
					)}{' '}
					Deploy Application
				</button>
			</div>
		</form>
	);
}
