import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Pencil, Play, Save, ShieldAlert, Star, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { databaseQueryRequestSchema, type DatabaseQueryRequest } from '@schemas/databaseQuery';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface QueryResult { affectedRows: number; columns: string[]; durationMs: number; fingerprint: string; readOnly: boolean; rows: Array<Record<string, unknown>>; statementType: string; truncated: boolean }
interface SavedQuery { id: string; name: string; description: string | null; query: string; allowChanges: boolean; rowLimit: number; isFavorite: boolean; executionCount: number; lastExecutedAt: string | null }
interface ApiBody<T> { data?: T; message: string; status: boolean }
interface Props { databaseId: string; databaseName: string; workspacePublicId: number }

/** Controlled database console with encrypted persistent queries and bounded CSV export. */
export function DatabaseQueryWorkspace({ databaseId, databaseName, workspacePublicId }: Props) {
	const storageKey = `ghostdeploy:database-query-history:${databaseId}`;
	const baseApi = `/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}`;
	const [result, setResult] = useState<QueryResult>();
	const [history, setHistory] = useState<string[]>([]);
	const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
	const [selectedId, setSelectedId] = useState<string>();
	const [savedName, setSavedName] = useState('');
	const [savedDescription, setSavedDescription] = useState('');
	const [savedBusy, setSavedBusy] = useState(false);
	const [exporting, setExporting] = useState(false);
	const { control, getValues, handleSubmit, formState: { isSubmitting }, reset, setValue } = useForm<DatabaseQueryRequest>({ resolver: zodResolver(databaseQueryRequestSchema), defaultValues: { allowChanges: false, confirmation: '', query: 'SELECT * FROM ', rowLimit: 100 } });
	const allowChanges = useWatch({ control, name: 'allowChanges' });
	const resultColumns = result?.columns ?? [];
	const selected = savedQueries.find((item) => item.id === selectedId);

	const loadSavedQueries = useCallback(async (): Promise<void> => {
		try {
			const response = await authenticatedFetch(`${baseApi}/saved-queries`);
			const body = await response.json() as ApiBody<SavedQuery[]>;
			if (!response.ok || !body.status) throw new Error(body.message);
			setSavedQueries(body.data ?? []);
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load saved queries.'); }
	}, [baseApi]);

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			try { setHistory(JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as string[]); } catch { setHistory([]); }
			void loadSavedQueries();
		}, 0);
		return () => window.clearTimeout(timeout);
	}, [loadSavedQueries, storageKey]);

	async function execute(input: DatabaseQueryRequest): Promise<void> {
		try {
			const matchingSavedId = selected?.query === input.query ? selected.id : undefined;
			const response = await authenticatedFetch(`${baseApi}/explorer/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, savedQueryId: matchingSavedId }) });
			const body = await response.json() as ApiBody<QueryResult>;
			if (!response.ok || !body.status || !body.data) throw new Error(body.message);
			setResult(body.data);
			const next = [input.query, ...history.filter((query) => query !== input.query)].slice(0, 20);
			setHistory(next);
			sessionStorage.setItem(storageKey, JSON.stringify(next));
			if (matchingSavedId) await loadSavedQueries();
			toast.success(`Query completed in ${body.data.durationMs} ms.`);
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Query failed.'); }
	}

	function selectSavedQuery(item: SavedQuery): void {
		setSelectedId(item.id);
		setSavedName(item.name);
		setSavedDescription(item.description ?? '');
		reset({ allowChanges: item.allowChanges, confirmation: '', query: item.query, rowLimit: item.rowLimit, savedQueryId: item.id });
	}

	async function createSavedQuery(): Promise<void> {
		if (!savedName.trim()) { toast.error('Enter a saved-query name.'); return; }
		setSavedBusy(true);
		try {
			const values = getValues();
			const response = await authenticatedFetch(`${baseApi}/saved-queries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: savedName, description: savedDescription || undefined, query: values.query, allowChanges: values.allowChanges, rowLimit: values.rowLimit, isFavorite: false }) });
			const body = await response.json() as ApiBody<SavedQuery>;
			if (!response.ok || !body.status || !body.data) throw new Error(body.message);
			setSelectedId(body.data.id);
			await loadSavedQueries();
			toast.success('Query saved.');
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save query.'); } finally { setSavedBusy(false); }
	}

	async function updateSavedQuery(id: string, changes?: Partial<SavedQuery>): Promise<void> {
		setSavedBusy(true);
		try {
			const values = getValues();
			const payload = changes ?? { name: savedName, description: savedDescription, query: values.query, allowChanges: values.allowChanges, rowLimit: values.rowLimit };
			const response = await authenticatedFetch(`${baseApi}/saved-queries/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
			const body = await response.json() as ApiBody<SavedQuery>;
			if (!response.ok || !body.status) throw new Error(body.message);
			await loadSavedQueries();
			toast.success('Saved query updated.');
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update query.'); } finally { setSavedBusy(false); }
	}

	async function deleteSavedQuery(id: string): Promise<void> {
		setSavedBusy(true);
		try {
			const response = await authenticatedFetch(`${baseApi}/saved-queries/${id}`, { method: 'DELETE' });
			const body = await response.json() as ApiBody<{ id: string }>;
			if (!response.ok || !body.status) throw new Error(body.message);
			if (selectedId === id) { setSelectedId(undefined); setSavedName(''); setSavedDescription(''); }
			await loadSavedQueries();
			toast.success('Saved query deleted.');
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to delete query.'); } finally { setSavedBusy(false); }
	}

	async function exportCsv(): Promise<void> {
		setExporting(true);
		try {
			const values = getValues();
			const response = await authenticatedFetch(`${baseApi}/explorer/query/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: values.query, rowLimit: 10_000 }) });
			if (!response.ok) { const body = await response.json() as ApiBody<unknown>; throw new Error(body.message); }
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${databaseName}-query-${new Date().toISOString().slice(0, 10)}.csv`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			toast.success('CSV exported.');
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to export CSV.'); } finally { setExporting(false); }
	}

	const inputClass = 'w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100';
	return <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
		<div className="min-w-0"><form className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5" onSubmit={(event) => void handleSubmit(execute)(event)}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Controlled console</p><h2 className="mt-1 text-2xl font-black">SQL Workspace</h2><p className="mt-1 text-sm text-app-muted">One statement at a time. Results are capped and execution stops after 15 seconds.</p></div><Controller control={control} name="rowLimit" render={({ field }) => <label className="text-sm font-semibold">Row limit<select className={`${inputClass} mt-1`} onChange={(event) => field.onChange(Number(event.target.value))} value={field.value}>{[25, 50, 100, 250, 500].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>} /></div><Controller control={control} name="query" render={({ field, fieldState }) => <label className="mt-5 block text-sm font-semibold">SQL<textarea {...field} className={`${inputClass} mt-2 min-h-56 resize-y font-mono text-sm`} spellCheck={false} />{fieldState.error && <span className="mt-1 block text-xs text-red-500">{fieldState.error.message}</span>}</label>} /><div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><Controller control={control} name="allowChanges" render={({ field }) => <label className="flex items-start gap-3"><input checked={field.value} className="mt-1" onChange={field.onChange} type="checkbox" /><span><strong className="flex items-center gap-2"><ShieldAlert className="size-4" />Allow data changes</strong><span className="mt-1 block text-xs text-app-muted">Enables INSERT, UPDATE, DELETE, REPLACE, and MERGE. Structural or administrative SQL remains blocked.</span></span></label>} />{allowChanges && <Controller control={control} name="confirmation" render={({ field }) => <label className="mt-4 block text-sm font-semibold">Type <strong>{databaseName}</strong> to confirm<input {...field} className={`${inputClass} mt-2`} /></label>} />}</div><div className="mt-5 flex flex-wrap gap-3"><button className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink disabled:opacity-50" disabled={isSubmitting} type="submit"><Play className="size-4" />{isSubmitting ? 'Running…' : 'Run Query'}</button><button className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-5 py-3 font-bold disabled:opacity-50" disabled={exporting || allowChanges} onClick={() => void exportCsv()} type="button"><Download className="size-4" />{exporting ? 'Exporting…' : 'Export CSV'}</button></div></form>
		{result && <section className="mt-6 overflow-hidden rounded-2xl border border-brand-primary/10 bg-app-surface"><div className="flex flex-wrap justify-between gap-3 border-b border-brand-primary/10 p-4 text-xs text-app-muted"><span>{result.statementType} · {result.durationMs} ms · {result.affectedRows} affected</span>{result.truncated && <strong className="text-amber-600 dark:text-amber-300">Result truncated</strong>}</div>{resultColumns.length ? <div className="overflow-auto"><table className="min-w-full text-left text-sm"><thead className="bg-brand-primary/5"><tr>{resultColumns.map((column) => <th className="whitespace-nowrap px-4 py-3 font-bold" key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, index) => <tr className="border-t border-brand-primary/10" key={index}>{resultColumns.map((column) => <td className="max-w-md whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs" key={column}>{row[column] === null ? <span className="italic text-app-muted">NULL</span> : typeof row[column] === 'object' ? JSON.stringify(row[column]) : String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div> : <p className="p-5 text-sm text-app-muted">Statement completed without a result set.</p>}</section>}</div>
		<aside className="space-y-5 xl:sticky xl:top-24 xl:h-fit"><section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-black">Saved Queries</h3><p className="mt-1 text-xs text-app-muted">Encrypted and available on your next session.</p></div>{selectedId && <button aria-label="Create another saved query" className="grid size-9 place-items-center rounded-lg border border-brand-primary/15" onClick={() => { setSelectedId(undefined); setSavedName(''); setSavedDescription(''); }} type="button"><X className="size-4" /></button>}</div><div className="mt-4 grid gap-2">{savedQueries.map((item) => <div className={`flex items-center gap-2 rounded-xl border p-2 ${selectedId === item.id ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`} key={item.id}><button className="min-w-0 flex-1 truncate px-1 text-left text-sm font-semibold" onClick={() => selectSavedQuery(item)} title={item.name} type="button">{item.name}<span className="block text-xs font-normal text-app-muted">Used {item.executionCount} times</span></button><button aria-label={item.isFavorite ? 'Remove favourite' : 'Add favourite'} className="grid size-8 place-items-center" disabled={savedBusy} onClick={() => void updateSavedQuery(item.id, { isFavorite: !item.isFavorite })} type="button"><Star className={`size-4 ${item.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} /></button><button aria-label="Delete saved query" className="grid size-8 place-items-center text-rose-600 dark:text-rose-300" disabled={savedBusy} onClick={() => void deleteSavedQuery(item.id)} type="button"><Trash2 className="size-4" /></button></div>)}{!savedQueries.length && <p className="text-sm text-app-muted">No saved queries yet.</p>}</div><div className="mt-4 border-t border-brand-primary/10 pt-4"><label className="text-xs font-bold uppercase text-app-muted">Name<input className={`${inputClass} mt-1`} maxLength={120} onChange={(event) => setSavedName(event.target.value)} value={savedName} /></label><label className="mt-3 block text-xs font-bold uppercase text-app-muted">Description<textarea className={`${inputClass} mt-1 min-h-20`} maxLength={500} onChange={(event) => setSavedDescription(event.target.value)} value={savedDescription} /></label><button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-action px-4 py-3 font-bold text-brand-ink disabled:opacity-50" disabled={savedBusy || !savedName.trim()} onClick={() => void (selectedId ? updateSavedQuery(selectedId) : createSavedQuery())} type="button">{selectedId ? <Pencil className="size-4" /> : <Save className="size-4" />}{selectedId ? 'Update Saved Query' : 'Save Query'}</button></div></section>
		<section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5"><h3 className="font-black">Session History</h3><p className="mt-1 text-xs text-app-muted">Stored only in this browser tab. Audit logs retain a hash and execution metadata, not SQL text.</p><div className="mt-4 grid gap-2">{history.map((query, index) => <button className="truncate rounded-lg border border-brand-primary/10 px-3 py-2 text-left font-mono text-xs hover:bg-brand-primary/5" key={`${index}-${query}`} onClick={() => { setSelectedId(undefined); setValue('query', query); }} title={query} type="button">{query}</button>)}{!history.length && <p className="text-sm text-app-muted">No queries yet.</p>}</div></section></aside>
	</section>;
}
