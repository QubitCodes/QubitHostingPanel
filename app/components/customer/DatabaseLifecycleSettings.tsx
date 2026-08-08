import {
	BookCopy,
	Copy,
	KeyRound,
	MoveRight,
	Network,
	RotateCw,
	Save,
	ShieldOff,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import type { DatabaseManagerContext } from '@root/app/layouts/database';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Credential {
	databaseName: string;
	engine: string;
	host: string;
	password: string;
	port: number;
	username: string;
}
interface WorkspaceOption {
	name: string;
	publicId: number;
}
interface ExternalRule {
	allowedCidrs: string[];
	endpointHost: string | null;
	expiresAt?: string | null;
	gatewayPort: number;
	status: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = (await response.json()) as {
		data?: T;
		message: string;
		status: boolean;
	};
	if (!response.ok || !body.status || body.data === undefined)
		throw new Error(body.message);
	return body.data;
}

const jsonRequest = (body: unknown): RequestInit => ({
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(body),
});

/** Advanced lifecycle and least-privilege connectivity settings for one logical database. */
export function DatabaseLifecycleSettings({
	database,
}: {
	database: DatabaseManagerContext;
}) {
	const [params, setParams] = useSearchParams();
	const action = params.get('action');
	const [credential, setCredential] = useState<Credential>();
	const [showPassword, setShowPassword] = useState(false);
	const [busy, setBusy] = useState(false);
	const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
	const [external, setExternal] = useState<{
		enabledByPackage: boolean;
		rule: ExternalRule | null;
	}>();
	const endpoint = `/api/v1/workspaces/${database.workspacePublicId}/databases/${database.id}`;
	const loadExternal = useCallback(
		() =>
			api<{ enabledByPackage: boolean; rule: ExternalRule | null }>(
				`${endpoint}/external-access`,
			)
				.then(setExternal)
				.catch((error) =>
					toast.error(
						error instanceof Error
							? error.message
							: 'External-access settings are unavailable.',
					),
				),
		[endpoint],
	);
	useEffect(() => {
		void loadExternal();
		void api<WorkspaceOption[]>('/api/v1/workspaces')
			.then(setWorkspaces)
			.catch(() => undefined);
	}, [loadExternal]);

	async function credentialAction(
		target: 'credentials' | 'rotate',
	): Promise<void> {
		setBusy(true);
		try {
			const data = await api<Credential>(
				`${endpoint}/${target}`,
				jsonRequest(target === 'rotate' ? { acceptedImpact: true } : {}),
			);
			setCredential(data);
			setShowPassword(true);
			toast.success(
				target === 'rotate'
					? 'Database-user password changed.'
					: 'Credentials revealed.',
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Credential action failed.',
			);
		} finally {
			setBusy(false);
		}
	}

	async function submitLifecycle(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();
		if (!action) return;
		const values = Object.fromEntries(new FormData(event.currentTarget));
		setBusy(true);
		try {
			if (action === 'clone')
				await api(
					`${endpoint}/clone`,
					jsonRequest({
						name: values.name,
						confirmationName: values.confirmationName,
					}),
				);
			if (action === 'rename')
				await api(
					`${endpoint}/rename`,
					jsonRequest({
						name: values.name,
						confirmationName: values.confirmationName,
						acceptedImpact: true,
						connectedApplicationNames: database.connectedApplications.map(
							({ name }) => name,
						),
					}),
				);
			if (action === 'move') {
				setCredential(
					await api<Credential>(
						`${endpoint}/move`,
						jsonRequest({
							name: values.name,
							confirmationName: values.confirmationName,
							acceptedImpact: true,
							targetWorkspacePublicId: Number(values.targetWorkspacePublicId),
						}),
					),
				);
				setShowPassword(true);
			}
			toast.success(
				action === 'clone'
					? 'Database cloned.'
					: action === 'rename'
						? 'Database renamed.'
						: 'Database moved. Save the new credentials.',
			);
			if (action === 'rename') window.location.reload();
			else setParams({});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Database operation failed.',
			);
		} finally {
			setBusy(false);
		}
	}

	async function saveExternal(
		event: FormEvent<HTMLFormElement>,
	): Promise<void> {
		event.preventDefault();
		const values = new FormData(event.currentTarget);
		const allowedCidrs = String(values.get('allowedCidrs') ?? '')
			.split(/[\n,]+/)
			.map((value) => value.trim())
			.filter(Boolean);
		const expiresAt = String(values.get('expiresAt') ?? '').trim();
		setBusy(true);
		try {
			await api(`${endpoint}/external-access`, {
				...jsonRequest({
					allowedCidrs,
					expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
				}),
				method: 'PUT',
			});
			toast.success(
				'External access queued for secure gateway synchronization.',
			);
			await loadExternal();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'External access could not be saved.',
			);
		} finally {
			setBusy(false);
		}
	}

	async function revokeExternal(): Promise<void> {
		setBusy(true);
		try {
			await api(`${endpoint}/external-access`, { method: 'DELETE' });
			toast.success('External access disabled.');
			await loadExternal();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'External access could not be disabled.',
			);
		} finally {
			setBusy(false);
		}
	}

	const otherWorkspaces = workspaces.filter(
		({ publicId }) => publicId !== database.workspacePublicId,
	);
	return (
		<div className="grid gap-6">
			<section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5">
				<h2 className="text-xl font-black">Connection and Password</h2>
				<p className="mt-1 text-sm text-app-muted">
					The password belongs to the database user. Changing it affects every
					database and application using <strong>{database.username}</strong>.
				</p>
				<div className="mt-4 grid gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm sm:grid-cols-2">
					<div>
						<strong>
							Affected Databases ({database.passwordImpact.databases.length})
						</strong>
						<p className="mt-1 break-words text-app-muted">
							{database.passwordImpact.databases
								.map(({ databaseName }) => databaseName)
								.join(', ')}
						</p>
					</div>
					<div>
						<strong>
							Affected Applications (
							{database.passwordImpact.applications.length})
						</strong>
						<p className="mt-1 break-words text-app-muted">
							{database.passwordImpact.applications
								.map(({ name }) => name)
								.join(', ') || 'None'}
						</p>
					</div>
				</div>
				<dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[
						['Host', credential?.host ?? 'Reveal credentials to view'],
						['Port', credential?.port ?? '—'],
						['Database', credential?.databaseName ?? database.databaseName],
						['Username', credential?.username ?? database.username],
						[
							'Password',
							credential && showPassword ? credential.password : '••••••••••••',
						],
					].map(([label, value]) => (
						<div key={label}>
							<dt className="text-xs font-bold uppercase text-app-muted">
								{label}
							</dt>
							<dd className="mt-1 break-all font-mono text-sm">{value}</dd>
						</div>
					))}
				</dl>
				<div className="mt-6 flex flex-wrap gap-3">
					<button
						className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-3 font-bold"
						disabled={busy}
						onClick={() => void credentialAction('credentials')}
						type="button"
					>
						<KeyRound className="size-4" />
						Reveal Credentials
					</button>
					<button
						className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-bold text-white"
						disabled={busy}
						onClick={() => {
							if (
								window.confirm(
									`Generate a new password for ${database.username}?`,
								)
							)
								void credentialAction('rotate');
						}}
						type="button"
					>
						<RotateCw className="size-4" />
						Change Password
					</button>
					{credential && (
						<button
							className="rounded-xl border border-brand-primary/15 px-4 py-3 font-bold"
							onClick={() => setShowPassword((value) => !value)}
							type="button"
						>
							{showPassword ? 'Mask Password' : 'Show Password'}
						</button>
					)}
					{credential && (
						<button
							className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-3 font-bold"
							onClick={() =>
								void navigator.clipboard.writeText(credential.password)
							}
							type="button"
						>
							<Copy className="size-4" />
							Copy Password
						</button>
					)}
				</div>
			</section>
			<section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5">
				<h2 className="text-xl font-black">Database Lifecycle</h2>
				<p className="mt-1 text-sm text-app-muted">
					Clone, rename, and workspace transfer create an encrypted seven-day
					safety backup first.
				</p>
				<div className="mt-5 grid gap-3 sm:grid-cols-3">
					<button
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-3 font-bold"
						onClick={() => setParams({ action: 'clone' })}
						type="button"
					>
						<BookCopy className="size-4" />
						Clone
					</button>
					<button
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-3 font-bold"
						onClick={() => setParams({ action: 'rename' })}
						type="button"
					>
						<Save className="size-4" />
						Rename
					</button>
					<button
						className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-3 font-bold"
						onClick={() => setParams({ action: 'move' })}
						type="button"
					>
						<MoveRight className="size-4" />
						Move Workspace
					</button>
				</div>
				{action && ['clone', 'rename', 'move'].includes(action) && (
					<form
						className="mt-5 grid gap-4 rounded-xl border border-brand-primary/10 bg-app-bg p-4"
						onSubmit={(event) => void submitLifecycle(event)}
					>
						<h3 className="font-black capitalize">{action} Database</h3>
						<label className="grid gap-2 text-sm font-bold">
							New Name
							<input
								className="rounded-xl border border-brand-primary/15 bg-app-surface px-4 py-3"
								name="name"
								pattern="[a-z0-9]+(?:_[a-z0-9]+)*"
								required
							/>
						</label>
						{action === 'move' && (
							<label className="grid gap-2 text-sm font-bold">
								Target Workspace
								<select
									className="rounded-xl border border-brand-primary/15 bg-app-surface px-4 py-3"
									name="targetWorkspacePublicId"
									required
								>
									<option value="">Select Workspace</option>
									{otherWorkspaces.map((workspace) => (
										<option key={workspace.publicId} value={workspace.publicId}>
											{workspace.name} ({workspace.publicId})
										</option>
									))}
								</select>
							</label>
						)}
						<label className="grid gap-2 text-sm font-bold">
							Type{' '}
							<strong className="font-mono">{database.databaseName}</strong> to
							Confirm
							<input
								autoComplete="off"
								className="rounded-xl border border-brand-primary/15 bg-app-surface px-4 py-3 font-mono"
								name="confirmationName"
								required
							/>
						</label>
						<p className="text-xs text-app-muted">
							{action !== 'clone' && database.connectedApplications.length
								? `${database.connectedApplications.length} connected application(s) will require attention.`
								: 'A safety backup will be retained for seven days.'}
						</p>
						<div className="flex gap-3">
							<button
								className="rounded-xl bg-brand-action px-4 py-3 font-black text-brand-ink disabled:opacity-50"
								disabled={busy}
								type="submit"
							>
								{busy ? 'Working…' : `Confirm ${action}`}
							</button>
							<button
								className="rounded-xl border border-brand-primary/15 px-4 py-3 font-bold"
								onClick={() => setParams({})}
								type="button"
							>
								Cancel
							</button>
						</div>
					</form>
				)}
			</section>
			<section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-2">
							<Network className="size-5" />
							<h2 className="text-xl font-black">External Access</h2>
						</div>
						<p className="mt-1 text-sm text-app-muted">
							Dedicated gateway port, IP allowlist, optional expiry, and
							isolated credentials. Cluster administration stays private.
						</p>
					</div>
					{external?.rule && (
						<span className="rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-bold uppercase">
							{external.rule.status}
						</span>
					)}
				</div>
				{external && !external.enabledByPackage ? (
					<p className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">
						External access is locked by this workspace package.
					</p>
				) : (
					<form
						className="mt-5 grid gap-4"
						onSubmit={(event) => void saveExternal(event)}
					>
						<label className="grid gap-2 text-sm font-bold">
							Allowed IPs / CIDRs
							<textarea
								className="min-h-28 rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3 font-mono"
								defaultValue={external?.rule?.allowedCidrs.join('\n') ?? ''}
								name="allowedCidrs"
								placeholder={'203.0.113.10/32\n2001:db8::/64'}
								required
							/>
						</label>
						<label className="grid gap-2 text-sm font-bold sm:max-w-sm">
							Automatic Expiry (Optional)
							<input
								className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3"
								defaultValue={external?.rule?.expiresAt?.slice(0, 16) ?? ''}
								name="expiresAt"
								type="datetime-local"
							/>
						</label>
						{external?.rule && (
							<p className="text-sm text-app-muted">
								Endpoint:{' '}
								<strong className="font-mono text-app-text">
									{external.rule.endpointHost ?? 'Gateway host pending'}:
									{external.rule.gatewayPort}
								</strong>
							</p>
						)}
						<div className="flex flex-wrap gap-3">
							<button
								className="rounded-xl bg-brand-action px-4 py-3 font-black text-brand-ink disabled:opacity-50"
								disabled={busy}
								type="submit"
							>
								Save External Access
							</button>
							{external?.rule && (
								<button
									className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 font-bold text-red-600"
									disabled={busy}
									onClick={() => void revokeExternal()}
									type="button"
								>
									<ShieldOff className="size-4" />
									Disable
								</button>
							)}
						</div>
					</form>
				)}
			</section>
		</div>
	);
}
