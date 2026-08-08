import { zodResolver } from '@hookform/resolvers/zod';
import { Columns3, Database, Edit3, KeyRound, Link2, LoaderCircle, Plus, Table2, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';

import { databaseColumnTypeSchema, databaseSchemaMutationSchema, type DatabaseColumnDefinition, type DatabaseSchemaMutation } from '@schemas/databaseSchema';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface DatabaseObject { estimatedRows: number | null; kind: 'materialized_view' | 'table' | 'view'; name: string; schema: string }
interface DatabaseColumn { dataType: string; defaultValue: string | null; isGenerated: boolean; isIdentity: boolean; isNullable: boolean; isPrimaryKey: boolean; name: string; ordinal: number }
interface DatabaseIndex { definition: string; isPrimary: boolean; isUnique: boolean; name: string }
interface DatabaseConstraint { columns: string[]; definition: string; name: string; referenceColumns: string[]; referenceSchema: string | null; referenceTable: string | null; type: 'check' | 'foreign_key' | 'primary_key' | 'unique' }
interface DatabaseStructure { columns: DatabaseColumn[]; constraints: DatabaseConstraint[]; indexes: DatabaseIndex[]; kind: DatabaseObject['kind']; name: string; schema: string }
interface ApiBody<T> { data?: T; message: string; status: boolean }
interface Props { databaseId: string; engine: 'mysql' | 'postgresql'; workspacePublicId: number }

type ActionName = DatabaseSchemaMutation['operation'];
type ColumnType = z.infer<typeof databaseColumnTypeSchema>;
interface ColumnDraft { autoIncrement: boolean; defaultKind: 'current_timestamp' | 'literal' | 'none' | 'null'; defaultValue: string; length: string; name: string; nullable: boolean; precision: string; primaryKey: boolean; scale: string; type: ColumnType }
interface FormValues {
	acceptedImpact: boolean; autoIncrement: boolean; columnName: string; columns: string; confirmation: string; constraintName: string;
	defaultKind: ColumnDraft['defaultKind']; defaultValue: string; indexName: string; length: string; name: string; newName: string;
	nullable: boolean; onDelete: 'cascade' | 'no_action' | 'restrict' | 'set_null'; onUpdate: 'cascade' | 'no_action' | 'restrict' | 'set_null';
	precision: string; referenceColumns: string; referenceSchema: string; referenceTable: string; scale: string; schema: string; table: string; type: ColumnType; unique: boolean;
}

const formSchema = z.object({
	acceptedImpact: z.boolean(), autoIncrement: z.boolean(), columnName: z.string(), columns: z.string(), confirmation: z.string(), constraintName: z.string(),
	defaultKind: z.enum(['current_timestamp', 'literal', 'none', 'null']), defaultValue: z.string(), indexName: z.string(), length: z.string(), name: z.string(), newName: z.string(),
	nullable: z.boolean(), onDelete: z.enum(['cascade', 'no_action', 'restrict', 'set_null']), onUpdate: z.enum(['cascade', 'no_action', 'restrict', 'set_null']),
	precision: z.string(), referenceColumns: z.string(), referenceSchema: z.string(), referenceTable: z.string(), scale: z.string(), schema: z.string(), table: z.string(), type: databaseColumnTypeSchema, unique: z.boolean(),
});

const emptyColumn = (): ColumnDraft => ({ autoIncrement: false, defaultKind: 'none', defaultValue: '', length: '', name: '', nullable: true, precision: '', primaryKey: false, scale: '', type: 'string' });
const initialTableColumns = (): ColumnDraft[] => [{ ...emptyColumn(), autoIncrement: true, name: 'id', nullable: false, primaryKey: true, type: 'bigint' }];
const splitIdentifiers = (value: string): string[] => value.split(',').map((item) => item.trim()).filter(Boolean);
const numberOrUndefined = (value: string): number | undefined => value.trim() ? Number(value) : undefined;

function inferredType(value: string): ColumnType {
	const type = value.toLowerCase();
	if (type.includes('bigint')) return 'bigint';
	if (type.includes('int')) return 'integer';
	if (type.includes('bool')) return 'boolean';
	if (type.includes('timestamp') || type.includes('datetime')) return 'timestamp';
	if (type === 'date') return 'date';
	if (type.includes('numeric') || type.includes('decimal')) return 'decimal';
	if (type.includes('double') || type.includes('float')) return 'double';
	if (type.includes('json')) return 'json';
	if (type.includes('uuid') || type.includes('char(36)')) return 'uuid';
	if (type.includes('text')) return 'text';
	return 'string';
}

function columnDefinition(input: Pick<FormValues, 'autoIncrement' | 'columnName' | 'defaultKind' | 'defaultValue' | 'length' | 'nullable' | 'precision' | 'scale' | 'type'>, primaryKey = false): DatabaseColumnDefinition {
	return {
		name: input.columnName,
		type: input.type,
		length: numberOrUndefined(input.length),
		precision: numberOrUndefined(input.precision),
		scale: numberOrUndefined(input.scale),
		nullable: input.nullable,
		primaryKey,
		autoIncrement: input.autoIncrement,
		default: input.defaultKind === 'literal' ? { kind: 'literal', value: input.defaultValue } : { kind: input.defaultKind },
	};
}

function draftDefinition(column: ColumnDraft): DatabaseColumnDefinition {
	return columnDefinition({ ...column, columnName: column.name });
}

/** URL-driven schema designer for strictly modelled PostgreSQL/MySQL DDL operations. */
export function DatabaseSchemaManager({ databaseId, engine, workspacePublicId }: Props) {
	const [objects, setObjects] = useState<DatabaseObject[]>([]);
	const [availableSchemas, setAvailableSchemas] = useState<string[]>([]);
	const [structure, setStructure] = useState<DatabaseStructure | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [tableColumns, setTableColumns] = useState<ColumnDraft[]>(initialTableColumns);
	const [searchParams, setSearchParams] = useSearchParams();
	const selectedSchema = searchParams.get('schema') ?? '';
	const selectedTable = searchParams.get('table') ?? '';
	const action = searchParams.get('action') as ActionName | null;
	const selectedColumn = searchParams.get('column') ?? '';
	const selectedIndex = searchParams.get('index') ?? '';
	const selectedConstraint = searchParams.get('constraint') ?? '';
	const schemas = useMemo(() => availableSchemas.length ? availableSchemas : [...new Set(objects.map(({ schema }) => schema))], [availableSchemas, objects]);
	const selectedObject = objects.find((object) => object.schema === selectedSchema && object.name === selectedTable);
	const { control, handleSubmit, reset } = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { acceptedImpact: false, autoIncrement: false, columnName: '', columns: '', confirmation: '', constraintName: '', defaultKind: 'none', defaultValue: '', indexName: '', length: '', name: '', newName: '', nullable: true, onDelete: 'no_action', onUpdate: 'no_action', precision: '', referenceColumns: '', referenceSchema: selectedSchema, referenceTable: '', scale: '', schema: selectedSchema || schemas[0] || '', table: '', type: 'string', unique: false },
	});

	const updateQuery = useCallback((changes: Record<string, string | undefined>) => {
		const next = new URLSearchParams(searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value) next.set(key, value);
			else next.delete(key);
		}
		setSearchParams(next);
	}, [searchParams, setSearchParams]);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const query = selectedSchema && selectedTable ? `?schema=${encodeURIComponent(selectedSchema)}&table=${encodeURIComponent(selectedTable)}` : '';
			const response = await authenticatedFetch(`/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}/explorer/objects${query}`);
			const body = await response.json() as ApiBody<{ objects: DatabaseObject[]; schemas: string[]; structure: DatabaseStructure | null }>;
			if (!response.ok || !body.status || !body.data) throw new Error(body.message);
			setObjects(body.data.objects);
			setAvailableSchemas(body.data.schemas);
			setStructure(body.data.structure);
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load database structure.'); }
		finally { setLoading(false); }
	}, [databaseId, selectedSchema, selectedTable, workspacePublicId]);

	useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);
	useEffect(() => {
		if (!action) return;
		const column = structure?.columns.find(({ name }) => name === selectedColumn);
		reset({
			acceptedImpact: false, autoIncrement: column?.isIdentity ?? false, columnName: column?.name ?? '', columns: '', confirmation: '', constraintName: selectedConstraint,
			defaultKind: column?.defaultValue ? 'literal' : 'none', defaultValue: column?.defaultValue ?? '', indexName: selectedIndex, length: '', name: '', newName: '', nullable: column?.isNullable ?? true,
			onDelete: 'no_action', onUpdate: 'no_action', precision: '', referenceColumns: '', referenceSchema: selectedSchema, referenceTable: '', scale: '', schema: selectedSchema || schemas[0] || '', table: '', type: inferredType(column?.dataType ?? 'string'), unique: false,
		});
	}, [action, reset, schemas, selectedColumn, selectedConstraint, selectedIndex, selectedSchema, structure]);

	async function execute(payload: unknown): Promise<void> {
		const parsed = databaseSchemaMutationSchema.safeParse(payload);
		if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Check the schema form.'); return; }
		setSubmitting(true);
		try {
			const response = await authenticatedFetch(`/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}/explorer/schema`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed.data) });
			const body = await response.json() as ApiBody<unknown>;
			if (!response.ok || !body.status) throw new Error(body.message);
			toast.success('Database structure updated.');
			if (parsed.data.operation === 'drop_table' || parsed.data.operation === 'drop_schema') updateQuery({ action: undefined, column: undefined, constraint: undefined, index: undefined, schema: undefined, table: undefined });
			else if (parsed.data.operation === 'create_table') updateQuery({ action: undefined, schema: parsed.data.schema, table: parsed.data.table });
			else if (parsed.data.operation === 'rename_table') updateQuery({ action: undefined, table: parsed.data.newName });
			else if (parsed.data.operation === 'rename_schema') updateQuery({ action: undefined, schema: parsed.data.newName, table: undefined });
			else updateQuery({ action: undefined, column: undefined, constraint: undefined, index: undefined });
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Database structure update failed.'); }
		finally { setSubmitting(false); }
	}

	const submit = handleSubmit(async (values) => {
		if (!action) return;
		const target = { schema: selectedSchema || values.schema, table: selectedTable || values.table };
		const baseColumn = columnDefinition(values);
		const payload: Record<ActionName, unknown> = {
			create_schema: { operation: 'create_schema', schema: values.schema },
			rename_schema: { operation: 'rename_schema', schema: selectedSchema, newName: values.newName },
			drop_schema: { operation: 'drop_schema', schema: selectedSchema, acceptedImpact: values.acceptedImpact, confirmation: values.confirmation },
			create_table: { operation: 'create_table', schema: values.schema, table: values.table, columns: tableColumns.map(draftDefinition) },
			rename_table: { operation: 'rename_table', ...target, newName: values.newName },
			drop_table: { operation: 'drop_table', ...target, acceptedImpact: values.acceptedImpact, confirmation: values.confirmation },
			truncate_table: { operation: 'truncate_table', ...target, acceptedImpact: values.acceptedImpact, confirmation: values.confirmation },
			add_column: { operation: 'add_column', ...target, column: baseColumn },
			alter_column: { operation: 'alter_column', ...target, columnName: selectedColumn, column: baseColumn, acceptedImpact: values.acceptedImpact, confirmation: values.confirmation },
			drop_column: { operation: 'drop_column', ...target, columnName: selectedColumn, acceptedImpact: values.acceptedImpact, confirmation: values.confirmation },
			create_index: { operation: 'create_index', ...target, indexName: values.indexName, columns: splitIdentifiers(values.columns).map((name) => ({ name, direction: 'asc' })), unique: values.unique },
			drop_index: { operation: 'drop_index', ...target, indexName: selectedIndex, acceptedImpact: values.acceptedImpact, confirmation: values.confirmation },
			add_primary_key: { operation: 'add_primary_key', ...target, constraintName: values.constraintName, columns: splitIdentifiers(values.columns) },
			add_foreign_key: { operation: 'add_foreign_key', ...target, constraintName: values.constraintName, columns: splitIdentifiers(values.columns), referenceSchema: values.referenceSchema, referenceTable: values.referenceTable, referenceColumns: splitIdentifiers(values.referenceColumns), onDelete: values.onDelete, onUpdate: values.onUpdate },
			drop_constraint: { operation: 'drop_constraint', ...target, constraintName: selectedConstraint, acceptedImpact: values.acceptedImpact, confirmation: values.confirmation },
		};
		await execute(payload[action]);
	});

	if (loading && !objects.length) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="size-7 animate-spin text-brand-primary dark:text-brand-action" /></div>;
	return <section>
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black">Schema Designer</h2><p className="mt-1 text-sm text-app-muted">Manage tables and relationships without unrestricted SQL access.</p></div><div className="flex flex-wrap gap-2">{engine === 'postgresql' && <button className="rounded-xl border border-brand-primary/15 px-4 py-2 font-bold" onClick={() => updateQuery({ action: 'create_schema' })} type="button"><Plus className="mr-2 inline size-4" />Schema</button>}<button className="rounded-xl bg-brand-action px-4 py-2 font-bold text-brand-ink" onClick={() => { setTableColumns(initialTableColumns()); updateQuery({ action: 'create_table' }); }} type="button"><Plus className="mr-2 inline size-4" />Table</button></div></div>
		<div className="mt-6 grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]"><aside className="rounded-2xl border border-brand-primary/10 bg-app-surface p-3"><div className="grid gap-4">{schemas.map((schema) => <div key={schema}><button className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-black ${selectedSchema === schema && !selectedTable ? 'bg-brand-primary/10' : ''}`} onClick={() => updateQuery({ schema, table: undefined })} type="button"><Database className="size-4" />{schema}</button><div className="ml-3 mt-1 grid gap-1 border-l border-brand-primary/10 pl-3">{objects.filter((object) => object.schema === schema).map((object) => <button className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${selectedSchema === schema && selectedTable === object.name ? 'bg-brand-action/15 font-bold' : 'text-app-muted hover:bg-brand-primary/5 hover:text-app-text'}`} key={`${schema}.${object.name}`} onClick={() => updateQuery({ schema, table: object.name })} type="button"><Table2 className="size-4" /><span className="truncate">{object.name}</span></button>)}</div></div>)}</div></aside>
			<div className="min-w-0">{selectedObject ? <TableStructure action={(name, extras = {}) => updateQuery({ action: name, ...extras })} object={selectedObject} structure={structure} /> : selectedSchema ? <section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-6"><Database className="size-8 text-brand-primary dark:text-brand-action" /><p className="mt-4 text-xs font-bold uppercase text-app-muted">Schema</p><h3 className="mt-1 text-2xl font-black">{selectedSchema}</h3><p className="mt-2 text-sm text-app-muted">{objects.filter(({ schema }) => schema === selectedSchema).length} tables or views</p>{engine === 'postgresql' && selectedSchema !== 'public' && <div className="mt-6 flex flex-wrap gap-2"><button className="rounded-xl border border-brand-primary/15 px-4 py-2 font-bold" onClick={() => updateQuery({ action: 'rename_schema' })} type="button">Rename Schema</button><button className="rounded-xl border border-red-500/30 px-4 py-2 font-bold text-red-600 dark:text-red-300" onClick={() => updateQuery({ action: 'drop_schema' })} type="button">Drop Schema</button></div>}</section> : <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-brand-primary/20 p-8 text-center text-app-muted"><div><Database className="mx-auto size-10" /><p className="mt-3 font-bold">Select a schema or create a table.</p></div></div>}</div></div>
		{action && <SchemaDialog action={action} baseColumn={structure?.columns.find(({ name }) => name === selectedColumn)} control={control} onClose={() => updateQuery({ action: undefined, column: undefined, constraint: undefined, index: undefined })} onSubmit={submit} selectedConstraint={selectedConstraint} selectedIndex={selectedIndex} selectedSchema={selectedSchema} selectedTable={selectedTable} setTableColumns={setTableColumns} submitting={submitting} tableColumns={tableColumns} />}
	</section>;
}

