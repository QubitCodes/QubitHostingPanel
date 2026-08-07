import { ArrowLeft, ChevronDown, ChevronRight, Columns3, Edit3, Folder, LoaderCircle, Plus, Rows3, Search, Table2, Trash2, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { DataTable } from '@components/ui/data-table';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface DatabaseObject { estimatedRows: number | null; kind: 'materialized_view' | 'table' | 'view'; name: string; schema: string }
interface DatabaseColumn { dataType: string; defaultValue: string | null; isGenerated: boolean; isIdentity: boolean; isNullable: boolean; isPrimaryKey: boolean; name: string; ordinal: number }
interface DatabaseIndex { definition: string; isPrimary: boolean; isUnique: boolean; name: string }
interface DatabaseStructure { columns: DatabaseColumn[]; indexes: DatabaseIndex[]; kind: DatabaseObject['kind']; name: string; schema: string }
interface ObjectResponse { databaseName: string; objects: DatabaseObject[]; structure: DatabaseStructure | null }
interface RowsResponse { columns: DatabaseColumn[]; page: number; pageSize: number; rows: Array<Record<string, unknown>>; sortColumn: string | null; sortDirection: 'asc' | 'desc'; totalRows: number }
interface ApiBody<T> { data?: T; message: string; status: boolean }
interface Props { basePath?: string; databaseId: string; workspacePublicId: number }

async function api<T>(path: string): Promise<T> {
	const response = await authenticatedFetch(path);
	const body = await response.json() as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined) throw new Error(body.message);
	return body.data;
}

async function mutate<T>(path: string, method: 'DELETE' | 'PATCH' | 'POST', body: unknown): Promise<T> {
	const response = await authenticatedFetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	const payload = await response.json() as ApiBody<T>;
	if (!response.ok || !payload.status || payload.data === undefined) throw new Error(payload.message);
	return payload.data;
}

