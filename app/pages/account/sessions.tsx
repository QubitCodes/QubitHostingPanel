import { Clock3, Laptop, LogOut, MapPin, MonitorSmartphone, Pencil, ShieldCheck, Wifi } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface SessionRecord {
	browserName?: string | null;
	browserVersion?: string | null;
	city?: string | null;
	country?: string | null;
	countryCode?: string | null;
	deviceLabel?: string | null;
	deviceModel?: string | null;
	deviceType?: string | null;
	deviceVendor?: string | null;
	expiresAt: string;
	id: string;
	ipAddress?: string | null;
	isActive: boolean;
	isCurrent: boolean;
	lastActiveAt: string;
	location?: string | null;
	networkAsn?: string | null;
	networkName?: string | null;
	osName?: string | null;
	osVersion?: string | null;
	region?: string | null;
	revokedAt?: string | null;
	signedInAt: string;
	timezone?: string | null;
}

interface ApiEnvelope<T> { data: T; message: string; status: boolean }

function formatDate(value: string): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function sessionTitle(session: SessionRecord): string {
	return session.deviceLabel || [session.deviceVendor, session.deviceModel].filter(Boolean).join(' ') || session.deviceType || 'Unknown device';
}

/** Shared account page for reviewing, naming, and revoking every owned login session. */
export default function SessionsPage() {
	const [sessions, setSessions] = useState<SessionRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [busyId, setBusyId] = useState<string>();

	const loadSessions = useCallback(async () => {
		setLoading(true);
		try {
			const response = await authenticatedFetch('/api/v1/auth/sessions');
			const body = await response.json() as ApiEnvelope<SessionRecord[]>;
			if (!response.ok || !body.status) throw new Error(body.message);
			setSessions(body.data);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to load sessions.');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const timeout = window.setTimeout(() => void loadSessions(), 0);
		return () => window.clearTimeout(timeout);
	}, [loadSessions]);

	async function renameSession(session: SessionRecord): Promise<void> {
		const label = window.prompt('Device label', session.deviceLabel ?? '');
		if (!label?.trim()) return;
		setBusyId(session.id);
		try {
			const response = await authenticatedFetch(`/api/v1/auth/sessions/${session.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: label.trim() }) });
			const body = await response.json() as ApiEnvelope<unknown>;
			if (!response.ok || !body.status) throw new Error(body.message);
			toast.success('Device label updated.');
			await loadSessions();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to update device label.');
		} finally {
			setBusyId(undefined);
		}
	}

	async function revokeSession(session: SessionRecord): Promise<void> {
		if (!window.confirm(`Sign out ${sessionTitle(session)}?`)) return;
		setBusyId(session.id);
		try {
			const response = await authenticatedFetch(`/api/v1/auth/sessions/${session.id}`, { method: 'DELETE' });
			const body = await response.json() as ApiEnvelope<{ currentSessionRevoked: boolean }>;
			if (!response.ok || !body.status) throw new Error(body.message);
			if (body.data.currentSessionRevoked) {
				sessionStorage.removeItem('accessToken');
				sessionStorage.removeItem('refreshToken');
				window.location.assign('/');
				return;
			}
			toast.success('Session signed out.');
			await loadSessions();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to revoke session.');
		} finally {
			setBusyId(undefined);
		}
	}

	async function revokeOthers(): Promise<void> {
		if (!window.confirm('Sign out every other active session?')) return;
		setBusyId('others');
		try {
			const response = await authenticatedFetch('/api/v1/auth/sessions/others', { method: 'DELETE' });
			const body = await response.json() as ApiEnvelope<{ revokedCount: number }>;
			if (!response.ok || !body.status) throw new Error(body.message);
			toast.success(`${body.data.revokedCount} other session(s) signed out.`);
			await loadSessions();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to revoke other sessions.');
		} finally {
			setBusyId(undefined);
		}
	}

	return (
		<main className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:px-8">
			<div className="mx-auto max-w-5xl">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Account security</p>
						<h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Devices &amp; sessions</h1>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Review where your account is signed in, name familiar devices, and revoke access you no longer recognize.</p>
					</div>
					<button className="rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950" disabled={busyId === 'others'} onClick={() => void revokeOthers()} type="button">Sign out other sessions</button>
				</div>

				{loading ? (
					<div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" /><div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" /></div>
				) : (
					<div className="mt-8 grid gap-4 sm:grid-cols-2">
						{sessions.map((session) => (
							<article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" key={session.id}>
								<div className="flex items-start justify-between gap-3">
									<div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><MonitorSmartphone className="size-5" /></span><div className="min-w-0"><h2 className="truncate font-semibold text-slate-950 dark:text-white">{sessionTitle(session)}</h2><p className="text-xs text-slate-500 dark:text-slate-400">{session.isCurrent ? 'This device' : session.isActive ? 'Active session' : 'Signed out'}</p></div></div>
									{session.isCurrent && <span className="inline-flex items-center gap-1 rounded-full bg-brand-muted/20 px-2 py-1 text-xs font-medium text-brand-primary dark:text-brand-muted"><ShieldCheck className="size-3.5" />Current</span>}
								</div>
								<dl className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
									<div className="flex gap-2"><Laptop className="mt-0.5 size-4 shrink-0" /><div><dt className="sr-only">Software</dt><dd>{[session.browserName, session.browserVersion].filter(Boolean).join(' ') || 'Unknown browser'} · {[session.osName, session.osVersion].filter(Boolean).join(' ') || 'Unknown OS'}</dd></div></div>
									<div className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" /><div><dt className="sr-only">Location</dt><dd>{session.location || 'Location unavailable'}{session.timezone ? ` · ${session.timezone}` : ''}</dd></div></div>
									<div className="flex gap-2"><Wifi className="mt-0.5 size-4 shrink-0" /><div><dt className="sr-only">Network</dt><dd>{session.ipAddress || 'IP unavailable'}{session.networkName ? ` · ${session.networkName}` : ''}{session.networkAsn ? ` (${session.networkAsn})` : ''}</dd></div></div>
									<div className="flex gap-2"><Clock3 className="mt-0.5 size-4 shrink-0" /><div><dt className="sr-only">Activity</dt><dd>Last active {formatDate(session.lastActiveAt)}<span className="block text-xs text-slate-500 dark:text-slate-400">Signed in {formatDate(session.signedInAt)}</span></dd></div></div>
								</dl>
								<div className="mt-5 flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"><button className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800" disabled={busyId === session.id} onClick={() => void renameSession(session)} type="button"><Pencil className="size-4" />Rename</button>{session.isActive && <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50" disabled={busyId === session.id} onClick={() => void revokeSession(session)} type="button"><LogOut className="size-4" />Sign out</button>}</div>
							</article>
						))}
						{sessions.length === 0 && <p className="col-span-full rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-600 dark:border-slate-700 dark:text-slate-300">No sessions are available.</p>}
					</div>
				)}
			</div>
		</main>
	);
}