function TableStructure({ action, object, structure }: { action: (name: ActionName, extras?: Record<string, string>) => void; object: DatabaseObject; structure: DatabaseStructure | null }) {
	if (!structure) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="size-6 animate-spin" /></div>;
	const table = object.kind === 'table';
	return <div className="grid gap-6"><header className="flex flex-col gap-4 rounded-2xl border border-brand-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase text-app-muted">{object.schema} / {object.kind.replaceAll('_', ' ')}</p><h3 className="mt-1 text-2xl font-black">{object.name}</h3></div>{table && <div className="flex flex-wrap gap-2"><button className="rounded-lg border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => action('rename_table')} type="button">Rename</button><button className="rounded-lg border border-red-500/30 px-3 py-2 text-sm font-bold text-red-600 dark:text-red-300" onClick={() => action('truncate_table')} type="button">Truncate</button><button className="rounded-lg border border-red-500/30 px-3 py-2 text-sm font-bold text-red-600 dark:text-red-300" onClick={() => action('drop_table')} type="button">Drop</button></div>}</header>
		<section className="rounded-2xl border border-brand-primary/10"><header className="flex items-center justify-between border-b border-brand-primary/10 p-4"><h4 className="flex items-center gap-2 font-black"><Columns3 className="size-4" />Columns</h4>{table && <button className="rounded-lg bg-brand-action px-3 py-2 text-sm font-bold text-brand-ink" onClick={() => action('add_column')} type="button"><Plus className="mr-1 inline size-4" />Column</button>}</header><div className="divide-y divide-brand-primary/10">{structure.columns.map((column) => <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" key={column.name}><div className="min-w-0 flex-1"><strong className="font-mono">{column.name}</strong><p className="mt-1 text-xs text-app-muted">{column.dataType} · {column.isNullable ? 'nullable' : 'required'}{column.defaultValue ? ` · default ${column.defaultValue}` : ''}</p></div>{table && !column.isGenerated && <div className="flex gap-1"><button aria-label={`Edit ${column.name}`} className="rounded-lg p-2 hover:bg-brand-primary/10" onClick={() => action('alter_column', { column: column.name })} type="button"><Edit3 className="size-4" /></button><button aria-label={`Drop ${column.name}`} className="rounded-lg p-2 text-red-600 hover:bg-red-500/10 dark:text-red-300" onClick={() => action('drop_column', { column: column.name })} type="button"><Trash2 className="size-4" /></button></div>}</div>)}</div></section>
		{table && <section className="grid gap-6 lg:grid-cols-2"><StructureList action={action} createAction="create_index" icon={<KeyRound className="size-4" />} items={structure.indexes.map((item) => ({ definition: item.definition, name: item.name, removable: !item.isPrimary }))} kind="index" title="Indexes" /><StructureList action={action} createAction="add_foreign_key" icon={<Link2 className="size-4" />} items={structure.constraints.map((item) => ({ definition: item.definition, name: item.name, removable: true }))} kind="constraint" title="Constraints" extraAction={!structure.constraints.some(({ type }) => type === 'primary_key') ? 'add_primary_key' : undefined} /></section>}
	</div>;
}

function StructureList({ action, createAction, extraAction, icon, items, kind, title }: { action: (name: ActionName, extras?: Record<string, string>) => void; createAction: ActionName; extraAction?: ActionName; icon: ReactNode; items: Array<{ definition: string; name: string; removable: boolean }>; kind: 'constraint' | 'index'; title: string }) {
	return <section className="rounded-2xl border border-brand-primary/10"><header className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-primary/10 p-4"><h4 className="flex items-center gap-2 font-black">{icon}{title}</h4><div className="flex gap-2">{extraAction && <button className="rounded-lg border border-brand-primary/15 px-3 py-2 text-xs font-bold" onClick={() => action(extraAction)} type="button">Primary Key</button>}<button className="rounded-lg bg-brand-action px-3 py-2 text-xs font-bold text-brand-ink" onClick={() => action(createAction)} type="button"><Plus className="mr-1 inline size-3" />Add</button></div></header><div className="divide-y divide-brand-primary/10">{items.map((item) => <div className="flex items-start gap-3 p-4" key={item.name}><div className="min-w-0 flex-1"><strong className="break-all text-sm">{item.name}</strong><p className="mt-1 break-all font-mono text-xs text-app-muted">{item.definition}</p></div>{item.removable && <button aria-label={`Drop ${item.name}`} className="rounded-lg p-2 text-red-600 dark:text-red-300" onClick={() => action(kind === 'index' ? 'drop_index' : 'drop_constraint', { [kind]: item.name })} type="button"><Trash2 className="size-4" /></button>}</div>)}{!items.length && <p className="p-5 text-sm text-app-muted">None configured.</p>}</div></section>;
}

function SchemaDialog({ action, baseColumn, control, onClose, onSubmit, selectedConstraint, selectedIndex, selectedSchema, selectedTable, setTableColumns, submitting, tableColumns }: { action: ActionName; baseColumn?: DatabaseColumn; control: ReturnType<typeof useForm<FormValues>>['control']; onClose: () => void; onSubmit: () => void; selectedConstraint: string; selectedIndex: string; selectedSchema: string; selectedTable: string; setTableColumns: Dispatch<SetStateAction<ColumnDraft[]>>; submitting: boolean; tableColumns: ColumnDraft[] }) {
	const destructive = ['alter_column', 'drop_column', 'drop_constraint', 'drop_index', 'drop_schema', 'drop_table', 'truncate_table'].includes(action);
	const columnAction = ['add_column', 'alter_column'].includes(action);
	const title = action.replaceAll('_', ' ').replace(/\b\w/g, (value) => value.toUpperCase());
	const confirmation = action === 'drop_schema' ? selectedSchema
		: action === 'drop_column' || action === 'alter_column' ? `${selectedSchema}.${selectedTable}.${baseColumn?.name ?? ''}`
			: action === 'drop_index' ? `${selectedSchema}.${selectedTable}.${selectedIndex}`
				: action === 'drop_constraint' ? `${selectedSchema}.${selectedTable}.${selectedConstraint}`
					: `${selectedSchema}.${selectedTable}`;
	return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4"><form className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-app-surface p-6 shadow-2xl" onSubmit={onSubmit}><div className="flex items-start justify-between gap-4"><div><h3 className="text-2xl font-black">{title}</h3><p className="mt-1 text-sm text-app-muted">{selectedTable ? `${selectedSchema}.${selectedTable}` : 'Database structure'}</p></div><button aria-label="Close" className="rounded-lg p-2" onClick={onClose} type="button"><X className="size-5" /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">
		{action === 'create_schema' && <Field control={control} label="Schema name" name="schema" />}
		{action === 'rename_schema' || action === 'rename_table' ? <Field control={control} label="New name" name="newName" /> : null}
		{action === 'create_table' && <><Field control={control} label="Schema" name="schema" /><Field control={control} label="Table name" name="table" /><div className="sm:col-span-2"><div className="flex items-center justify-between"><strong>Columns</strong><button className="rounded-lg border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => setTableColumns((current) => [...current, emptyColumn()])} type="button"><Plus className="mr-1 inline size-4" />Column</button></div><div className="mt-3 grid gap-3">{tableColumns.map((column, index) => <ColumnDraftEditor column={column} index={index} key={index} onChange={(next) => setTableColumns((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} onRemove={() => setTableColumns((current) => current.filter((_, itemIndex) => itemIndex !== index))} />)}</div></div></>}
		{columnAction && <ColumnFields control={control} />}
		{action === 'create_index' && <><Field control={control} label="Index name" name="indexName" /><Field control={control} hint="Comma-separated column names" label="Columns" name="columns" /><Check control={control} label="Unique index" name="unique" /></>}
		{action === 'add_primary_key' && <><Field control={control} label="Constraint name" name="constraintName" /><Field control={control} hint="Comma-separated column names" label="Columns" name="columns" /></>}
		{action === 'add_foreign_key' && <><Field control={control} label="Constraint name" name="constraintName" /><Field control={control} hint="Comma-separated local columns" label="Columns" name="columns" /><Field control={control} label="Referenced schema" name="referenceSchema" /><Field control={control} label="Referenced table" name="referenceTable" /><Field control={control} hint="Same order as local columns" label="Referenced columns" name="referenceColumns" /><Select control={control} label="On delete" name="onDelete" options={['no_action', 'restrict', 'cascade', 'set_null']} /><Select control={control} label="On update" name="onUpdate" options={['no_action', 'restrict', 'cascade', 'set_null']} /></>}
		{destructive && <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 sm:col-span-2"><p className="text-sm text-red-600 dark:text-red-300">This operation can permanently remove data. Type <strong>{confirmation}</strong> exactly.</p><div className="mt-3"><Field control={control} label="Confirmation" name="confirmation" /></div><Check control={control} label="I understand the impact" name="acceptedImpact" /></div>}
		</div><div className="mt-7 flex justify-end gap-3"><button className="rounded-xl border border-brand-primary/15 px-4 py-2 font-bold" onClick={onClose} type="button">Cancel</button><button className={`${destructive ? 'bg-red-600 text-white' : 'bg-brand-action text-brand-ink'} rounded-xl px-5 py-2 font-bold disabled:opacity-50`} disabled={submitting} type="submit">{submitting ? 'Applying…' : title}</button></div></form></div>;
}

function ColumnFields({ control }: { control: ReturnType<typeof useForm<FormValues>>['control'] }) {
	return <><Field control={control} label="Column name" name="columnName" /><Select control={control} label="Data type" name="type" options={databaseColumnTypeSchema.options} /><Field control={control} hint="String columns only" label="Length" name="length" /><Field control={control} hint="Decimal columns only" label="Precision" name="precision" /><Field control={control} hint="Decimal columns only" label="Scale" name="scale" /><Select control={control} label="Default" name="defaultKind" options={['none', 'null', 'current_timestamp', 'literal']} /><Field control={control} label="Literal default" name="defaultValue" /><Check control={control} label="Nullable" name="nullable" /><Check control={control} label="Auto increment / identity" name="autoIncrement" /></>;
}

function ColumnDraftEditor({ column, index, onChange, onRemove }: { column: ColumnDraft; index: number; onChange: (column: ColumnDraft) => void; onRemove: () => void }) {
	const inputClass = 'rounded-lg border border-brand-primary/15 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100';
	return <div className="grid gap-3 rounded-xl border border-brand-primary/10 p-4 sm:grid-cols-2 lg:grid-cols-4"><input aria-label={`Column ${index + 1} name`} className={inputClass} onChange={(event) => onChange({ ...column, name: event.target.value })} placeholder="Column name" value={column.name} /><select aria-label={`Column ${index + 1} type`} className={inputClass} onChange={(event) => onChange({ ...column, type: event.target.value as ColumnType })} value={column.type}>{databaseColumnTypeSchema.options.map((option) => <option key={option}>{option}</option>)}</select><input aria-label={`Column ${index + 1} length`} className={inputClass} disabled={column.type !== 'string'} min="1" onChange={(event) => onChange({ ...column, length: event.target.value })} placeholder="Length" type="number" value={column.length} /><div className="flex items-center justify-end gap-3"><label className="flex items-center gap-2 text-sm"><input checked={column.primaryKey} onChange={(event) => onChange({ ...column, nullable: event.target.checked ? false : column.nullable, primaryKey: event.target.checked })} type="checkbox" />Primary</label><button aria-label={`Remove column ${index + 1}`} className="rounded-lg p-2 text-red-600" disabled={index === 0 && column.name === 'id'} onClick={onRemove} type="button"><Trash2 className="size-4" /></button></div><input aria-label={`Column ${index + 1} precision`} className={inputClass} disabled={column.type !== 'decimal'} min="1" onChange={(event) => onChange({ ...column, precision: event.target.value })} placeholder="Precision" type="number" value={column.precision} /><input aria-label={`Column ${index + 1} scale`} className={inputClass} disabled={column.type !== 'decimal'} min="0" onChange={(event) => onChange({ ...column, scale: event.target.value })} placeholder="Scale" type="number" value={column.scale} /><select aria-label={`Column ${index + 1} default type`} className={inputClass} onChange={(event) => onChange({ ...column, defaultKind: event.target.value as ColumnDraft['defaultKind'] })} value={column.defaultKind}><option value="none">No default</option><option value="null">NULL</option><option value="current_timestamp">Current timestamp</option><option value="literal">Literal value</option></select><input aria-label={`Column ${index + 1} default value`} className={inputClass} disabled={column.defaultKind !== 'literal'} onChange={(event) => onChange({ ...column, defaultValue: event.target.value })} placeholder="Default value" value={column.defaultValue} /><label className="flex items-center gap-2 text-sm"><input checked={column.nullable} onChange={(event) => onChange({ ...column, nullable: event.target.checked, primaryKey: event.target.checked ? false : column.primaryKey })} type="checkbox" />Nullable</label><label className="flex items-center gap-2 text-sm"><input checked={column.autoIncrement} onChange={(event) => onChange({ ...column, autoIncrement: event.target.checked })} type="checkbox" />Auto increment / identity</label></div>;
}

function Field({ control, hint, label, name }: { control: ReturnType<typeof useForm<FormValues>>['control']; hint?: string; label: string; name: keyof FormValues }) {
	return <Controller control={control} name={name} render={({ field, fieldState }) => <label className="grid gap-2"><span className="text-sm font-bold">{label}</span><input className="rounded-xl border border-brand-primary/15 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100" onBlur={field.onBlur} onChange={field.onChange} ref={field.ref} value={typeof field.value === 'string' ? field.value : ''} />{hint && <small className="text-app-muted">{hint}</small>}{fieldState.error && <small className="text-red-500">{fieldState.error.message}</small>}</label>} />;
}

function Check({ control, label, name }: { control: ReturnType<typeof useForm<FormValues>>['control']; label: string; name: 'acceptedImpact' | 'autoIncrement' | 'nullable' | 'unique' }) {
	return <Controller control={control} name={name} render={({ field }) => <label className="flex items-center gap-2 text-sm font-bold"><input checked={Boolean(field.value)} onChange={field.onChange} ref={field.ref} type="checkbox" />{label}</label>} />;
}

function Select({ control, label, name, options }: { control: ReturnType<typeof useForm<FormValues>>['control']; label: string; name: 'defaultKind' | 'onDelete' | 'onUpdate' | 'type'; options: readonly string[] }) {
	return <Controller control={control} name={name} render={({ field }) => <label className="grid gap-2"><span className="text-sm font-bold">{label}</span><select className="rounded-xl border border-brand-primary/15 bg-white px-3 py-2 text-gray-900 dark:bg-gray-800 dark:text-gray-100" onBlur={field.onBlur} onChange={field.onChange} ref={field.ref} value={String(field.value)}>{options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select></label>} />;
}
