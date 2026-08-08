import { zodResolver } from '@hookform/resolvers/zod';
import { Play, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { databaseQueryRequestSchema, type DatabaseQueryRequest } from '@schemas/databaseQuery';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface QueryResult { affectedRows: number; columns: string[]; durationMs: number; fingerprint: string; readOnly: boolean; rows: Array<Record<string, unknown>>; statementType: string; truncated: boolean }
interface ApiBody<T> { data?: T; message: string; status: boolean }
interface Props { databaseId: string; databaseName: string; workspacePublicId: number }

/** Controlled database console with local-only query history and bounded server results. */
export function DatabaseQueryWorkspace({ databaseId, databaseName, workspacePublicId }: Props) {
	const storageKey = `ghostdeploy:database-query-history:${databaseId}`;
	const [result, setResult] = useState<QueryResult>();
	const [history, setHistory] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as string[]; } catch { return []; } });
	const { control, handleSubmit, formState: { isSubmitting }, setValue } = useForm<DatabaseQueryRequest>({ resolver: zodResolver(databaseQueryRequestSchema), defaultValues: { allowChanges: false, confirmation: '', query: 'SELECT * FROM ', rowLimit: 100 } });
	const allowChanges = useWatch({ control, name: 'allowChanges' });
	const resultColumns = result?.columns ?? [];
	async function execute(input: DatabaseQueryRequest): Promise<void> {
		try {
			const response = await authenticatedFetch(`/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}/explorer/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
			const body = await response.json() as ApiBody<QueryResult>;
			if (!response.ok || !body.status || !body.data) throw new Error(body.message);
			setResult(body.data);
			const next = [input.query, ...history.filter((query) => query !== input.query)].slice(0, 20); setHistory(next); sessionStorage.setItem(storageKey, JSON.stringify(next));
			toast.success(`Query completed in ${body.data.durationMs} ms.`);
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Query failed.'); }
	}
	const inputClass = 'w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100';
	return <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div className="min-w-0"><form className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5" onSubmit={(event) => void handleSubmit(execute)(event)}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Controlled console</p><h2 className="mt-1 text-2xl font-black">SQL Workspace</h2><p className="mt-1 text-sm text-app-muted">One statement at a time. Results are capped and execution stops after 15 seconds.</p></div><Controller control={control} name="rowLimit" render={({ field }) => <label className="text-sm font-semibold">Row limit<select className={`${inputClass} mt-1`} onChange={(event) => field.onChange(Number(event.target.value))} value={field.value}>{[25, 50, 100, 250, 500].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>} /></div><Controller control={control} name="query" render={({ field, fieldState }) => <label className="mt-5 block text-sm font-semibold">SQL<textarea {...field} className={`${inputClass} mt-2 min-h-56 resize-y font-mono text-sm`} spellCheck={false} />{fieldState.error && <span className="mt-1 block text-xs text-red-500">{fieldState.error.message}</span>}</label>} /><div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><Controller control={control} name="allowChanges" render={({ field }) => <label className="flex items-start gap-3"><input checked={field.value} className="mt-1" onChange={field.onChange} type="checkbox" /><span><strong className="flex items-center gap-2"><ShieldAlert className="size-4" />Allow data changes</strong><span className="mt-1 block text-xs text-app-muted">Enables INSERT, UPDATE, DELETE, REPLACE, and MERGE. Structural or administrative SQL remains blocked.</span></span></label>} />{allowChanges && <Controller control={control} name="confirmation" render={({ field }) => <label className="mt-4 block text-sm font-semibold">Type <strong>{databaseName}</strong> to confirm<input {...field} className={`${inputClass} mt-2`} /></label>} />}</div><button className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink disabled:opacity-50" disabled={isSubmitting} type="submit"><Play className="size-4" />{isSubmitting ? 'Running…' : 'Run Query'}</button></form>
		{result && <section className="mt-6 overflow-hidden rounded-2xl border border-brand-primary/10 bg-app-surface"><div className="flex flex-wrap justify-between gap-3 border-b border-brand-primary/10 p-4 text-xs text-app-muted"><span>{result.statementType} · {result.durationMs} ms · {result.affectedRows} affected</span>{result.truncated && <strong className="text-amber-600 dark:text-amber-300">Result truncated</strong>}</div>{resultColumns.length ? <div className="overflow-auto"><table className="min-w-full text-left text-sm"><thead className="bg-brand-primary/5"><tr>{resultColumns.map((column) => <th className="whitespace-nowrap px-4 py-3 font-bold" key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, index) => <tr className="border-t border-brand-primary/10" key={index}>{resultColumns.map((column) => <td className="max-w-md whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs" key={column}>{row[column] === null ? <span className="italic text-app-muted">NULL</span> : typeof row[column] === 'object' ? JSON.stringify(row[column]) : String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div> : <p className="p-5 text-sm text-app-muted">Statement completed without a result set.</p>}</section>}</div>
		<aside className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5 xl:sticky xl:top-24 xl:h-fit"><h3 className="font-black">Session History</h3><p className="mt-1 text-xs text-app-muted">Stored only in this browser tab. GhostDeploy audit logs retain a hash and execution metadata, not SQL text.</p><div className="mt-4 grid gap-2">{history.map((query, index) => <button className="truncate rounded-lg border border-brand-primary/10 px-3 py-2 text-left font-mono text-xs hover:bg-brand-primary/5" key={`${index}-${query}`} onClick={() => setValue('query', query)} title={query} type="button">{query}</button>)}{!history.length && <p className="text-sm text-app-muted">No queries yet.</p>}</div></aside>
	</section>;
}
