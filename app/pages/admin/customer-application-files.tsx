import { ArrowLeft, File, Folder, LoaderCircle, Play, RefreshCw, RotateCw, ShieldAlert, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface TreeItem { path: string; size?: number; type: 'blob' | 'tree' }
interface Tree { branch: string; files: TreeItem[]; repository: string }
interface Preview { content: string; path: string; sensitive: boolean; size: number }
type LifecycleAction = 'redeploy' | 'restart' | 'start' | 'stop' | 'suspend' | 'unsuspend';

const SENSITIVE = /(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?\.(?:json|ya?ml))$/i;
const CONTROLS = [{ action: 'start', icon: Play, label: 'Start' }, { action: 'stop', icon: Square, label: 'Stop' }, { action: 'restart', icon: RotateCw, label: 'Restart' }, { action: 'redeploy', icon: RefreshCw, label: 'Redeploy' }, { action: 'suspend', icon: Square, label: 'Suspend' }, { action: 'unsuspend', icon: Play, label: 'Unsuspend' }] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = await response.json() as { data?: T; message: string; status: boolean };
	if (!response.ok || !body.status || body.data === undefined) throw new Error(body.message);
	return body.data;
}

export default function CustomerApplicationFilesPage() {
	const { applicationId, userId, workspaceId } = useParams();
	const resourceBase = `/api/v1/operations/users/${userId}/workspaces/${workspaceId}/applications/${applicationId}`;
	const [tree, setTree] = useState<Tree>();
	const [preview, setPreview] = useState<Preview>();
	const [query, setQuery] = useState('');
	const [busy, setBusy] = useState(true);
	const [controlling, setControlling] = useState<LifecycleAction>();

	useEffect(() => {
		void api<Tree>(`${resourceBase}/files`).then(setTree).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to load repository files.')).finally(() => setBusy(false));
	}, [resourceBase]);

	const rows = useMemo(() => (tree?.files ?? []).filter((item) => item.path.toLowerCase().includes(query.toLowerCase())).slice(0, 2000), [query, tree]);

	async function read(item: TreeItem) {
		if (item.type !== 'blob') return;
		const sensitive = SENSITIVE.test(item.path);
		const reason = sensitive ? window.prompt('Reason for viewing this sensitive file:') : undefined;
		if (sensitive && !reason) return;
		try {
			setPreview(await api<Preview>(`${resourceBase}/files`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: item.path, reason }) }));
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to read file.'); }
	}

	async function control(action: LifecycleAction) {
		const reason = window.prompt(`Reason for requesting ${action}:`);
		if (!reason) return;
		try {
			setControlling(action);
			await api(`${resourceBase}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, reason }) });
			toast.success(`Application ${action} requested.`);
		} catch (error) { toast.error(error instanceof Error ? error.message : `Unable to ${action} application.`); }
		finally { setControlling(undefined); }
	}

	return <section>
		<Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary dark:text-brand-action" to={`/admin/customers/users/${userId}/workspaces/${workspaceId}`}><ArrowLeft className="size-4" />Workspace resources</Link>
		<div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-4xl font-black">Project source files</h1><p className="mt-2 text-app-muted">{tree ? `${tree.repository} · ${tree.branch}` : 'Loading repository…'}</p></div><div className="flex flex-wrap gap-2">{CONTROLS.map(({ action, icon: Icon, label }) => <button className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 bg-app-surface px-3 py-2 text-sm font-bold hover:bg-brand-primary/5 disabled:opacity-50" disabled={Boolean(controlling)} key={action} onClick={() => void control(action)} type="button">{controlling === action ? <LoaderCircle className="size-4 animate-spin" /> : <Icon className="size-4" />}{label}</button>)}</div></div>
		<p className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"><ShieldAlert className="size-4" />Every listing, file read, and lifecycle request is audited. Sensitive files require a separate permission and reason. Contents are never written to audit logs.</p>
		<input className="mt-5 w-full max-w-xl rounded-xl border border-brand-primary/15 bg-app-surface px-4 py-3" onChange={(event) => setQuery(event.target.value)} placeholder="Filter paths" value={query} />
		{busy ? <LoaderCircle className="mt-8 size-6 animate-spin" /> : <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]"><div className="max-h-[65vh] overflow-auto rounded-2xl border border-brand-primary/10 bg-app-surface p-3">{rows.map((item) => <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-primary/5" key={`${item.type}:${item.path}`} onClick={() => void read(item)} type="button">{item.type === 'tree' ? <Folder className="size-4 shrink-0" /> : <File className="size-4 shrink-0" />}<span className="min-w-0 flex-1 truncate">{item.path}</span>{SENSITIVE.test(item.path) && <ShieldAlert className="size-3 text-amber-600" />}</button>)}</div><div className="min-h-64 overflow-hidden rounded-2xl border border-brand-primary/10 bg-gray-950 text-gray-100">{preview ? <><div className="border-b border-white/10 px-4 py-3 text-sm font-bold">{preview.path} · {preview.size} bytes</div><pre className="max-h-[60vh] overflow-auto whitespace-pre p-4 text-xs">{preview.content}</pre></> : <p className="p-6 text-sm text-gray-400">Select a file to preview.</p>}</div></div>}
	</section>;
}
