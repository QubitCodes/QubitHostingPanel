import { zodResolver } from '@hookform/resolvers/zod';
import { Activity, Ban, Database, Gauge, HardDrive, LoaderCircle, LockKeyhole, RefreshCw, SearchCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { cancelDatabaseSessionSchema, type CancelDatabaseSessionRequest } from '@schemas/databaseDiagnostics';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface DiagnosticSession { durationMs: number; id: string; queryFingerprint: string | null; state: string; statementType: string | null; waitEvent: string | null }
interface DiagnosticLock { granted: boolean; mode: string; objectName: string | null; sessionId: string }
interface DiagnosticIndex { indexName: string; scans: number | null; schemaName: string; sizeBytes: number | null; tableName: string; unused: boolean | null }
interface DiagnosticTableStorage { schemaName: string; sizeBytes: number; tableName: string }
interface Diagnostics {
	collectedAt: string;
	connections: { active: number; idle: number; serverMaximum: number | null; total: number };
	databaseSizeBytes: number;
	engine: 'mysql' | 'postgresql';
	indexes: DiagnosticIndex[];
	locks: DiagnosticLock[];
	sessions: DiagnosticSession[];
	slowThresholdSeconds: number;
	tableStorage: DiagnosticTableStorage[];
	warnings: string[];
}
interface ApiBody<T> { data?: T; message: string; status: boolean }
interface Props { databaseId: string; databaseName: string; workspacePublicId: number }

const INPUT_CLASS = 'w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 outline-none focus:border-brand-action dark:bg-gray-800 dark:text-gray-100';

function formatBytes(value: number): string {
	if (value < 1024) return `${value} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let size = value / 1024;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
	return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
}

function formatDuration(value: number): string {
	if (value < 1000) return `${value} ms`;
	if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
	return `${Math.floor(value / 60_000)}m ${Math.floor((value % 60_000) / 1000)}s`;
}

/** Live database health surface with privacy-preserving query metadata and safe cancellation. */
export function DatabaseDiagnostics({ databaseId, databaseName, workspacePublicId }: Props) {
	const location = useLocation();
	const navigate = useNavigate();
	const [data, setData] = useState<Diagnostics>();
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [threshold, setThreshold] = useState(5);
	const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
	const selectedSession = data?.sessions.find(({ id }) => id === query.get('session'));
	const basePage = `/database/${databaseId}/diagnostics`;
	const baseApi = `/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}/diagnostics`;
	const load = useCallback(async () => {
		setLoading(true);
		try {
			const response = await authenticatedFetch(`${baseApi}?slowThresholdSeconds=${threshold}`);
			const body = await response.json() as ApiBody<Diagnostics>;
			if (!response.ok || !body.status || !body.data) throw new Error(body.message);
			setData(body.data);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to load database diagnostics.');
		} finally {
			setLoading(false);
		}
	}, [baseApi, threshold]);
	useEffect(() => {
		const timeout = window.setTimeout(() => { void load(); }, 0);
		return () => window.clearTimeout(timeout);
	}, [load]);
	return <section>
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Live engine signals</p><h2 className="mt-1 text-3xl font-black">Diagnostics</h2><p className="mt-2 max-w-3xl text-sm text-app-muted">Inspect connections, long-running queries, locks, storage, and index activity. Query text and result values never leave the database.</p></div>
			<div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-bold text-app-muted">Slow-query threshold<select className="rounded-xl border border-brand-primary/15 bg-app-surface px-3 py-2.5 text-sm text-app-text" onChange={(event) => setThreshold(Number(event.target.value))} value={threshold}>{[1, 5, 10, 30, 60].map((value) => <option key={value} value={value}>{value} seconds</option>)}</select></label><button aria-label="Refresh diagnostics" className="grid size-11 place-items-center rounded-xl border border-brand-primary/15" disabled={loading} onClick={() => void load()} type="button"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
		</div>
		{loading && !data ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="size-8 animate-spin text-brand-primary" /></div> : data && <>
			<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<Metric icon={HardDrive} label="Database size" value={formatBytes(data.databaseSizeBytes)} />
				<Metric icon={Activity} label="Connections" value={`${data.connections.total} database`} hint={`${data.connections.active} active · ${data.connections.idle} idle`} />
				<Metric icon={Gauge} label="Server capacity" value={data.connections.serverMaximum === null ? 'Unavailable' : `${data.connections.serverMaximum} maximum`} />
				<Metric icon={LockKeyhole} label="Waiting locks" value={String(data.locks.filter(({ granted }) => !granted).length)} hint={`${data.locks.length} observed locks`} />
			</div>
			{data.warnings.length > 0 && <div className="mt-5 grid gap-2">{data.warnings.map((warning) => <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200" key={warning}>{warning}</p>)}</div>}
			<section className="mt-6 rounded-2xl border border-brand-primary/10 bg-app-surface p-5"><div className="flex items-center gap-3"><SearchCheck className="size-5 text-brand-primary dark:text-brand-action" /><div><h3 className="text-xl font-black">Long-running Queries</h3><p className="text-sm text-app-muted">Active for at least {data.slowThresholdSeconds} seconds. Fingerprints identify repeated statements without exposing their contents.</p></div></div><div className="mt-4 overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead><tr className="border-b border-brand-primary/10 text-xs uppercase text-app-muted"><th className="p-3">Session</th><th className="p-3">Type</th><th className="p-3">Duration</th><th className="p-3">State</th><th className="p-3">Fingerprint</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{data.sessions.map((session) => <tr className="border-b border-brand-primary/5" key={session.id}><td className="p-3 font-mono">{session.id}</td><td className="p-3">{session.statementType ?? 'Unknown'}</td><td className="p-3">{formatDuration(session.durationMs)}</td><td className="p-3"><span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold">{session.waitEvent ?? session.state}</span></td><td className="max-w-48 truncate p-3 font-mono text-xs" title={session.queryFingerprint ?? undefined}>{session.queryFingerprint?.slice(0, 16) ?? 'Unavailable'}</td><td className="p-3 text-right"><button className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 font-bold text-red-600 dark:text-red-300" onClick={() => navigate(`${basePage}?action=cancel&session=${session.id}`)} type="button"><Ban className="size-4" />Cancel</button></td></tr>)}{data.sessions.length === 0 && <tr><td className="p-8 text-center text-app-muted" colSpan={6}>No queries exceed the selected threshold.</td></tr>}</tbody></table></div></section>
			<div className="mt-6 grid gap-6 xl:grid-cols-2"><DiagnosticTable title="Largest Tables" empty="No table storage statistics available." headings={['Table', 'Size']} rows={data.tableStorage.map((item) => [`${item.schemaName}.${item.tableName}`, formatBytes(item.sizeBytes)])} /><DiagnosticTable title="Index Activity" empty="No index-usage signals available." headings={['Index', 'Scans', 'Size']} rows={data.indexes.map((item) => [`${item.schemaName}.${item.tableName}.${item.indexName}`, item.scans === null ? 'Unavailable' : String(item.scans), item.sizeBytes === null ? 'Unavailable' : formatBytes(item.sizeBytes)])} /></div>
			<section className="mt-6 rounded-2xl border border-brand-primary/10 bg-app-surface p-5"><h3 className="text-xl font-black">Lock Activity</h3><p className="mt-1 text-sm text-app-muted">Current locks visible to the restricted database login.</p><div className="mt-4 overflow-x-auto"><table className="min-w-[600px] w-full text-left text-sm"><thead><tr className="border-b border-brand-primary/10 text-xs uppercase text-app-muted"><th className="p-3">Session</th><th className="p-3">Object</th><th className="p-3">Mode</th><th className="p-3">State</th></tr></thead><tbody>{data.locks.map((lock, index) => <tr className="border-b border-brand-primary/5" key={`${lock.sessionId}-${lock.mode}-${index}`}><td className="p-3 font-mono">{lock.sessionId}</td><td className="p-3 font-mono text-xs">{lock.objectName ?? 'Database'}</td><td className="p-3">{lock.mode}</td><td className="p-3">{lock.granted ? 'Granted' : 'Waiting'}</td></tr>)}{data.locks.length === 0 && <tr><td className="p-8 text-center text-app-muted" colSpan={4}>No lock details available.</td></tr>}</tbody></table></div></section>
			<p className="mt-4 text-xs text-app-muted">Collected {new Date(data.collectedAt).toLocaleString()}. Refresh for current state.</p>
		</>}
		{query.get('action') === 'cancel' && selectedSession && <CancelDialog busy={busy} databaseName={databaseName} onCancel={() => navigate(basePage, { replace: true })} onSubmit={async (input) => { setBusy(true); try { const response = await authenticatedFetch(baseApi, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); const body = await response.json() as ApiBody<{ cancelled: boolean }>; if (!response.ok || !body.status || !body.data?.cancelled) throw new Error(body.message); toast.success('Database query cancelled.'); navigate(basePage, { replace: true }); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to cancel query.'); } finally { setBusy(false); } }} session={selectedSession} />}
	</section>;
}

function Metric({ hint, icon: Icon, label, value }: { hint?: string; icon: typeof Database; label: string; value: string }) {
	return <article className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5"><Icon className="size-5 text-brand-primary dark:text-brand-action" /><p className="mt-5 text-xs font-bold uppercase text-app-muted">{label}</p><strong className="mt-1 block text-xl">{value}</strong>{hint && <p className="mt-1 text-xs text-app-muted">{hint}</p>}</article>;
}

function DiagnosticTable({ empty, headings, rows, title }: { empty: string; headings: string[]; rows: string[][]; title: string }) {
	return <section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5"><h3 className="text-xl font-black">{title}</h3><div className="mt-4 overflow-x-auto"><table className="min-w-[520px] w-full text-left text-sm"><thead><tr className="border-b border-brand-primary/10 text-xs uppercase text-app-muted">{headings.map((heading) => <th className="p-3" key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr className="border-b border-brand-primary/5" key={`${row[0]}-${rowIndex}`}>{row.map((cell, cellIndex) => <td className={cellIndex === 0 ? 'max-w-72 truncate p-3 font-mono text-xs' : 'p-3'} key={`${cell}-${cellIndex}`} title={cellIndex === 0 ? cell : undefined}>{cell}</td>)}</tr>)}{rows.length === 0 && <tr><td className="p-8 text-center text-app-muted" colSpan={headings.length}>{empty}</td></tr>}</tbody></table></div></section>;
}

function CancelDialog({ busy, databaseName, onCancel, onSubmit, session }: { busy: boolean; databaseName: string; onCancel: () => void; onSubmit: (input: CancelDatabaseSessionRequest) => Promise<void>; session: DiagnosticSession }) {
	const { control, handleSubmit } = useForm<CancelDatabaseSessionRequest>({ resolver: zodResolver(cancelDatabaseSessionSchema), defaultValues: { confirmation: '', sessionId: session.id } });
	return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog"><form className="w-full max-w-lg rounded-3xl bg-app-surface p-6 shadow-2xl" onSubmit={(event) => void handleSubmit(onSubmit)(event)}><Ban className="size-7 text-red-500" /><h3 className="mt-4 text-2xl font-black">Cancel Active Query</h3><p className="mt-2 text-sm text-app-muted">This requests cancellation of session <strong>{session.id}</strong>. The transaction may roll back. Type <strong className="text-app-text">{databaseName}</strong> to confirm.</p><Controller control={control} name="confirmation" render={({ field, fieldState }) => <label className="mt-5 block text-sm font-bold">Database confirmation<input {...field} className={`${INPUT_CLASS} mt-2`} />{fieldState.error && <span className="mt-1 block text-xs text-red-500">{fieldState.error.message}</span>}</label>} /><div className="mt-6 flex flex-wrap justify-end gap-3"><button className="rounded-xl border border-brand-primary/15 px-5 py-3 font-bold" disabled={busy} onClick={onCancel} type="button">Keep Running</button><button className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-bold text-white" disabled={busy} type="submit">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Ban className="size-4" />}Cancel Query</button></div></form></div>;
}
