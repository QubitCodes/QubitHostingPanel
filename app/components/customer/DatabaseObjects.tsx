import { ArrowLeft, Braces, CalendarClock, ChevronRight, LoaderCircle, Workflow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

type ObjectKind = 'event' | 'function' | 'materialized_view' | 'procedure' | 'sequence' | 'trigger' | 'view';
interface DatabaseObject { definition: string | null; kind: ObjectKind; name: string; schema: string; tableName: string | null }
interface ApiBody { data?: { databaseName: string; objects: DatabaseObject[] }; message: string; status: boolean }
interface Props { basePath?: string; databaseId: string; workspacePublicId: number }

const labels: Record<ObjectKind, string> = {
	event: 'Events',
	function: 'Functions',
	materialized_view: 'Materialized Views',
	procedure: 'Procedures',
	sequence: 'Sequences',
	trigger: 'Triggers',
	view: 'Views',
};

/** Read-only URL-addressable browser for routines and other database objects. */
export function DatabaseObjects({ basePath: providedBasePath, databaseId, workspacePublicId }: Props) {
	const navigate = useNavigate();
	const { objectKind, objectName, schemaName } = useParams();
	const [objects, setObjects] = useState<DatabaseObject[]>([]);
	const [loading, setLoading] = useState(true);
	const basePath = `${providedBasePath ?? `/dashboard/databases/${databaseId}`}/objects`;
	const loadObjects = useCallback(async () => {
		setLoading(true);
		try {
			const response = await authenticatedFetch(`/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}/explorer/advanced`);
			const body = await response.json() as ApiBody;
			if (!response.ok || !body.status || !body.data) throw new Error(body.message);
			setObjects(body.data.objects);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to read database objects.');
		} finally {
			setLoading(false);
		}
	}, [databaseId, workspacePublicId]);
	useEffect(() => {
		const timeout = window.setTimeout(() => void loadObjects(), 0);
		return () => window.clearTimeout(timeout);
	}, [loadObjects]);
	const selected = objectKind && objectName && schemaName
		? objects.find((object) => object.kind === objectKind && object.name === decodeURIComponent(objectName) && object.schema === decodeURIComponent(schemaName))
		: undefined;
	const grouped = useMemo(() => Object.entries(labels).map(([kind, label]) => ({
		kind: kind as ObjectKind,
		label,
		objects: objects.filter((object) => object.kind === kind),
	})), [objects]);

	if (loading) return <div className="grid min-h-80 place-items-center"><LoaderCircle className="size-7 animate-spin text-brand-primary dark:text-brand-action" /></div>;
	if (objectKind && objectName && schemaName && !selected) return <div className="rounded-2xl border border-dashed border-brand-primary/20 p-8 text-center"><p className="font-bold">Database object not found.</p><button className="mt-4 text-sm font-bold text-brand-primary dark:text-brand-action" onClick={() => navigate(basePath)} type="button">Back to Objects</button></div>;
	if (selected) return <section>
		<button className="inline-flex items-center gap-2 text-sm font-bold text-brand-primary dark:text-brand-action" onClick={() => navigate(basePath)} type="button"><ArrowLeft className="size-4" />All Objects</button>
		<div className="mt-5 rounded-2xl border border-brand-primary/10 bg-app-surface p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-app-muted">{selected.schema} / {selected.kind}</p><h3 className="mt-1 break-all text-2xl font-black">{selected.name}</h3>{selected.tableName && <p className="mt-1 text-sm text-app-muted">Attached to {selected.tableName}</p>}</div><span className="rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-bold capitalize text-brand-primary dark:text-brand-action">Read only</span></div><pre className="mt-6 max-h-[60vh] overflow-auto rounded-xl bg-slate-950 p-5 text-xs leading-6 text-slate-100"><code>{selected.definition ?? 'The database does not expose a definition for this object.'}</code></pre></div>
	</section>;
	return <section><div className="flex items-center gap-3"><Workflow className="size-5 text-brand-primary dark:text-brand-action" /><div><h3 className="text-xl font-black">Database Objects</h3><p className="text-sm text-app-muted">Inspect routines and automation safely. Editing is intentionally disabled for now.</p></div></div><div className="mt-6 grid gap-6 xl:grid-cols-2">{grouped.map((group) => <article className="overflow-hidden rounded-2xl border border-brand-primary/10" key={group.kind}><header className="flex items-center justify-between bg-brand-primary/5 px-5 py-4"><span className="flex items-center gap-2 font-black">{group.kind === 'event' ? <CalendarClock className="size-4" /> : <Braces className="size-4" />}{group.label}</span><span className="rounded-full bg-app-surface px-2.5 py-1 text-xs font-bold">{group.objects.length}</span></header><div className="divide-y divide-brand-primary/10">{group.objects.map((object) => <Link className="group flex items-center gap-3 p-4 transition hover:bg-brand-primary/5" key={`${object.schema}.${object.name}`} to={`${basePath}/${object.kind}/${encodeURIComponent(object.schema)}/${encodeURIComponent(object.name)}`}><span className="min-w-0 flex-1"><strong className="block truncate">{object.name}</strong><span className="text-xs text-app-muted">{object.schema}{object.tableName ? ` / ${object.tableName}` : ''}</span></span><ChevronRight className="size-4 text-app-muted transition group-hover:translate-x-1" /></Link>)}{!group.objects.length && <p className="p-5 text-sm text-app-muted">No {group.label.toLowerCase()} found.</p>}</div></article>)}</div></section>;
}