function displayValue(value: unknown): string {
	if (value === null) return 'NULL';
	if (value === undefined) return '—';
	return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function inputValue(value: unknown): string {
	if (value === null || value === undefined) return '';
	return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function parseInputValue(value: string, dataType: string): unknown {
	if (/json/i.test(dataType)) return JSON.parse(value);
	if (/bool/i.test(dataType)) return value === 'true';
	// Keep numeric input as text. PostgreSQL/MySQL perform the final cast without
	// losing bigint or decimal precision through JavaScript's Number type.
	return value;
}

/** URL-addressable database object browser, row viewer, and guarded row editor. */
export function DatabaseExplorer({ basePath, databaseId, workspacePublicId }: Props) {
	const navigate = useNavigate();
	const { schemaName, tableName, tableSection } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const [objects, setObjects] = useState<DatabaseObject[]>([]);
	const [structure, setStructure] = useState<DatabaseStructure | null>(null);
	const [rows, setRows] = useState<RowsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
	const baseApi = `/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}/explorer`;
	const basePage = `${basePath ?? `/dashboard/databases/${databaseId}`}/tables`;
	const selectedSchema = schemaName ? decodeURIComponent(schemaName) : undefined;
	const selectedTable = tableName ? decodeURIComponent(tableName) : undefined;
	const activeTableSection = tableSection === 'structure' ? 'structure' : 'data';

	const loadObjects = useCallback(async () => {
		setLoading(true);
		try {
			const query = selectedSchema && selectedTable ? `?schema=${encodeURIComponent(selectedSchema)}&table=${encodeURIComponent(selectedTable)}` : '';
			const result = await api<ObjectResponse>(`${baseApi}/objects${query}`);
			setObjects(result.objects);
			setStructure(result.structure);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to inspect database.');
		} finally {
			setLoading(false);
		}
	}, [baseApi, selectedSchema, selectedTable]);

	const loadRows = useCallback(async () => {
		if (!selectedSchema || !selectedTable || activeTableSection !== 'data') {
			setRows(null);
			return;
		}
		setLoading(true);
		try {
			const query = new URLSearchParams();
			query.set('schema', selectedSchema);
			query.set('table', selectedTable);
			for (const key of ['page', 'pageSize', 'search', 'searchColumn', 'sortColumn', 'sortDirection']) {
				const value = searchParams.get(key);
				if (value) query.set(key, value);
			}
			if (!query.has('page')) query.set('page', '1');
			if (!query.has('pageSize')) query.set('pageSize', '25');
			setRows(await api<RowsResponse>(`${baseApi}/rows?${query.toString()}`));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to read table rows.');
		} finally {
			setLoading(false);
		}
	}, [activeTableSection, baseApi, searchParams, selectedSchema, selectedTable]);

	useEffect(() => {
		const timeout = window.setTimeout(() => void loadObjects(), 0);
		return () => window.clearTimeout(timeout);
	}, [loadObjects]);
	useEffect(() => {
		const timeout = window.setTimeout(() => void loadRows(), 0);
		return () => window.clearTimeout(timeout);
	}, [loadRows]);
	useEffect(() => {
		const timeout = window.setTimeout(() => setSelectedKeys(new Set()), 0);
		return () => window.clearTimeout(timeout);
	}, [selectedSchema, selectedTable]);

	const schemas = useMemo(() => [...new Set(objects.map(({ schema }) => schema))], [objects]);
	const schemaObjects = selectedSchema ? objects.filter(({ schema }) => schema === selectedSchema) : [];
	const pageCount = rows ? Math.max(1, Math.ceil(rows.totalRows / rows.pageSize)) : 1;
	const updateQuery = (values: Record<string, string | undefined>) => {
		const next = new URLSearchParams(searchParams);
		for (const [key, value] of Object.entries(values)) {
			if (value) next.set(key, value);
			else next.delete(key);
		}
		setSearchParams(next);
	};
	const primaryColumns = structure?.columns.filter(({ isPrimaryKey }) => isPrimaryKey) ?? [];
	const canInsert = structure?.kind === 'table';
	const writable = structure?.kind === 'table' && primaryColumns.length > 0;
	const rowKey = (row: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(primaryColumns.map(({ name }) => [name, row[name]]));
	const serialisedKey = (row: Record<string, unknown>): string => JSON.stringify(rowKey(row));
	const action = searchParams.get('action');
	let activeKey: Record<string, unknown> | undefined;
	try {
		const rawKey = searchParams.get('key');
		if (rawKey) activeKey = JSON.parse(rawKey) as Record<string, unknown>;
	} catch {
		activeKey = undefined;
	}
	const activeRow = activeKey && rows?.rows.find((row) => serialisedKey(row) === JSON.stringify(activeKey));
	const mutationColumns = structure?.columns.filter((column) => !column.isGenerated && !column.isIdentity && (action !== 'edit' || !column.isPrimaryKey)) ?? [];

	async function submitRow(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		if (!selectedSchema || !selectedTable || !structure || (action === 'edit' && !activeKey)) return;
		const form = new FormData(event.currentTarget);
		const values: Record<string, unknown> = {};
		try {
			for (const column of mutationColumns) {
				if (form.get(`null:${column.name}`) === 'on') {
					values[column.name] = null;
					continue;
				}
				const raw = String(form.get(`value:${column.name}`) ?? '');
				if (action === 'create' && raw === '' && (column.isNullable || column.defaultValue !== null)) continue;
				values[column.name] = parseInputValue(raw, column.dataType);
			}
			setSubmitting(true);
			await mutate<{ affectedRows: number }>(`${baseApi}/rows`, action === 'create' ? 'POST' : 'PATCH', action === 'create' ? { schema: selectedSchema, table: selectedTable, values } : { schema: selectedSchema, table: selectedTable, key: activeKey, values });
			toast.success(action === 'create' ? 'Row inserted.' : 'Row updated.');
			updateQuery({ action: undefined, key: undefined });
			await loadRows();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to save row.');
		} finally {
			setSubmitting(false);
		}
	}

	async function deleteSelectedRows(): Promise<void> {
		if (!selectedSchema || !selectedTable || !rows) return;
		const keys = activeKey ? [activeKey] : rows.rows.filter((row) => selectedKeys.has(serialisedKey(row))).map(rowKey);
		if (!keys.length) return;
		setSubmitting(true);
		try {
			const result = await mutate<{ affectedRows: number }>(`${baseApi}/rows`, 'DELETE', { schema: selectedSchema, table: selectedTable, keys, acceptedImpact: true });
			toast.success(`${result.affectedRows} row${result.affectedRows === 1 ? '' : 's'} deleted.`);
			setSelectedKeys(new Set());
			updateQuery({ action: undefined, key: undefined });
			await loadRows();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to delete rows.');
		} finally {
			setSubmitting(false);
		}
	}

	if (loading && !objects.length && !structure) return <div className="grid min-h-80 place-items-center"><LoaderCircle className="size-7 animate-spin text-brand-primary dark:text-brand-action" /></div>;

	if (!selectedSchema) return <section><div className="flex items-center gap-3"><Folder className="size-5 text-brand-primary dark:text-brand-action" /><div><h3 className="text-xl font-black">Schemas</h3><p className="text-sm text-app-muted">Open a schema to browse its tables and views.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{schemas.map((schema) => <Link className="group flex items-center gap-4 rounded-2xl border border-brand-primary/10 bg-app-surface p-5 transition hover:border-brand-action" key={schema} to={`${basePage}/${encodeURIComponent(schema)}`}><span className="grid size-11 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary dark:text-brand-action"><Folder className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate">{schema}</strong><span className="text-xs text-app-muted">{objects.filter((item) => item.schema === schema).length} objects</span></span><ChevronRight className="size-5 text-app-muted transition group-hover:translate-x-1" /></Link>)}{!schemas.length && <p className="rounded-2xl border border-dashed border-brand-primary/20 p-8 text-center text-app-muted sm:col-span-2 xl:col-span-3">This database has no user-visible schemas or tables yet.</p>}</div></section>;

	if (!selectedTable) return <section><button className="inline-flex items-center gap-2 text-sm font-bold text-brand-primary dark:text-brand-action" onClick={() => navigate(basePage)} type="button"><ArrowLeft className="size-4" />All Schemas</button><div className="mt-5 flex items-center gap-3"><Folder className="size-5 text-brand-primary dark:text-brand-action" /><div><h3 className="text-xl font-black">{selectedSchema}</h3><p className="text-sm text-app-muted">Tables and views in this schema.</p></div></div><div className="mt-5 overflow-hidden rounded-2xl border border-brand-primary/10"><div className="divide-y divide-brand-primary/10">{schemaObjects.map((object) => <Link className="group flex items-center gap-4 bg-app-surface p-4 transition hover:bg-brand-primary/5" key={`${object.schema}.${object.name}`} to={`${basePage}/${encodeURIComponent(object.schema)}/${encodeURIComponent(object.name)}/data`}><span className="grid size-10 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary dark:text-brand-action">{object.kind === 'table' ? <Table2 className="size-5" /> : <Rows3 className="size-5" />}</span><span className="min-w-0 flex-1"><strong className="block truncate">{object.name}</strong><span className="text-xs capitalize text-app-muted">{object.kind.replaceAll('_', ' ')}{object.estimatedRows === null ? '' : ` · ~${object.estimatedRows.toLocaleString()} rows`}</span></span><ChevronRight className="size-5 text-app-muted transition group-hover:translate-x-1" /></Link>)}{!schemaObjects.length && <p className="p-8 text-center text-app-muted">No objects in this schema.</p>}</div></div></section>;

	const tableBase = `${basePage}/${encodeURIComponent(selectedSchema)}/${encodeURIComponent(selectedTable)}`;
	return <section>
		<button className="inline-flex items-center gap-2 text-sm font-bold text-brand-primary dark:text-brand-action" onClick={() => navigate(`${basePage}/${encodeURIComponent(selectedSchema)}`)} type="button"><ArrowLeft className="size-4" />{selectedSchema}</button>
		<div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase text-app-muted">{structure?.kind.replaceAll('_', ' ') ?? 'Database object'}</p><h3 className="mt-1 text-2xl font-black">{selectedTable}</h3></div><nav className="flex gap-5 border-b border-brand-primary/10"><Link className={`flex items-center gap-2 border-b-2 px-1 pb-3 font-bold ${activeTableSection === 'data' ? 'border-brand-action text-app-text' : 'border-transparent text-app-muted'}`} to={`${tableBase}/data`}><Rows3 className="size-4" />Data</Link><Link className={`flex items-center gap-2 border-b-2 px-1 pb-3 font-bold ${activeTableSection === 'structure' ? 'border-brand-action text-app-text' : 'border-transparent text-app-muted'}`} to={`${tableBase}/structure`}><Columns3 className="size-4" />Structure</Link></nav></div>
		{activeTableSection === 'structure' ? <StructureView structure={structure} /> : <div className="mt-6">
			<div className="mb-4 flex flex-wrap items-center justify-end gap-2">{canInsert && <button className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-4 py-2 font-bold text-brand-ink" onClick={() => updateQuery({ action: 'create', key: undefined })} type="button"><Plus className="size-4" />Insert Row</button>}{writable && <button className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 font-bold text-red-600 disabled:opacity-40 dark:text-red-300" disabled={!selectedKeys.size} onClick={() => updateQuery({ action: 'delete', key: undefined })} type="button"><Trash2 className="size-4" />Delete Selected ({selectedKeys.size})</button>}{structure && !canInsert && <p className="text-sm text-app-muted">Views are read-only.</p>}{canInsert && !writable && <p className="text-sm text-app-muted">Rows can be inserted; edit and delete require a primary key.</p>}</div>
			<form className="grid gap-3 rounded-2xl border border-brand-primary/10 p-4 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); updateQuery({ page: '1', searchColumn: String(form.get('searchColumn') ?? ''), search: String(form.get('search') ?? '') || undefined }); }}><select className="rounded-xl border border-brand-primary/15 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100" defaultValue={searchParams.get('searchColumn') ?? ''} name="searchColumn"><option value="">Choose column</option>{structure?.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select><input className="rounded-xl border border-brand-primary/15 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100" defaultValue={searchParams.get('search') ?? ''} name="search" placeholder="Filter rows" /><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-4 py-2 font-bold text-brand-ink" type="submit"><Search className="size-4" />Search</button></form>
			{loading && <div className="mt-4 flex items-center gap-2 text-sm text-app-muted"><LoaderCircle className="size-4 animate-spin" />Loading rows…</div>}
			{rows && <><div className="mt-4"><DataTable minimumWidth={`${Math.max(52, rows.columns.length * 12)}rem`}><thead className="bg-brand-primary/5 text-left text-xs uppercase text-app-muted"><tr>{writable && <th className="p-4"><input aria-label="Select all visible rows" checked={Boolean(rows.rows.length) && rows.rows.every((row) => selectedKeys.has(serialisedKey(row)))} onChange={(event) => setSelectedKeys(event.target.checked ? new Set(rows.rows.map(serialisedKey)) : new Set())} type="checkbox" /></th>}{rows.columns.map((column) => <th className="p-4" key={column.name}><button className="inline-flex items-center gap-1 font-bold" onClick={() => updateQuery({ page: '1', sortColumn: column.name, sortDirection: rows.sortColumn === column.name && rows.sortDirection === 'asc' ? 'desc' : 'asc' })} type="button">{column.name}<ChevronDown className={`size-3 transition ${rows.sortColumn === column.name && rows.sortDirection === 'desc' ? 'rotate-180' : ''}`} /></button></th>)}{writable && <th className="sticky right-0 bg-app-surface p-4 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-brand-primary/10">{rows.rows.map((row, rowIndex) => { const key = serialisedKey(row); return <tr key={`${rows.page}-${key || rowIndex}`}>{writable && <td className="p-4"><input aria-label="Select row" checked={selectedKeys.has(key)} onChange={(event) => setSelectedKeys((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} type="checkbox" /></td>}{rows.columns.map((column) => { const value = row[column.name]; return <td className={`max-w-sm truncate p-4 font-mono text-xs ${value === null ? 'italic text-app-muted' : ''}`} key={column.name} title={displayValue(value)}>{displayValue(value)}</td>; })}{writable && <td className="sticky right-0 bg-app-surface p-3"><div className="flex justify-end gap-1"><button aria-label="Edit row" className="rounded-lg p-2 hover:bg-brand-primary/10" onClick={() => updateQuery({ action: 'edit', key })} type="button"><Edit3 className="size-4" /></button><button aria-label="Delete row" className="rounded-lg p-2 text-red-600 hover:bg-red-500/10 dark:text-red-300" onClick={() => updateQuery({ action: 'delete', key })} type="button"><Trash2 className="size-4" /></button></div></td>}</tr>; })}{!rows.rows.length && <tr><td className="p-10 text-center text-app-muted" colSpan={Math.max(1, rows.columns.length + (writable ? 2 : 0))}>No matching rows.</td></tr>}</tbody></DataTable></div><div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-app-muted">{rows.totalRows.toLocaleString()} rows · page {rows.page} of {pageCount}</p><div className="flex items-center gap-2"><select aria-label="Rows per page" className="rounded-lg border border-brand-primary/15 bg-app-surface px-3 py-2" onChange={(event) => updateQuery({ page: '1', pageSize: event.target.value })} value={rows.pageSize}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} rows</option>)}</select><button className="rounded-lg border border-brand-primary/15 px-3 py-2 font-bold disabled:opacity-40" disabled={rows.page <= 1} onClick={() => updateQuery({ page: String(rows.page - 1) })} type="button">Previous</button><button className="rounded-lg border border-brand-primary/15 px-3 py-2 font-bold disabled:opacity-40" disabled={rows.page >= pageCount} onClick={() => updateQuery({ page: String(rows.page + 1) })} type="button">Next</button></div></div></>}
		</div>}
		{(action === 'create' || (action === 'edit' && activeRow)) && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"><form className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-app-surface p-6 shadow-2xl" onSubmit={(event) => void submitRow(event)}><div className="flex items-start justify-between gap-4"><div><h3 className="text-2xl font-black">{action === 'create' ? 'Insert Row' : 'Edit Row'}</h3><p className="mt-1 text-sm text-app-muted">{selectedSchema}.{selectedTable}</p></div><button aria-label="Close" className="rounded-lg p-2" onClick={() => updateQuery({ action: undefined, key: undefined })} type="button"><X className="size-5" /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{mutationColumns.map((column) => <label className="grid gap-2" key={column.name}><span className="flex items-center justify-between gap-3 text-sm font-bold"><span>{column.name}</span><small className="font-normal text-app-muted">{column.dataType}</small></span>{/json|text/i.test(column.dataType) ? <textarea className="min-h-24 rounded-xl border border-brand-primary/15 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100" defaultValue={action === 'edit' ? inputValue(activeRow?.[column.name]) : ''} name={`value:${column.name}`} /> : <input className="rounded-xl border border-brand-primary/15 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100" defaultValue={action === 'edit' ? inputValue(activeRow?.[column.name]) : ''} name={`value:${column.name}`} />} {column.isNullable && <span className="flex items-center gap-2 text-xs text-app-muted"><input defaultChecked={action === 'edit' && activeRow?.[column.name] === null} name={`null:${column.name}`} type="checkbox" />Set NULL</span>}</label>)}</div><div className="mt-6 flex justify-end gap-3"><button className="rounded-xl border border-brand-primary/15 px-4 py-2 font-bold" onClick={() => updateQuery({ action: undefined, key: undefined })} type="button">Cancel</button><button className="rounded-xl bg-brand-action px-5 py-2 font-bold text-brand-ink disabled:opacity-50" disabled={submitting} type="submit">{submitting ? 'Saving…' : action === 'create' ? 'Insert Row' : 'Save Changes'}</button></div></form></div>}
		{action === 'delete' && (activeKey || selectedKeys.size > 0) && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-app-surface p-6 shadow-2xl"><h3 className="text-2xl font-black text-red-600 dark:text-red-300">Delete {activeKey ? 'Row' : `${selectedKeys.size} Rows`}</h3><p className="mt-3 text-sm text-app-muted">This permanently deletes the selected data from <strong className="text-app-text">{selectedSchema}.{selectedTable}</strong>. This cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button className="rounded-xl border border-brand-primary/15 px-4 py-2 font-bold" onClick={() => updateQuery({ action: undefined, key: undefined })} type="button">Cancel</button><button className="rounded-xl bg-red-600 px-5 py-2 font-bold text-white disabled:opacity-50" disabled={submitting} onClick={() => void deleteSelectedRows()} type="button">{submitting ? 'Deleting…' : 'Delete Permanently'}</button></div></div></div>}
	</section>;
}

function StructureView({ structure }: { structure: DatabaseStructure | null }) {
	return <div className="mt-6 grid gap-6"><DataTable minimumWidth="52rem"><thead className="bg-brand-primary/5 text-left text-xs uppercase text-app-muted"><tr><th className="p-4">Column</th><th className="p-4">Type</th><th className="p-4">Nullable</th><th className="p-4">Default</th><th className="p-4">Properties</th></tr></thead><tbody className="divide-y divide-brand-primary/10">{structure?.columns.map((column) => <tr key={column.name}><td className="p-4 font-mono font-bold">{column.name}</td><td className="p-4 font-mono text-sm">{column.dataType}</td><td className="p-4">{column.isNullable ? 'Yes' : 'No'}</td><td className="max-w-xs break-all p-4 font-mono text-xs">{column.defaultValue ?? '—'}</td><td className="p-4 text-sm">{[column.isPrimaryKey && 'Primary key', column.isIdentity && 'Identity', column.isGenerated && 'Generated'].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></DataTable><div><h4 className="font-black">Indexes</h4><div className="mt-3 grid gap-2">{structure?.indexes.map((index) => <article className="rounded-xl border border-brand-primary/10 p-4" key={index.name}><div className="flex flex-wrap items-center gap-2"><strong>{index.name}</strong>{index.isPrimary && <span className="rounded-full bg-brand-primary/10 px-2 py-1 text-xs font-bold">Primary</span>}{index.isUnique && <span className="rounded-full bg-brand-action/15 px-2 py-1 text-xs font-bold">Unique</span>}</div><code className="mt-2 block break-all text-xs text-app-muted">{index.definition}</code></article>)}{!structure?.indexes.length && <p className="text-sm text-app-muted">No indexes reported.</p>}</div></div></div>;
}
