import {
	CheckCircle2,
	Database,
	ExternalLink,
	FileCode2,
	GitBranch,
	Globe2,
	LoaderCircle,
	MoreVertical,
	Play,
	Plus,
	RefreshCw,
	Square,
	Trash2,
	X,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
	Link,
	useLocation,
	useNavigate,
	useOutletContext,
	useParams,
} from 'react-router';
import { toast } from 'sonner';

import { Offcanvas } from '@components/ui/offcanvas';
import { DeployApplicationForm } from '@root/app/components/applications/deploy-application-form';
import { ApplicationCronJobs } from '@root/app/components/applications/application-cron-jobs';
import { ApplicationSettingsForm } from '@root/app/components/applications/application-settings-form';
import { RepositoryDirectoryBrowser } from '@root/app/components/applications/repository-directory-browser';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';
import { openCreatedApplication } from '@root/app/utils/applicationNavigation';

interface ApplicationDomain {
	hostname: string;
	id: string;
	isEnabled: boolean;
	isPrimary: boolean;
	status: string;
	tlsStatus: string;
	type: 'custom' | 'platform';
}
interface ApplicationDatabase {
	databaseId: string;
	databaseName: string;
	environmentPrefix: string;
}
interface Application {
	applicationPort: number;
	autoDeployEnabled: boolean;
	baseDirectory: string;
	buildCommand?: string | null;
	buildPack: string;
	createdAt: string;
	databases: ApplicationDatabase[];
	domains: ApplicationDomain[];
	failureReason?: string | null;
	githubConnectionId?: string | null;
	id: string;
	installCommand?: string | null;
	latestDeployment?: {
		completedAt?: string | null;
		createdAt: string;
		status: string;
	};
	name: string;
	operationalStatus: string;
	publicUrl?: string | null;
	publishDirectory?: string | null;
	resourceStatus?: string | null;
	runtimeCode: string;
	runtimeLanguage: string;
	runtimeVersion: string;
	sourceRef: string;
	sourceRepository: string;
	startCommand?: string | null;
	status: string;
	visibility: 'private' | 'public';
}
interface DeploymentHistory {
	items: Array<{
		compatibilityFixes?: Array<{
			confidence: number;
			from: string;
			path: string;
			to: 'utf-8';
		}>;
		commitMessage?: string | null;
		commitSha?: string | null;
		createdAt?: string | null;
		finishedAt?: string | null;
		id: string;
		diagnostic?: {
			code: string;
			detail?: string;
			developerActionRequired: boolean;
			explanation: string;
			location?: string;
			owner: 'configuration' | 'platform' | 'project' | 'runtime' | 'unknown';
			phase: 'build' | 'deployment' | 'runtime';
			suggestion: string;
			title: string;
		} | null;
		logSections?: { build: string; deployment: string; raw: string };
		logs?: string | null;
		status: string;
		trigger?: string;
	}>;
	limit: number | null;
	retentionDays: number | null;
	totalRetained: number;
	logsPermissionRequired?: boolean;
	logsUnavailable?: boolean;
}
interface Options {
	applicationBaseDomain?: string;
	applicationDomainReady?: boolean;
	availableDomains?: Array<{
		attachedHostnames: string[];
		hostname: string;
		id: string;
		rootAvailable: boolean;
		status: string;
	}>;
	databases: Array<{ databaseName: string; id: string }>;
	limits?: {
		customDomains: { allowed: boolean; current: number; limit: number | null };
		databases: { allowed: boolean; current: number; limit: number | null };
		deployments?: { autoEnabled: boolean; manualEnabled: boolean };
	};
	runtimes: Array<{
		code: string;
		defaultPort: number;
		isDefault: boolean;
		language: 'node' | 'php' | 'python' | 'static';
		version: string;
	}>;
	suggestedDomainSuffix?: string;
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

/** Send an authenticated application request and unwrap its response. */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = (await response.json()) as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined)
		throw new Error(body.message);
	return body.data;
}
const inputClass =
	'rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100';

/** Converts provider state tokens into concise customer-facing labels. */
function statusLabel(value?: string | null): string {
	return (value || 'unknown')
		.split(':')
		.map((part) =>
			part
				.replace(/[_-]+/g, ' ')
				.replace(/\b\w/g, (letter) => letter.toUpperCase()),
		)
		.join(' · ');
}

/** Applies one consistent semantic colour system to application and deployment states. */
function statusClass(value?: string | null): string {
	const status = (value ?? '').toLowerCase();
	if (/failed|unhealthy|error|cancel/.test(status))
		return 'bg-red-500/10 text-red-700 dark:text-red-300';
	if (/running|succeed|finished|healthy/.test(status))
		return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
	if (/building|starting|progress/.test(status))
		return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
	if (/suspend|deactivat/.test(status))
		return 'bg-orange-500/10 text-orange-700 dark:text-orange-300';
	if (/queued|provision|pending/.test(status))
		return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
	return 'bg-gray-500/10 text-gray-700 dark:text-gray-300';
}

/** Replaces the technical root path with a customer-facing directory label. */
function projectDirectoryLabel(value: string): string {
	return value === '/' ? 'Repository root' : value;
}

interface RealtimeEvent {
	applicationId: string;
	deploymentStatus?: string;
	logsAvailable?: boolean;
	providerStatus?: string;
	type: string;
}

/** Parses an authenticated SSE response without placing bearer tokens in the URL. */
async function consumeEventStream(
	response: Response,
	signal: AbortSignal,
	listener: (event: RealtimeEvent) => void,
): Promise<void> {
	if (!response.ok || !response.body)
		throw new Error('Live application updates are unavailable.');
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	while (!signal.aborted) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let boundary = buffer.indexOf('\n\n');
		while (boundary >= 0) {
			const block = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			const data = block
				.split('\n')
				.find((line) => line.startsWith('data: '))
				?.slice(6);
			if (data) listener(JSON.parse(data) as RealtimeEvent);
			boundary = buffer.indexOf('\n\n');
		}
	}
}

