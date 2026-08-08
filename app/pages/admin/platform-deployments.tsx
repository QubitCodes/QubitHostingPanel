import { zodResolver } from '@hookform/resolvers/zod';
import {
	AlertTriangle,
	CheckCircle2,
	CircleX,
	CloudUpload,
	LoaderCircle,
	RefreshCw,
	TerminalSquare,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { createPlatformDeploymentSchema } from '@schemas/platformDeployment';
import type { CreatePlatformDeploymentInput } from '@schemas/platformDeployment';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

type DeploymentStatus =
	| 'queued'
	| 'running'
	| 'succeeded'
	| 'failed'
	| 'cancelled';

interface Deployment {
	commitMessage: string | null;
	commitSha: string | null;
	completedAt: string | null;
	createdAt: string;
	failureMessage: string | null;
	id: string;
	lastPollError: string | null;
	logs: string;
	providerStatus: string | null;
	startedAt: string | null;
	status: DeploymentStatus;
	updatedAt: string;
}

interface ApiBody<T> {
	data?: T;
	message: string;
	status: boolean;
}

const ACTIVE_STATUSES: DeploymentStatus[] = ['queued', 'running'];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = (await response.json()) as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined)
		throw new Error(body.message);
	return body.data;
}

function statusStyle(status: DeploymentStatus): string {
	if (status === 'succeeded')
		return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
	if (status === 'failed' || status === 'cancelled')
		return 'bg-red-500/10 text-red-700 dark:text-red-300';
	return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

function StatusIcon({ status }: { status: DeploymentStatus }) {
	if (status === 'succeeded') return <CheckCircle2 className="size-4" />;
	if (status === 'failed' || status === 'cancelled')
		return <CircleX className="size-4" />;
	return <LoaderCircle className="size-4 animate-spin" />;
}

/** Super Admin-only control-plane release page with restart-safe live log polling. */
export default function PlatformDeploymentsPage() {
	const [configured, setConfigured] = useState(false);
	const [deployments, setDeployments] = useState<Deployment[]>([]);
	const [selected, setSelected] = useState<Deployment>();
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [connectionInterrupted, setConnectionInterrupted] = useState(false);
	const [followLogs, setFollowLogs] = useState(true);
	const logRef = useRef<HTMLPreElement>(null);
	const form = useForm<CreatePlatformDeploymentInput>({
		defaultValues: { confirmation: '' },
		resolver: zodResolver(createPlatformDeploymentSchema),
	});

	const load = useCallback(async (): Promise<void> => {
		try {
			const data = await api<{
				configured: boolean;
				deployments: Deployment[];
			}>('/api/v1/operations/platform-deployments');
			setConfigured(data.configured);
			setDeployments(data.deployments);
			setSelected((current) =>
				current
					? data.deployments.find((item) => item.id === current.id) ?? current
					: data.deployments[0],
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to load deployments.',
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const timeout = window.setTimeout(() => void load(), 0);
		return () => window.clearTimeout(timeout);
	}, [load]);

	const selectedId = selected?.id;
	const selectedStatus = selected?.status;
	useEffect(() => {
		if (!selectedId || !selectedStatus || !ACTIVE_STATUSES.includes(selectedStatus)) return;
		let stopped = false;
		const poll = async (): Promise<void> => {
			try {
				const refreshed = await api<Deployment>(
					`/api/v1/operations/platform-deployments/${selectedId}`,
				);
				if (stopped) return;
				setConnectionInterrupted(false);
				setSelected(refreshed);
				setDeployments((current) =>
					current.map((item) =>
						item.id === refreshed.id ? refreshed : item,
					),
				);
			} catch {
				if (!stopped) setConnectionInterrupted(true);
			}
		};
		void poll();
		const interval = window.setInterval(() => void poll(), 2_000);
		return () => {
			stopped = true;
			window.clearInterval(interval);
		};
	}, [selectedId, selectedStatus]);

	useEffect(() => {
		if (!followLogs || !logRef.current) return;
		logRef.current.scrollTop = logRef.current.scrollHeight;
	}, [followLogs, selected?.logs]);

	async function deploy(input: CreatePlatformDeploymentInput): Promise<void> {
		setSubmitting(true);
		try {
			const deployment = await api<Deployment>(
				'/api/v1/operations/platform-deployments',
				{
					body: JSON.stringify(input),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
				},
			);
			setDeployments((current) => [deployment, ...current]);
			setSelected(deployment);
			setFollowLogs(true);
			setConfirming(false);
			form.reset();
			toast.success('Platform deployment started.');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Deployment request failed.',
			);
		} finally {
			setSubmitting(false);
		}
	}

	const active = deployments.some((item) => ACTIVE_STATUSES.includes(item.status));
	const duration = selected?.startedAt
		? Math.max(
				0,
				Math.round(
					(new Date(selected.completedAt ?? selected.updatedAt).getTime() -
						new Date(selected.startedAt).getTime()) /
						1_000,
				),
			)
		: undefined;

	return (
		<main className="mx-auto max-w-7xl">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-sm font-semibold text-brand-primary dark:text-brand-action">
						Control plane
					</p>
					<h2 className="mt-2 text-4xl font-black">Platform Deployments</h2>
					<p className="mt-2 max-w-2xl text-app-muted">
						Release the latest pushed revision of Ghost Deploy through the configured hosting provider.
					</p>
				</div>
				<div className="flex gap-2">
					<button
						aria-label="Refresh deployments"
						className="grid size-12 place-items-center rounded-xl border border-brand-primary/15"
						disabled={loading}
						onClick={() => void load()}
						type="button"
					>
						<RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
					</button>
					<button
						className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink disabled:cursor-not-allowed disabled:opacity-40"
						disabled={!configured || active || loading}
						onClick={() => setConfirming(true)}
						type="button"
					>
						{active ? <LoaderCircle className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
						{active ? 'Deployment Running' : 'Deploy Latest Push'}
					</button>
				</div>
			</div>

			{!configured && !loading && (
				<div className="mt-6 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
					<AlertTriangle className="mt-0.5 size-5 shrink-0" />
					<p>
						Set <code>COOLIFY_PLATFORM_APPLICATION_UUID</code> on the Ghost Deploy application before using this page.
					</p>
				</div>
			)}

			{loading ? (
				<div className="mt-10 flex items-center gap-3 text-app-muted">
					<LoaderCircle className="size-5 animate-spin" /> Loading deployments…
				</div>
			) : (
				<div className="mt-7 grid min-w-0 gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
					<aside className="min-w-0 space-y-3">
						<h3 className="text-sm font-black uppercase tracking-wider text-app-muted">History</h3>
						{deployments.map((deployment) => (
							<button
								className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === deployment.id ? 'border-brand-action bg-brand-action/5' : 'border-brand-primary/10 bg-app-surface hover:border-brand-action/50'}`}
								key={deployment.id}
								onClick={() => {
									setSelected(deployment);
									setFollowLogs(true);
								}}
								type="button"
							>
								<span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyle(deployment.status)}`}>
									<StatusIcon status={deployment.status} /> {deployment.status}
								</span>
								<p className="mt-3 truncate font-mono text-sm font-bold">{deployment.commitSha?.slice(0, 12) ?? 'Revision pending'}</p>
								<p className="mt-1 text-xs text-app-muted">{new Date(deployment.createdAt).toLocaleString()}</p>
							</button>
						))}
						{deployments.length === 0 && (
							<p className="rounded-2xl border border-dashed border-brand-primary/20 p-6 text-sm text-app-muted">No platform deployments yet.</p>
						)}
					</aside>

					<section className="min-w-0 rounded-3xl border border-brand-primary/10 bg-app-surface p-4 sm:p-6">
						{selected ? (
							<>
								<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
									<div className="min-w-0">
										<div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold capitalize ${statusStyle(selected.status)}`}>
											<StatusIcon status={selected.status} /> {selected.status}
										</div>
										<h3 className="mt-3 truncate text-2xl font-black">{selected.commitMessage || 'Preparing latest revision'}</h3>
										<p className="mt-1 font-mono text-sm text-app-muted">{selected.commitSha ?? 'Commit details pending'}</p>
									</div>
									{duration !== undefined && <p className="shrink-0 text-sm text-app-muted">{duration}s elapsed</p>}
								</div>

								{connectionInterrupted && (
									<p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">Ghost Deploy is restarting. Reconnecting automatically…</p>
								)}
								{selected.failureMessage && (
									<p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{selected.failureMessage}</p>
								)}
								{selected.lastPollError && ACTIVE_STATUSES.includes(selected.status) && (
									<p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{selected.lastPollError} Retrying automatically…</p>
								)}

								<div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-slate-100">
									<div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
										<span className="inline-flex items-center gap-2 text-sm font-bold"><TerminalSquare className="size-4" />Live Deploy Logs</span>
										{!followLogs && <button className="text-xs font-bold text-brand-action" onClick={() => setFollowLogs(true)} type="button">Jump to latest</button>}
									</div>
									<pre
										aria-live="polite"
										className="h-[32rem] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 sm:text-sm"
										onScroll={(event) => {
											const element = event.currentTarget;
											setFollowLogs(element.scrollHeight - element.scrollTop - element.clientHeight < 40);
										}}
										ref={logRef}
									>
										{selected.logs || (ACTIVE_STATUSES.includes(selected.status) ? 'Waiting for deployment output…' : 'No deployment output was retained.')}
									</pre>
								</div>
							</>
						) : (
							<div className="grid min-h-96 place-items-center text-center text-app-muted">
								<div><TerminalSquare className="mx-auto size-10" /><p className="mt-3">Start or select a deployment to view its logs.</p></div>
							</div>
						)}
					</section>
				</div>
			)}

			{confirming && (
				<div aria-modal="true" className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" role="dialog">
					<form className="w-full max-w-lg rounded-3xl border border-amber-500/20 bg-app-surface p-6 shadow-2xl" onSubmit={(event) => void form.handleSubmit(deploy)(event)}>
						<CloudUpload className="size-8 text-brand-primary dark:text-brand-action" />
						<h3 className="mt-4 text-2xl font-black">Deploy Ghost Deploy?</h3>
						<p className="mt-2 text-sm text-app-muted">This releases the latest pushed revision. The panel may be unavailable briefly while its container is replaced. Type <strong className="font-mono text-app-text">DEPLOY</strong> to continue.</p>
						<Controller control={form.control} name="confirmation" render={({ field, fieldState }) => <label className="mt-5 block text-sm font-bold">Confirmation<input {...field} autoComplete="off" autoFocus className="mt-2 w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100" />{fieldState.error && <span className="mt-1 block text-xs text-red-500">Type DEPLOY exactly.</span>}</label>} />
						<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
							<button className="rounded-xl border border-brand-primary/15 px-5 py-3 font-bold" disabled={submitting} onClick={() => { setConfirming(false); form.reset(); }} type="button">Cancel</button>
							<button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink disabled:opacity-50" disabled={submitting} type="submit">{submitting && <LoaderCircle className="size-4 animate-spin" />}Deploy Latest Push</button>
						</div>
					</form>
				</div>
			)}
		</main>
	);
}
