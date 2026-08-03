import { ArrowLeft, CheckCircle2, Database, LoaderCircle, Plus, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Cluster {
	backupConfigurationUuid?: string | null;
	backupStatus?: string | null;
	code: string;
	createdAt: string;
	engine: 'mysql' | 'postgresql';
	engineVersion: string;
	internalHost: string;
	lastHealthCheckedAt?: string | null;
	lastHealthError?: string | null;
	limitsCpus?: string | null;
	limitsMemory?: string | null;
	maximumDatabases: number;
	name: string;
	port: number;
	providerResourceId: string;
	status: string;
}

interface ApiBody<T> { data?: T; message: string; status: boolean }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = await response.json() as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined) throw new Error(body.message);
	return body.data;
}

export default function DatabaseClustersPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const { clusterCode, section } = useParams();
	const creating = location.pathname.endsWith('/create');
	const [clusters, setClusters] = useState<Cluster[]>([]);
	const [cluster, setCluster] = useState<Cluster>();
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		setLoading(true); setError('');
		try {
			if (clusterCode) setCluster(await api<Cluster>(`/api/v1/operations/database-clusters/${clusterCode}`));
			else if (!creating) setClusters(await api<Cluster[]>('/api/v1/operations/database-clusters'));
		} catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load database clusters.'); }
		finally { setLoading(false); }
	}, [clusterCode, creating]);

	useEffect(() => {
		const timeout = window.setTimeout(() => { void load(); }, 0);
		return () => window.clearTimeout(timeout);
	}, [load]);

	async function createCluster(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault(); setSubmitting(true);
		const form = new FormData(event.currentTarget);
		try {
			const created = await api<Cluster>('/api/v1/operations/database-clusters', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: form.get('code'), engine: form.get('engine'), name: form.get('name'), maximumDatabases: Number(form.get('maximumDatabases')), limitsMemory: form.get('limitsMemory'), limitsCpus: form.get('limitsCpus') }) });
			toast.success('Database cluster provisioning started.'); navigate(`/admin/operations/database-clusters/${created.code}`);
		} catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Unable to create cluster.'); }
		finally { setSubmitting(false); }
	}

	async function validateCluster(): Promise<void> {
		if (!cluster) return; setSubmitting(true);
		try { const result = await api<{ connected: boolean; status: string }>(`/api/v1/operations/database-clusters/${cluster.code}/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); toast.success(result.connected ? 'Cluster is healthy.' : `Cluster status: ${result.status}`); await load(); }
		catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Cluster validation failed.'); }
		finally { setSubmitting(false); }
	}

	async function updateCluster(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault(); if (!cluster) return; setSubmitting(true); const form = new FormData(event.currentTarget);
		try { await api<Cluster>(`/api/v1/operations/database-clusters/${cluster.code}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maximumDatabases: Number(form.get('maximumDatabases')), status: form.get('status') }) }); toast.success('Cluster settings updated.'); await load(); }
		catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Unable to update cluster.'); }
		finally { setSubmitting(false); }
	}

	async function configureBackup(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault(); if (!cluster) return; setSubmitting(true); const form = new FormData(event.currentTarget); const s3StorageUuid = String(form.get('s3StorageUuid') ?? '').trim();
		try { await api<{ uuid: string }>(`/api/v1/operations/database-clusters/${cluster.code}/backups`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ frequency: form.get('frequency'), ...(s3StorageUuid ? { s3StorageUuid } : {}) }) }); toast.success('Backup policy configured.'); await load(); }
		catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Unable to configure backup.'); }
		finally { setSubmitting(false); }
	}

	if (creating) return <div className="mx-auto max-w-3xl"><Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary dark:text-brand-action" to="/admin/operations/database-clusters"><ArrowLeft className="size-4" />Database clusters</Link><h2 className="mt-5 text-4xl font-black">Create shared cluster</h2><p className="mt-2 text-app-muted">Private Coolify database service. Credentials are generated and encrypted by the panel.</p><form className="mt-8 grid gap-5 rounded-3xl border border-brand-primary/10 bg-app-surface p-6 sm:grid-cols-2" onSubmit={(event) => void createCluster(event)}><label className="grid gap-2 text-sm font-semibold">Name<input className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" name="name" required /></label><label className="grid gap-2 text-sm font-semibold">Code<input className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" name="code" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="postgres-primary" required /></label><label className="grid gap-2 text-sm font-semibold">Engine<select className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" name="engine"><option value="postgresql">PostgreSQL 18.4</option><option value="mysql">MySQL 8.0.46</option></select></label><label className="grid gap-2 text-sm font-semibold">Database capacity<input className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" defaultValue="250" min="1" name="maximumDatabases" required type="number" /></label><label className="grid gap-2 text-sm font-semibold">Memory limit<input className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" defaultValue="1g" name="limitsMemory" pattern="\d+(?:m|g)" required /></label><label className="grid gap-2 text-sm font-semibold">CPU limit<input className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" defaultValue="1" min="0.1" name="limitsCpus" required step="0.1" type="number" /></label><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink sm:col-span-2" disabled={submitting} type="submit">{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Create cluster</button></form></div>;

	if (clusterCode) {
		if (loading) return <LoaderCircle className="size-6 animate-spin" />;
		if (error || !cluster) return <p className="rounded-xl bg-rose-500/10 p-4 text-rose-600 dark:text-rose-300">{error || 'Cluster not found.'}</p>;
		const currentSection = section ?? 'overview';
		return <div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary dark:text-brand-action" to="/admin/operations/database-clusters"><ArrowLeft className="size-4" />Database clusters</Link><h2 className="mt-4 text-4xl font-black">{cluster.name}</h2><p className="mt-2 text-app-muted">{cluster.engine === 'postgresql' ? 'PostgreSQL' : 'MySQL'} {cluster.engineVersion} · {cluster.code}</p></div><button className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold" disabled={submitting} onClick={() => void validateCluster()} type="button"><ShieldCheck className="size-4" />Validate health</button></div><nav className="mt-7 flex gap-2 overflow-x-auto border-b border-brand-primary/10">{[['overview', 'Overview'], ['settings', 'Settings'], ['backups', 'Backups']].map(([value, label]) => <NavLink className={() => `shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${currentSection === value ? 'border-brand-action text-brand-primary dark:text-brand-action' : 'border-transparent text-app-muted'}`} key={value} to={value === 'overview' ? `/admin/operations/database-clusters/${cluster.code}` : `/admin/operations/database-clusters/${cluster.code}/${value}`}>{label}</NavLink>)}</nav>{currentSection === 'overview' && <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Status', cluster.status], ['Internal endpoint', `${cluster.internalHost}:${cluster.port}`], ['Capacity', `${cluster.maximumDatabases} databases`], ['Resources', `${cluster.limitsMemory ?? 'default'} RAM · ${cluster.limitsCpus ?? 'default'} CPU`]].map(([label, value]) => <article className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5" key={label}><p className="text-xs font-bold uppercase tracking-wider text-app-muted">{label}</p><p className="mt-2 break-all font-bold">{value}</p></article>)}{cluster.lastHealthError && <p className="rounded-xl bg-rose-500/10 p-4 text-rose-600 sm:col-span-2 lg:col-span-4">{cluster.lastHealthError}</p>}</div>}{currentSection === 'settings' && <form className="mt-6 grid max-w-2xl gap-5 rounded-3xl border border-brand-primary/10 bg-app-surface p-6 sm:grid-cols-2" onSubmit={(event) => void updateCluster(event)}><label className="grid gap-2 text-sm font-semibold">Maximum databases<input className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" defaultValue={cluster.maximumDatabases} min="1" name="maximumDatabases" required type="number" /></label><label className="grid gap-2 text-sm font-semibold">Lifecycle status<select className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" defaultValue={cluster.status} name="status"><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="unavailable">Unavailable</option><option value="retired">Retired</option></select></label><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink sm:col-span-2" disabled={submitting} type="submit"><Save className="size-4" />Save settings</button></form>}{currentSection === 'backups' && <form className="mt-6 grid max-w-2xl gap-5 rounded-3xl border border-brand-primary/10 bg-app-surface p-6" onSubmit={(event) => void configureBackup(event)}><div className="flex items-center gap-3"><CheckCircle2 className="size-5 text-brand-action" /><div><h3 className="font-bold">Coolify scheduled backups</h3><p className="text-sm text-app-muted">Current status: {cluster.backupStatus ?? 'not configured'}</p></div></div><label className="grid gap-2 text-sm font-semibold">Cron frequency<input className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" defaultValue="0 2 * * *" name="frequency" required /></label><label className="grid gap-2 text-sm font-semibold">Coolify S3 storage UUID <span className="font-normal text-app-muted">Optional</span><input className="rounded-xl border border-brand-primary/15 bg-app-bg px-4 py-3" name="s3StorageUuid" /></label><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" disabled={submitting} type="submit"><Save className="size-4" />Configure backup</button></form>}</div>;
	}

	return <div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Shared data services</p><h2 className="mt-2 text-4xl font-black">Database clusters</h2><p className="mt-2 text-app-muted">Capacity, health, and backups for shared PostgreSQL and MySQL.</p></div><div className="flex gap-2"><button aria-label="Refresh clusters" className="grid size-11 place-items-center rounded-xl border border-brand-primary/15" onClick={() => void load()} type="button"><RefreshCw className="size-4" /></button><Link className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" to="/admin/operations/database-clusters/create"><Plus className="size-4" />Create cluster</Link></div></div>{loading && <LoaderCircle className="mt-10 size-6 animate-spin" />}{error && <p className="mt-6 rounded-xl bg-rose-500/10 p-4 text-rose-600 dark:text-rose-300">{error}</p>}{!loading && !error && <div className="mt-7 grid gap-4 lg:grid-cols-2">{clusters.map((item) => <Link className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6 transition hover:border-brand-action" key={item.code} to={`/admin/operations/database-clusters/${item.code}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-brand-action/15 text-brand-primary dark:text-brand-action"><Database className="size-5" /></span><div><h3 className="text-xl font-bold">{item.name}</h3><p className="text-sm text-app-muted">{item.code}</p></div></div><span className="rounded-full bg-brand-action/10 px-3 py-1 text-xs font-bold capitalize">{item.status}</span></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><p><span className="block text-app-muted">Engine</span>{item.engine} {item.engineVersion}</p><p><span className="block text-app-muted">Capacity</span>{item.maximumDatabases} databases</p></div></Link>)}{clusters.length === 0 && <p className="rounded-2xl border border-dashed border-brand-primary/20 p-8 text-center text-app-muted lg:col-span-2">No shared database clusters registered yet.</p>}</div>}</div>;
}