type ApplicationLogChannel = 'activity' | 'build' | 'deployment' | 'runtime';

/** Presents provider output as distinct customer build, platform deployment and runtime channels. */
function ApplicationLogChannels({
	channel,
	history,
	onChannelChange,
	onRefresh,
	runtimeLogs,
	status,
}: {
	channel: ApplicationLogChannel;
	history: DeploymentHistory | null;
	onChannelChange: (channel: ApplicationLogChannel) => void;
	onRefresh: () => void;
	runtimeLogs: string;
	status: string;
}) {
	const latest = history?.items[0];
	const diagnostic = latest?.diagnostic;
	const channelLogs =
		channel === 'build'
			? latest?.logSections?.build
			: channel === 'deployment'
				? latest?.logSections?.deployment
				: runtimeLogs;
	const running = /queued|pending|provision|deploying|building|starting|progress/i.test(`${status} ${latest?.status ?? ''}`);
	const logArea = useRef<HTMLPreElement>(null);
	useEffect(() => {
		const frame = window.requestAnimationFrame(() => {
			if (logArea.current) logArea.current.scrollTop = logArea.current.scrollHeight;
		});
		return () => window.cancelAnimationFrame(frame);
	}, [channel, channelLogs, running]);
	const ownerLabel =
		diagnostic?.owner === 'project'
			? 'Your project needs a change'
			: diagnostic?.owner === 'platform'
				? 'Ghost Deploy platform issue'
				: diagnostic?.owner === 'runtime'
					? 'Application runtime issue'
					: 'Deployment configuration issue';
	return (
		<div className="grid gap-4">
			<nav aria-label="Application log channels" className="flex gap-1 overflow-x-auto border-b border-brand-primary/10">
				{([
					['build', 'Build Logs'],
					['deployment', 'Deployment Logs'],
					['runtime', 'Runtime Logs'],
					['activity', 'Activity'],
				] as const).map(([value, label]) => (
					<button
						className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold ${channel === value ? 'border-brand-action text-app-foreground' : 'border-transparent text-app-muted hover:text-app-foreground'}`}
						key={value}
						onClick={() => onChannelChange(value)}
						type="button"
					>
						{label}
					</button>
				))}
			</nav>
			{diagnostic && diagnostic.phase === channel && (
				<div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-700 dark:text-red-200">
					<p className="text-xs font-black uppercase tracking-wide">{ownerLabel}</p>
					<h3 className="mt-1 text-xl font-black">{diagnostic.title}</h3>
					<p className="mt-2 text-sm">{diagnostic.explanation}</p>
					{diagnostic.location && (
						<code className="mt-3 block rounded-lg bg-black/15 px-3 py-2 text-xs font-bold">{diagnostic.location}</code>
					)}
					{diagnostic.detail && <p className="mt-2 font-mono text-sm">{diagnostic.detail}</p>}
					<p className="mt-3 text-sm font-semibold">Next: {diagnostic.suggestion}</p>
				</div>
			)}
			{channel === 'activity' ? (
				<div className="grid gap-3">
					{history?.items.map((deployment) => (
						<div className="flex flex-col justify-between gap-2 rounded-xl border border-brand-primary/10 p-4 sm:flex-row sm:items-center" key={deployment.id}>
							<div>
								<strong className={`rounded-full px-2.5 py-1 text-xs ${statusClass(deployment.status)}`}>{statusLabel(deployment.status)}</strong>
								<p className="mt-2 text-sm">{deployment.commitMessage || 'Deployment requested'}</p>
							</div>
							<small className="text-app-muted">{deployment.trigger ?? 'manual'} · {deployment.createdAt ? new Date(deployment.createdAt).toLocaleString('en-IN') : 'Time unavailable'}</small>
						</div>
					))}
					{!history?.items.length && <p className="rounded-xl border border-dashed border-brand-primary/15 p-5 text-sm text-app-muted">No deployment activity yet.</p>}
				</div>
			) : (
				<>
					<div className="flex items-center justify-between gap-3">
						<p className="text-sm text-app-muted">
							{channel === 'build'
								? 'Repository checkout, dependency installation, compilation and type checking.'
								: channel === 'deployment'
									? 'Image release, container replacement, networking and health checks.'
									: 'Live stdout and stderr from the running application.'}
						</p>
						<button className="rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={onRefresh} type="button">Refresh</button>
					</div>
					{running && <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"><LoaderCircle className="size-4 animate-spin" />Deployment is active. Logs are still arriving.</div>}
					<pre className="min-h-72 max-h-[65vh] overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-gray-950 p-5 text-xs text-gray-100" ref={logArea}>
						{channelLogs || (running ? `Waiting for ${channel} logs…` : `No ${channel} logs are available.`)}
					</pre>
				</>
			)}
		</div>
	);
}

export default function CustomerApplicationsPage() {
	const { active } = useOutletContext<{ active?: { publicId: number } }>();
	const { applicationId } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const creating = location.pathname.endsWith('/create');
	const editing = Boolean(
		applicationId &&
		new URLSearchParams(location.search).get('mode') === 'edit',
	);
	const activeTab =
		new URLSearchParams(location.search).get('tab') ??
		(editing ? 'edit' : 'overview');
	const [rows, setRows] = useState<Application[]>([]);
	const [options, setOptions] = useState<Options>({
		databases: [],
		runtimes: [],
	});
	const [optionsLoading, setOptionsLoading] = useState(false);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string>();
	const [submitting, setSubmitting] = useState(false);
	const [logs, setLogs] = useState('');
	const [logChannel, setLogChannel] = useState<ApplicationLogChannel>('build');
	const [history, setHistory] = useState<DeploymentHistory | null>(null);
	const [actionPending, setActionPending] = useState(false);
	const [actionsOpen, setActionsOpen] = useState(false);
	const [deleteName, setDeleteName] = useState('');
	const [deleteDatabaseIds, setDeleteDatabaseIds] = useState<string[]>([]);
	const [deleteDatabaseNames, setDeleteDatabaseNames] = useState<
		Record<string, string>
	>({});
	const [editDirectories, setEditDirectories] = useState<string[]>([]);
	const [editDirectoryTarget, setEditDirectoryTarget] = useState<
		'base' | 'publish' | null
	>(null);
	const [editBaseDirectory, setEditBaseDirectory] = useState<string>();
	const [editPublishDirectory, setEditPublishDirectory] = useState<string>();
	const [customDomains, setCustomDomains] = useState<string[]>(['']);
	const [domainChecks, setDomainChecks] = useState<
		Record<number, DomainCheck | 'checking'>
	>({});
	const record = rows.find(({ id }) => id === applicationId);
	useEffect(() => {
		if (!record) return;
		setEditBaseDirectory(record.baseDirectory);
		setEditPublishDirectory(record.publishDirectory ?? '');
	}, [record]);
	const load = useCallback(async () => {
		if (!active) return;
		setLoading(true);
		setLoadError(undefined);
		try {
			setRows(
				await api<Application[]>(
					`/api/v1/workspaces/${active.publicId}/applications`,
				),
			);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Unable to load applications.');
			toast.error(
				error instanceof Error ? error.message : 'Unable to load applications.',
			);
		} finally {
			setLoading(false);
		}
	}, [active]);
	useEffect(() => {
		const timeout = window.setTimeout(() => void load(), 0);
		return () => window.clearTimeout(timeout);
	}, [load]);
	useEffect(() => {
		if ((!creating && !editing) || !active) return;
		setOptionsLoading(true);
		void api<Options>(
			`/api/v1/workspaces/${active.publicId}/applications/options`,
		)
			.then(setOptions)
			.catch((error) =>
				toast.error(
					error instanceof Error
						? error.message
						: 'Unable to load deployment options.',
				),
			)
			.finally(() => setOptionsLoading(false));
	}, [active, creating, editing]);
	useEffect(() => {
		if (
			!active ||
			!applicationId ||
			!['deployments', 'logs'].includes(activeTab)
		)
			return;
		setHistory(null);
		void api<DeploymentHistory>(
			`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/deployments`,
		)
			.then(setHistory)
			.catch((error) =>
				toast.error(
					error instanceof Error
						? error.message
						: 'Deployment history unavailable.',
				),
			);
	}, [active, activeTab, applicationId]);
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const connected = params.get('github') === 'connected';
		const existing = params.get('github') === 'existing';
		const connectionId = params.get('connection_id');
		const error = params.get('github_error');
		if (!connected && !existing && !error) return;
		if (window.opener && !window.opener.closed) {
			window.opener.postMessage(
				{
					type: connected
						? 'ghostdeploy:github-connected'
						: existing
							? 'ghostdeploy:github-existing'
							: 'ghostdeploy:github-error',
					connectionId,
					message: error,
				},
				window.location.origin,
			);
			if (connected || error) window.close();
			if (existing) toast.info('That GitHub account is already connected to this workspace. Choose a different account or installation.');
			return;
		}
		if (connected) toast.success('GitHub connected to this workspace.');
		if (existing) toast.info('That GitHub account is already connected to this workspace.');
		if (error) toast.error(error);
		navigate('/dashboard/applications/create', { replace: true });
	}, [location.search, navigate]);
	useEffect(() => {
		if (!active) return;
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
				void api<DomainCheck>(`/api/v1/workspaces/${active.publicId}/domains`, {
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
									error instanceof Error ? error.message : 'DNS check failed.',
							},
						})),
					);
			}, 600),
		);
		return () => timers.forEach((timer) => window.clearTimeout(timer));
	}, [active, customDomains]);

	/** Create or update an application from the active offcanvas form. */
	async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		if (!active) return;
		setSubmitting(true);
		const form = new FormData(event.currentTarget);
		const runtime = options.runtimes.find(
			({ code }) => code === form.get('runtimeCode'),
		);
		const databaseId = String(form.get('databaseId') ?? '');
		const common = {
			branch: form.get('branch'),
			installCommand: form.get('installCommand') || undefined,
			buildCommand: form.get('buildCommand') || undefined,
			startCommand: form.get('startCommand') || undefined,
			baseDirectory: form.get('baseDirectory'),
			publishDirectory: form.get('publishDirectory') || undefined,
			...(!editing ? { port: Number(runtime?.defaultPort ?? 3000) } : {}),
			...(editing
				? {
						name: form.get('name'),
						autoDeployEnabled: form.get('autoDeployEnabled') === 'on',
						visibility: form.get('visibility'),
					}
				: {}),
		};
		try {
			if (editing && applicationId)
				await api(
					`/api/v1/workspaces/${active.publicId}/applications/${applicationId}`,
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(common),
					},
				);
			else {
				const result = await api<{ id: string }>(
					`/api/v1/workspaces/${active.publicId}/applications`,
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							...common,
							databases: databaseId
								? [{ databaseId, environmentPrefix: 'DATABASE' }]
								: [],
							domains: [
								...new Set(
									customDomains
										.map((hostname) => hostname.trim().toLowerCase())
										.filter(Boolean),
								),
							],
							name: form.get('name'),
							subdomain: form.get('subdomain') || undefined,
							runtimeCode: form.get('runtimeCode'),
							repository: form.get('repository'),
							buildPack: form.get('buildPack'),
						}),
					},
				);
				navigate(`/dashboard/applications/${result.id}`, { replace: true });
			}
			toast.success(
				editing
					? 'Application updated and deployment queued.'
					: 'Application deployment queued.',
			);
			await load();
			if (editing)
				navigate(`/dashboard/applications/${applicationId}`, { replace: true });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Application operation failed.',
			);
		} finally {
			setSubmitting(false);
		}
	}

	/** Load recent provider logs into the detail drawer. */
	const loadLogs = useCallback(async (): Promise<void> => {
		if (!active || !applicationId) return;
		try {
			setLogs(
				(
					await api<{ logs: string }>(
						`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/logs`,
					)
				).logs,
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Logs unavailable.');
		}
	}, [active, applicationId]);
	useEffect(() => {
		if (!active || !applicationId) return;
		const controller = new AbortController();
		const connect = async (): Promise<void> => {
			while (!controller.signal.aborted) {
				try {
					const response = await authenticatedFetch(
						`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/events`,
						{
							headers: { accept: 'text/event-stream' },
							signal: controller.signal,
						},
					);
					await consumeEventStream(response, controller.signal, (event) => {
						const effectiveStatus = /queued|pending|provision|deploying|building|starting|progress/i.test(event.deploymentStatus ?? '')
							? event.deploymentStatus
							: event.providerStatus;
						if (effectiveStatus)
							setRows((current) =>
								current.map((row) =>
									row.id === applicationId
										? { ...row, resourceStatus: effectiveStatus }
										: row,
								),
							);
						if (event.type !== 'deployment') return;
						if (activeTab === 'logs') void loadLogs();
						if (['deployments', 'logs'].includes(activeTab))
							void api<DeploymentHistory>(
								`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/deployments`,
							)
								.then(setHistory)
								.catch(() => undefined);
					});
				} catch (error) {
					if (controller.signal.aborted) return;
					console.warn('Application event stream reconnecting.', error);
				}
				await new Promise((resolve) => window.setTimeout(resolve, 1_500));
			}
		};
		void connect();
		return () => controller.abort();
	}, [active, activeTab, applicationId, loadLogs]);
	useEffect(() => {
		if (activeTab === 'logs') void loadLogs();
	}, [activeTab, loadLogs]);
	async function control(
		action:
			'deactivate' | 'reactivate' | 'redeploy' | 'restart' | 'start' | 'stop',
	): Promise<void> {
		if (!active || !applicationId) return;
		setActionsOpen(false);
		setActionPending(true);
		try {
			await api(
				`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/action`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action }),
				},
			);
			toast.success(`Application ${action} requested.`);
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Application action failed.',
			);
		} finally {
			setActionPending(false);
		}
	}
	async function destroyApplication(): Promise<void> {
		if (!active || !record || deleteName !== record.name) return;
		setActionPending(true);
		try {
			await api(
				`/api/v1/workspaces/${active.publicId}/applications/${record.id}`,
				{
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						acceptedImpact: true,
						confirmationName: deleteName,
						databases: record.databases
							.filter(({ databaseId }) =>
								deleteDatabaseIds.includes(databaseId),
							)
							.map(({ databaseId }) => ({
								id: databaseId,
								confirmationName: deleteDatabaseNames[databaseId] ?? '',
							})),
					}),
				},
			);
			toast.success('Application deleted.');
			navigate('/dashboard/applications', { replace: true });
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Application deletion failed.',
			);
		} finally {
			setActionPending(false);
		}
	}
	function selectTab(tab: string): void {
		if (!record) return;
		navigate(`/dashboard/applications/${record.id}?tab=${tab}`);
	}
	async function browseEditDirectory(
		target: 'base' | 'publish',
	): Promise<void> {
		if (!active || !record) return;
		try {
			const result = await api<{ directories: string[] }>(
				`/api/v1/workspaces/${active.publicId}/applications/analyze-source`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						repository: record.sourceRepository,
						branch: record.sourceRef,
						githubConnectionId: record.githubConnectionId || undefined,
					}),
				},
			);
			setEditDirectories(result.directories);
			setEditDirectoryTarget(target);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Repository folders unavailable.',
			);
		}
	}
	const form = (isEdit: boolean) => (
		<form
			className="mt-6 grid gap-5"
			key={`${record?.id ?? 'new'}-${isEdit}`}
			onSubmit={(event) => void submit(event)}
		>
			{isEdit && (
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="grid gap-2 font-semibold">
						Application name
						<input
							className={inputClass}
							defaultValue={record?.name}
							name="name"
							required
						/>
					</label>
					<label className="grid gap-2 font-semibold">
						Visibility
						<select
							className={inputClass}
							defaultValue={record?.visibility ?? 'public'}
							name="visibility"
						>
							<option value="public">Public</option>
							<option value="private">Private</option>
						</select>
					</label>
					<label className="flex items-center gap-3 rounded-xl border border-brand-primary/10 p-4 sm:col-span-2">
						<input
							defaultChecked={record?.autoDeployEnabled}
							disabled={!options.limits?.deployments?.autoEnabled}
							name="autoDeployEnabled"
							type="checkbox"
						/>
						<span>
							<strong>Auto-deploy on push</strong>
							<small className="block font-normal text-app-muted">
								{options.limits?.deployments?.autoEnabled
									? 'Deploy future commits pushed to the selected branch. Turning this off keeps manual deployment available.'
									: 'Automatic deployments are not included in this package.'}
							</small>
						</span>
					</label>
				</div>
			)}
			{!isEdit && (
				<>
					<label className="grid gap-2 font-semibold">
						Name
						<input className={inputClass} name="name" required />
					</label>
					<label className="grid gap-2 font-semibold">
						Platform subdomain
						<input
							className={inputClass}
							name="subdomain"
							placeholder="my-app"
						/>
						<span className="text-xs font-normal text-app-muted">
							Your platform subdomain is always added and can only be removed
							after the application is saved with a verified replacement domain.
						</span>
					</label>
					<label className="grid gap-2 font-semibold">
						Public Git repository
						<input
							className={inputClass}
							name="repository"
							placeholder="https://github.com/organisation/repository"
							required
							type="url"
						/>
					</label>
					<fieldset className="grid gap-3 rounded-2xl border border-brand-primary/10 p-4">
						<div className="flex items-center justify-between gap-3">
							<div>
								<legend className="font-bold">Custom domains</legend>
								<p className="mt-1 text-xs font-normal text-app-muted">
									DNS is checked live, but pending DNS or owner approval will
									not prevent deployment.
								</p>
							</div>
							<button
								className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-bold"
								onClick={() => setCustomDomains((current) => [...current, ''])}
								type="button"
							>
								<Plus className="size-4" />
								Add
							</button>
						</div>
						{customDomains.map((hostname, index) => {
							const check = domainChecks[index];
							return (
								<div className="grid gap-2" key={index}>
									<div className="flex gap-2">
										<input
											className={`${inputClass} min-w-0 flex-1`}
											onChange={(event) => {
												const value = event.target.value;
												setCustomDomains((current) =>
													current.map((item, position) =>
														position === index ? value : item,
													),
												);
												setDomainChecks((current) => {
													const next = { ...current };
													delete next[index];
													return next;
												});
											}}
											placeholder="app.example.com"
											type="text"
											value={hostname}
										/>
										{customDomains.length > 1 && (
											<button
												aria-label="Remove domain field"
												className="rounded-xl border border-red-500/20 p-3 text-red-600"
												onClick={() => {
													setCustomDomains((current) =>
														current.filter((_, position) => position !== index),
													);
													setDomainChecks({});
												}}
												type="button"
											>
												<X className="size-4" />
											</button>
										)}
									</div>
									{check === 'checking' ? (
										<span className="flex items-center gap-2 text-xs text-app-muted">
											<LoaderCircle className="size-3 animate-spin" />
											Checking public DNS…
										</span>
									) : check ? (
										<span
											className={`flex items-center gap-2 text-xs ${check.approvalRequired ? 'text-amber-700 dark:text-amber-300' : check.available && check.dnsReady ? 'text-emerald-700 dark:text-emerald-300' : check.available ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-300'}`}
										>
											{check.available &&
												check.dnsReady &&
												!check.approvalRequired && (
													<CheckCircle2 className="size-3" />
												)}
											{check.approvalRequired
												? check.reason
												: check.available && check.dnsReady
													? `DNS visible: ${check.records.join(', ')}`
													: check.reason}
										</span>
									) : null}
								</div>
							);
						})}
					</fieldset>
				</>
			)}
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="grid gap-2 font-semibold">
					Branch
					<input
						className={inputClass}
						defaultValue={record?.sourceRef ?? 'main'}
						name="branch"
						required
					/>
				</label>
				{!isEdit && (
					<label className="grid gap-2 font-semibold">
						Runtime
						<select className={inputClass} name="runtimeCode" required>
							{options.runtimes.map((runtime) => (
								<option key={runtime.code} value={runtime.code}>
									{runtime.language} {runtime.version}
								</option>
							))}
						</select>
					</label>
				)}
				{!isEdit && (
					<label className="grid gap-2 font-semibold">
						Build pack
						<select className={inputClass} name="buildPack">
							<option value="nixpacks">Nixpacks</option>
							<option value="static">Static</option>
							<option value="dockerfile">Dockerfile</option>
						</select>
					</label>
				)}
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<label className="grid gap-2 font-semibold">
					Project directory
					<div className="flex gap-2">
						<input
							className={`${inputClass} min-w-0 flex-1`}
							name="baseDirectory"
							onChange={(event) => setEditBaseDirectory(event.target.value)}
							value={editBaseDirectory ?? '/'}
						/>
						<button
							className="rounded-xl border border-brand-primary/15 px-3"
							onClick={() => void browseEditDirectory('base')}
							type="button"
						>
							Browse
						</button>
					</div>
					<span className="text-xs font-normal text-app-muted">
						Directory containing the application manifest.
					</span>
				</label>
				<label className="grid gap-2 font-semibold">
					Output directory
					<div className="flex gap-2">
						<input
							className={`${inputClass} min-w-0 flex-1`}
							name="publishDirectory"
							onChange={(event) => setEditPublishDirectory(event.target.value)}
							value={editPublishDirectory ?? ''}
						/>
						<button
							className="rounded-xl border border-brand-primary/15 px-3"
							onClick={() => void browseEditDirectory('publish')}
							type="button"
						>
							Browse
						</button>
					</div>
					<span className="text-xs font-normal text-app-muted">
						Generated static files, when your framework produces them.
					</span>
				</label>
			</div>
			<details
				className="rounded-2xl border border-brand-primary/10 p-4"
				open={isEdit}
			>
				<summary className="cursor-pointer font-bold">Build commands</summary>
				<div className="mt-4 grid gap-4">
					<input
						className={inputClass}
						defaultValue={record?.installCommand ?? ''}
						name="installCommand"
						placeholder="Install command"
					/>
					<input
						className={inputClass}
						defaultValue={record?.buildCommand ?? ''}
						name="buildCommand"
						placeholder="Build command"
					/>
					<input
						className={inputClass}
						defaultValue={record?.startCommand ?? ''}
						name="startCommand"
						placeholder="Start command"
					/>
				</div>
			</details>
			{isEdit ? (
				<div className="rounded-2xl border border-brand-primary/10 p-4">
					<p className="text-sm font-bold">Connected databases</p>
					<p className="mt-1 text-sm text-app-muted">
						{record?.databases.length
							? record.databases
									.map(({ databaseName }) => databaseName)
									.join(', ')
							: 'None'}{' '}
						· Existing bindings remain unchanged during configuration edits.
					</p>
				</div>
			) : (
				<label className="grid gap-2 font-semibold">
					Connected database
					<select className={inputClass} name="databaseId">
						<option value="">No database</option>
						{options.databases.map((database) => (
							<option key={database.id} value={database.id}>
								{database.databaseName}
							</option>
						))}
					</select>
				</label>
			)}
			<button
				className="rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink"
				disabled={submitting}
				type="submit"
			>
				{isEdit ? 'Save and Deploy' : 'Queue Deployment'}
			</button>
		</form>
	);

	return (
		<div className="mx-auto max-w-6xl">
			<div className="flex items-end justify-between gap-4">
				<div>
					<p className="text-sm font-semibold text-brand-primary dark:text-brand-action">
						Workspace compute
					</p>
					<h2 className="mt-2 text-4xl font-black">Applications</h2>
				</div>
				<Link
					className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink"
					to="/dashboard/applications/create"
				>
					<Plus className="size-4" />
					Deploy Application
				</Link>
			</div>
			{loading ? (
				<LoaderCircle className="mt-8 size-6 animate-spin" />
			) : (
				<div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{rows.map((row) => {
						const primary =
							row.domains.find((domain) => domain.isPrimary) ?? row.domains[0];
						return (
							<Link
								className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6 transition hover:border-brand-action/60"
								key={row.id}
								to={`/dashboard/applications/${row.id}`}
							>
								<div className="flex items-start justify-between">
									<FileCode2 className="size-6 text-brand-primary dark:text-brand-action" />
									<span
										className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(row.resourceStatus ?? row.status)}`}
									>
										{statusLabel(row.resourceStatus ?? row.status)}
									</span>
								</div>
								<h3 className="mt-5 truncate text-xl font-bold">{row.name}</h3>
								<p className="mt-2 text-sm text-app-muted">
									{row.runtimeLanguage} {row.runtimeVersion}
								</p>
								<div className="mt-5 grid gap-2 text-sm">
									<span className="flex items-center gap-2">
										<GitBranch className="size-4 text-app-muted" />
										{row.sourceRef}
									</span>
									<span className="flex items-center gap-2 truncate">
										<Database className="size-4 text-app-muted" />
										{row.databases.length
											? row.databases
													.map(({ databaseName }) => databaseName)
													.join(', ')
											: 'No database'}
									</span>
									<span className="flex items-center gap-2 truncate">
										<Globe2 className="size-4 text-app-muted" />
										{primary?.hostname ?? 'Domain pending'}
									</span>
								</div>
							</Link>
						);
					})}
					{!rows.length && (
						<p className="rounded-2xl border border-dashed border-brand-primary/20 p-8 text-center text-app-muted md:col-span-2 xl:col-span-3">
							No source applications yet.
						</p>
					)}
				</div>
			)}
			{creating && active && (
				<Offcanvas
					onClose={() => navigate('/dashboard/applications')}
					title="Deploy Application"
					width="full"
				>
					{optionsLoading || !options.runtimes.length ? (
						<div className="grid min-h-[50vh] place-items-center">
							<LoaderCircle className="size-7 animate-spin" />
						</div>
					) : (
						<DeployApplicationForm
							onCreated={(id) => openCreatedApplication({ id, navigate, reload: load })}
							options={options}
							workspaceId={active.publicId}
						/>
					)}
				</Offcanvas>
			)}
			{editDirectoryTarget && (
				<Offcanvas
					layer="nested"
					onClose={() => setEditDirectoryTarget(null)}
					title="Choose repository directory"
					width="md"
				>
					<RepositoryDirectoryBrowser
						directories={editDirectories}
						initialDirectory={
							editDirectoryTarget === 'base'
								? editBaseDirectory || '/'
								: editPublishDirectory || '/'
						}
						onSelect={(directory) => {
							if (editDirectoryTarget === 'base')
								setEditBaseDirectory(directory);
							else setEditPublishDirectory(directory === '/' ? '' : directory);
							setEditDirectoryTarget(null);
						}}
					/>
				</Offcanvas>
			)}
			{applicationId && (
				<Offcanvas
					onClose={() => navigate('/dashboard/applications')}
					title={record?.name ?? 'Application details'}
					width="full"
				>
					{record ? (
						<div className="mt-5 grid gap-6">
							<div className="flex flex-col gap-4 border-b border-brand-primary/10 pb-4 lg:flex-row lg:items-center">
								<nav
									className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
									aria-label="Application sections"
								>
									{[
										'overview',
										'edit',
										'domains',
										'logs',
										'deployments',
										'settings',
									].map((tab) => (
										<button
											className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold capitalize ${activeTab === tab ? 'border-brand-action text-app-foreground' : 'border-transparent text-app-muted hover:text-app-foreground'}`}
											key={tab}
											onClick={() => {
												selectTab(tab);
												if (tab === 'logs') void loadLogs();
											}}
											type="button"
										>
											{tab === 'deployments' ? 'Deployment history' : tab}
										</button>
									))}
								</nav>
								<div className="flex items-center justify-end gap-2">
									{record.publicUrl && record.visibility === 'public' && (
										<a
											className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-4 py-2.5 font-bold text-brand-ink"
											href={record.publicUrl}
											rel="noreferrer"
											target="_blank"
										>
											Open <ExternalLink className="size-4" />
										</a>
									)}
									<div
										className="relative"
										onBlur={(event) => {
											if (!event.currentTarget.contains(event.relatedTarget))
												setActionsOpen(false);
										}}
									>
										<button
											className="grid size-11 cursor-pointer list-none place-items-center rounded-xl border border-brand-primary/15"
											aria-label="Application actions"
											aria-expanded={actionsOpen}
											onClick={() => setActionsOpen((current) => !current)}
											onKeyDown={(event) => {
												if (event.key === 'Escape') setActionsOpen(false);
											}}
											type="button"
										>
											<MoreVertical className="size-5" />
										</button>
										{actionsOpen && (
											<div className="absolute right-0 z-20 mt-2 grid w-56 gap-1 rounded-2xl border border-brand-primary/10 bg-app-surface p-2 shadow-xl">
												{record.operationalStatus === 'paused' ||
												record.operationalStatus === 'deactivated' ? (
													<button
														className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-brand-primary/5"
														disabled={actionPending}
														onClick={() =>
															void control(
																record.operationalStatus === 'deactivated'
																	? 'reactivate'
																	: 'start',
															)
														}
														type="button"
													>
														<Play className="size-4" />
														Resume
													</button>
												) : (
													<button
														className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-brand-primary/5"
														disabled={actionPending}
														onClick={() => void control('stop')}
														type="button"
													>
														<Square className="size-4" />
														Pause
													</button>
												)}
												<button
													className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-brand-primary/5"
													disabled={actionPending}
													onClick={() => void control('restart')}
													type="button"
												>
													<RefreshCw className="size-4" />
													Restart
												</button>
												<button
													className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-brand-primary/5"
													disabled={actionPending}
													onClick={() => void control('redeploy')}
													type="button"
												>
													<RefreshCw className="size-4" />
													Redeploy
												</button>
												<button
													className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-brand-primary/5"
													disabled={actionPending}
													onClick={() => void control('deactivate')}
													type="button"
												>
													Deactivate
												</button>
												<button
													className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-red-600 hover:bg-red-500/10"
													onClick={() => {
														setActionsOpen(false);
														selectTab('settings');
													}}
													type="button"
												>
													<Trash2 className="size-4" />
													Delete application
												</button>
											</div>
										)}
									</div>
								</div>
							</div>
							{activeTab === 'overview' && (
								<div className="grid gap-6">
									<dl className="grid gap-5 rounded-2xl border border-brand-primary/10 p-5 sm:grid-cols-2 lg:grid-cols-3">
										{[
											[
												'Stack',
												`${record.runtimeLanguage} ${record.runtimeVersion}`,
											],
											[
												'Status',
												record.operationalStatus === 'active'
													? (record.resourceStatus ?? record.status)
													: record.operationalStatus,
											],
											['Repository', record.sourceRepository],
											['Branch', record.sourceRef],
												['Project directory', projectDirectoryLabel(record.baseDirectory)],
											[
												'Databases',
												record.databases.length
													? record.databases
															.map(({ databaseName }) => databaseName)
															.join(', ')
													: 'None',
											],
											[
												'Primary domain',
												record.domains.find(({ isPrimary }) => isPrimary)
													?.hostname ?? 'Pending',
											],
											[
												'Latest deployment',
												record.latestDeployment
													? `${record.latestDeployment.status} · ${new Date(record.latestDeployment.createdAt).toLocaleString('en-IN')}`
													: 'None',
											],
										].map(([label, value]) => (
											<div key={String(label)}>
												<dt className="text-xs font-bold uppercase text-app-muted">
													{label}
												</dt>
												<dd className="mt-1 break-all">
													{label === 'Status' ? (
														<span
															className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(String(value))}`}
														>
															{statusLabel(String(value))}
														</span>
													) : label === 'Latest deployment' &&
													  record.latestDeployment ? (
														`${statusLabel(record.latestDeployment.status)} · ${new Date(record.latestDeployment.createdAt).toLocaleString('en-IN')}`
													) : (
														String(value)
													)}
												</dd>
											</div>
										))}
									</dl>
									{record.failureReason && (
										<p className="rounded-xl bg-red-500/10 p-4 text-red-600 dark:text-red-300">
											{record.failureReason}
										</p>
									)}
								</div>
							)}
							{activeTab === 'edit' && form(true)}
							{activeTab === 'domains' && (
								<div className="rounded-2xl border border-brand-primary/10 p-6">
									<h3 className="text-xl font-bold">Connected domains</h3>
									<div className="mt-4 grid gap-2">
										{record.domains.map((domain) => (
											<div
												className="flex items-center justify-between rounded-xl bg-brand-primary/5 px-4 py-3"
												key={domain.id}
											>
												<span>{domain.hostname}</span>
												<span className="text-xs font-bold text-app-muted">
													{statusLabel(domain.status)} · SSL{' '}
													{statusLabel(domain.tlsStatus)}
												</span>
											</div>
										))}
									</div>
									<Link
										className="mt-5 inline-flex rounded-xl bg-brand-action px-4 py-2.5 font-bold text-brand-ink"
										to={`/dashboard/applications/${record.id}/domains`}
									>
										Manage domains
									</Link>
								</div>
							)}
							{activeTab === 'logs' && (
								<ApplicationLogChannels
									channel={logChannel}
									history={history}
									onChannelChange={setLogChannel}
									onRefresh={() => void loadLogs()}
									runtimeLogs={logs}
									status={record.resourceStatus ?? record.status}
								/>
							)}
							{activeTab === 'deployments' && (
								<div className="grid gap-4">
									<p className="text-sm text-app-muted">
										Showing {history?.limit ?? 'unlimited'} entries · retained
										for {history?.retentionDays ?? 'unlimited'} days by your
										package.
									</p>
									{history?.logsPermissionRequired && (
										<p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
											Deployment metadata is live, but Coolify did not return
											build logs. Give the Ghost Deploy Coolify API token the{' '}
											<code>read:sensitive</code> permission.
										</p>
									)}
									{history?.logsUnavailable && (
										<p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
											Some older deployments have no build output stored by the
											provider. New deployment output will appear here live.
										</p>
									)}
									{history ? (
										history.items.map((deployment) => (
											<details
												className="rounded-2xl border border-brand-primary/10 p-4"
												key={deployment.id}
											>
												<summary className="flex cursor-pointer list-none items-center justify-between gap-3">
													<span>
														<strong
															className={`rounded-full px-2.5 py-1 text-xs ${statusClass(deployment.status)}`}
														>
															{statusLabel(deployment.status)}
														</strong>
														<small className="ml-3 text-app-muted">
															{deployment.trigger ?? 'manual'} ·{' '}
															{deployment.createdAt
																? new Date(deployment.createdAt).toLocaleString(
																		'en-IN',
																	)
																: 'Time unavailable'}
														</small>
													</span>
													<code className="text-xs">
														{deployment.commitSha?.slice(0, 8) ??
															deployment.id.slice(0, 8)}
													</code>
												</summary>
												{deployment.commitMessage && (
													<p className="mt-3 text-sm">
														{deployment.commitMessage}
													</p>
												)}
												{deployment.diagnostic && (
													<div
														className={`mt-4 rounded-xl border p-4 ${
															deployment.diagnostic.developerActionRequired
																? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200'
																: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200'
														}`}
													>
														<p className="text-xs font-bold uppercase tracking-wide">
															{deployment.diagnostic.owner === 'project'
																? 'Your project needs a change'
																: deployment.diagnostic.owner === 'platform'
																	? 'Ghost Deploy platform issue'
																	: deployment.diagnostic.owner === 'runtime'
																		? 'Application runtime issue'
																		: 'Deployment configuration issue'}
														</p>
														<p className="mt-1 font-bold">
															{deployment.diagnostic.title}
														</p>
														<p className="mt-1 text-sm">
															{deployment.diagnostic.explanation}
														</p>
														{deployment.diagnostic.location && (
															<code className="mt-3 block rounded-lg bg-black/15 px-3 py-2 text-xs font-bold">
																{deployment.diagnostic.location}
															</code>
														)}
														{deployment.diagnostic.detail && (
															<p className="mt-2 font-mono text-sm">{deployment.diagnostic.detail}</p>
														)}
														<p className="mt-2 text-sm font-medium">
															Next: {deployment.diagnostic.suggestion}
														</p>
													</div>
												)}
												{Boolean(deployment.compatibilityFixes?.length) && (
													<div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-violet-800 dark:text-violet-200">
														<p className="text-xs font-bold uppercase tracking-wide">Compatibility fix applied · Beta</p>
														<p className="mt-1 text-sm">Ghost Deploy converted {deployment.compatibilityFixes?.length} source file(s) only inside this build copy. The Git repository was not modified.</p>
														<ul className="mt-3 grid gap-2 text-xs">
															{deployment.compatibilityFixes?.map((fix) => (
																<li className="rounded-lg bg-black/10 px-3 py-2" key={`${fix.path}-${fix.from}`}>
																	<code className="font-bold">{fix.path}</code> · {fix.from} → UTF-8 · confidence {(fix.confidence * 10).toFixed(1)}/10
																</li>
															))}
														</ul>
													</div>
												)}
												<p className="mt-3 text-xs text-app-muted">
													{deployment.finishedAt
														? `Finished ${new Date(deployment.finishedAt).toLocaleString('en-IN')}${deployment.createdAt ? ` · Duration ${Math.max(0, Math.round((new Date(deployment.finishedAt).getTime() - new Date(deployment.createdAt).getTime()) / 1000))}s` : ''}`
														: /queued|progress|building|starting/i.test(
																	deployment.status,
															  )
															? 'Deployment is still running. Updates will appear here automatically.'
															: 'Completion time unavailable.'}
												</p>
												{deployment.logs ? (
													<details className="mt-4 rounded-xl border border-brand-primary/10 p-3">
														<summary className="cursor-pointer text-sm font-bold">View complete deployment log</summary>
														<pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">
															{deployment.logs}
														</pre>
													</details>
												) : (
													<p className="mt-3 rounded-xl border border-dashed border-brand-primary/15 p-3 text-sm text-app-muted">
														{/queued|progress|building|starting/i.test(
															deployment.status,
														)
															? 'Waiting for build output…'
															: 'No build output was returned for this deployment.'}
													</p>
												)}
											</details>
										))
									) : (
										<LoaderCircle className="size-6 animate-spin" />
									)}
								</div>
							)}
							{activeTab === 'settings' && (
								<div className="grid gap-6">
									<ApplicationSettingsForm applicationId={record.id} key={record.id} operationalStatus={record.operationalStatus} workspaceId={active!.publicId} />
									<div className="rounded-2xl border border-brand-primary/10 p-5">
										<h3 className="font-bold">Scheduled tasks</h3>
										<div className="mt-4">
											<ApplicationCronJobs
												applicationId={record.id}
												workspaceId={active!.publicId}
											/>
										</div>
									</div>
									<div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
										<h3 className="text-lg font-bold text-red-600">
											Delete application
										</h3>
										<p className="mt-2 text-sm text-app-muted">
											This deletes the deployed application, its managed domains
											and scheduled tasks. Databases are kept unless selected
											below.
										</p>
										{record.databases.length > 0 && (
											<fieldset className="mt-4 grid gap-3">
												<legend className="font-bold">
													Also delete databases
												</legend>
												{record.databases.map((database) => (
													<div className="grid gap-2" key={database.databaseId}>
														<label className="flex items-center gap-3">
															<input
																checked={deleteDatabaseIds.includes(
																	database.databaseId,
																)}
																onChange={(event) =>
																	setDeleteDatabaseIds((current) =>
																		event.target.checked
																			? [...current, database.databaseId]
																			: current.filter(
																					(id) => id !== database.databaseId,
																				),
																	)
																}
																type="checkbox"
															/>
															Delete {database.databaseName}
														</label>
														{deleteDatabaseIds.includes(
															database.databaseId,
														) && (
															<label className="grid gap-1 text-sm">
																Type the database name
																<input
																	className={inputClass}
																	onChange={(event) =>
																		setDeleteDatabaseNames((current) => ({
																			...current,
																			[database.databaseId]: event.target.value,
																		}))
																	}
																	value={
																		deleteDatabaseNames[database.databaseId] ??
																		''
																	}
																/>
															</label>
														)}
													</div>
												))}
											</fieldset>
										)}
										<label className="mt-4 grid gap-2 font-semibold">
											Type <code>{record.name}</code> to confirm
											<input
												className={inputClass}
												onChange={(event) => setDeleteName(event.target.value)}
												value={deleteName}
											/>
										</label>
										<button
											className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-bold text-white disabled:opacity-50"
											disabled={
												deleteName !== record.name ||
												deleteDatabaseIds.some(
													(id) =>
														deleteDatabaseNames[id] !==
														record.databases.find(
															(database) => database.databaseId === id,
														)?.databaseName,
												) ||
												actionPending
											}
											onClick={() => void destroyApplication()}
											type="button"
										>
											<Trash2 className="size-4" />
											Delete application
										</button>
									</div>
								</div>
							)}
						</div>
					) : loading ? (
						<LoaderCircle className="mt-8 size-6 animate-spin" />
					) : (
						<div className="mt-8 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6">
							<h3 className="font-bold">Application details unavailable</h3>
							<p className="mt-2 text-sm text-app-muted">{loadError ?? 'The application was not found in the current workspace data.'}</p>
							<button className="mt-4 inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-2.5 text-sm font-bold" onClick={() => void load()} type="button"><RefreshCw className="size-4" />Retry</button>
						</div>
					)}
				</Offcanvas>
			)}
		</div>
	);
}
