import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, LoaderCircle, Plus, RefreshCw, ShieldCheck, Trash2, UserRoundCog } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import {
	createDatabaseAccessSchema,
	databaseUserActionSchema,
	revokeDatabaseGrantSchema,
	updateDatabaseGrantSchema,
	type CreateDatabaseAccessRequest,
	type DatabaseUserActionRequest,
	type RevokeDatabaseGrantRequest,
	type UpdateDatabaseGrantRequest,
} from '@schemas/databaseAccess';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface AccessGrant {
	accessLevel: 'custom' | 'owner' | 'read_only' | 'read_write';
	createdAt: string;
	expiresAt?: string | null;
	id: string;
	impact: { activeGrantCount: number; databaseCount: number; ownedDatabaseCount: number };
	privileges: Array<'delete' | 'insert' | 'select' | 'update'>;
	revokeReason?: string | null;
	scopes: Array<{ schema: string; table?: string }>;
	status: 'active' | 'revoked';
	user: { id: string; status: 'active' | 'suspended'; username: string };
}
interface AccessPayload {
	availableUsers: Array<{ id: string; status: string; username: string }>;
	grants: AccessGrant[];
	usernamePrefix: string;
}
interface ApiBody<T> { data?: T; message: string; status: boolean }
interface Props { databaseId: string; databaseName: string; workspacePublicId: number }

const INPUT_CLASS = 'w-full rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 outline-none focus:border-brand-action dark:bg-gray-800 dark:text-gray-100';
const EMPTY_CREATE: CreateDatabaseAccessRequest = {
	accessLevel: 'read_only',
	privileges: [],
	scopes: [],
	userMode: 'new',
	username: '',
};

/** Sends an authenticated JSON request and unwraps the standardized API body. */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = await response.json() as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined) throw new Error(body.message);
	return body.data;
}

/** Customer controls for least-privilege database logins and their cross-database impact. */
export function DatabaseAccessManager({ databaseId, databaseName, workspacePublicId }: Props) {
	const location = useLocation();
	const navigate = useNavigate();
	const [data, setData] = useState<AccessPayload>();
	const [busy, setBusy] = useState(false);
	const [credential, setCredential] = useState<Record<string, unknown>>();
	const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
	const accessAction = query.get('accessAction');
	const selectedGrant = data?.grants.find(({ id }) => id === query.get('grant'));
	const selectedUser = data?.grants.find(({ user }) => user.id === query.get('databaseUser'))?.user;
	const basePage = location.pathname.startsWith('/database/')
		? `/database/${databaseId}/access`
		: `/dashboard/databases/${databaseId}/access`;
	const baseApi = `/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}`;

	const load = useCallback(async () => {
		try {
			setData(await api<AccessPayload>(`${baseApi}/access`));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to load database access.');
		}
	}, [baseApi]);
	useEffect(() => {
		const timeout = window.setTimeout(() => { void load(); }, 0);
		return () => window.clearTimeout(timeout);
	}, [load]);

	/** Closes the URL-addressable dialog without losing the access tab. */
	function close(): void {
		setCredential(undefined);
		navigate(basePage, { replace: true });
	}

	/** Executes a validated lifecycle mutation and refreshes provider-backed state. */
	async function mutate<T>(path: string, method: string, body: unknown, successMessage: string): Promise<T> {
		setBusy(true);
		try {
			const result = await api<T>(path, {
				body: JSON.stringify(body),
				headers: { 'content-type': 'application/json' },
				method,
			});
			toast.success(successMessage);
			await load();
			return result;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Database access update failed.');
			throw error;
		} finally {
			setBusy(false);
		}
	}

	return <section>
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Least privilege</p><h3 className="mt-1 text-2xl font-black">Database Access</h3><p className="mt-1 text-sm text-app-muted">Create restricted logins, reuse them across databases, and revoke access without changing the owner.</p></div>
			<button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" onClick={() => navigate(`${basePage}?accessAction=create`)} type="button"><Plus className="size-4" />Add Database User</button>
		</div>
		{!data ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="size-7 animate-spin text-brand-primary" /></div> : <div className="mt-6 grid gap-4">
			{data.grants.map((grant) => <article className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5" key={grant.id}>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-all font-mono font-bold">{grant.user.username}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${grant.status === 'active' && grant.user.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{grant.status === 'active' ? grant.user.status : grant.status}</span><span className="rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-bold capitalize">{grant.accessLevel.replaceAll('_', ' ')}</span></div><p className="mt-2 text-sm text-app-muted">Access to {grant.impact.databaseCount} database{grant.impact.databaseCount === 1 ? '' : 's'} · {grant.expiresAt ? `expires ${new Date(grant.expiresAt).toLocaleString()}` : 'no expiry'}</p>{grant.accessLevel === 'custom' && <p className="mt-1 text-xs text-app-muted">{grant.privileges.join(', ')} · {grant.scopes.map(({ schema, table }) => table ? `${schema}.${table}` : `${schema}.*`).join(', ') || 'all schemas'}</p>}{grant.revokeReason && <p className="mt-1 text-xs text-red-500">{grant.revokeReason}</p>}</div>
					<div className="flex flex-wrap gap-2"><button aria-label="Reveal credential" className="rounded-lg border border-brand-primary/15 p-2" onClick={() => navigate(`${basePage}?databaseUser=${grant.user.id}&accessAction=reveal`)} type="button"><KeyRound className="size-4" /></button>{grant.status === 'active' && grant.accessLevel !== 'owner' && <><button className="rounded-lg border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => navigate(`${basePage}?grant=${grant.id}&accessAction=edit`)} type="button">Edit</button><button className="rounded-lg border border-red-500/30 px-3 py-2 text-sm font-bold text-red-600 dark:text-red-300" onClick={() => navigate(`${basePage}?grant=${grant.id}&accessAction=revoke`)} type="button">Revoke</button></>}{grant.user.status === 'active' ? <button className="rounded-lg border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => navigate(`${basePage}?databaseUser=${grant.user.id}&accessAction=suspend`)} type="button">Suspend</button> : <button className="rounded-lg border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => navigate(`${basePage}?databaseUser=${grant.user.id}&accessAction=restore`)} type="button">Restore</button>}<button aria-label="Rotate password" className="rounded-lg border border-brand-primary/15 p-2" onClick={() => navigate(`${basePage}?databaseUser=${grant.user.id}&accessAction=rotate`)} type="button"><RefreshCw className="size-4" /></button>{grant.impact.databaseCount === 0 && <button aria-label="Delete user" className="rounded-lg border border-red-500/30 p-2 text-red-600 dark:text-red-300" onClick={() => navigate(`${basePage}?databaseUser=${grant.user.id}&accessAction=delete`)} type="button"><Trash2 className="size-4" /></button>}</div>
				</div>
			</article>)}
			{!data.grants.length && <p className="rounded-2xl border border-dashed border-brand-primary/20 p-8 text-center text-sm text-app-muted">No database access records found.</p>}
		</div>}
		{(accessAction === 'create' || accessAction === 'edit') && data && <AccessFormDialog action={accessAction} busy={busy} data={data} grant={selectedGrant} onCancel={close} onCreate={async (input) => { const result = await mutate<{ credential?: Record<string, unknown> }>(`${baseApi}/access`, 'POST', input, 'Database access granted.'); if (result.credential) setCredential(result.credential); else close(); }} onUpdate={async (input) => { if (!selectedGrant) return; await mutate(`${baseApi}/access/${selectedGrant.id}`, 'PATCH', input, 'Database access updated.'); close(); }} />}
		{accessAction === 'revoke' && selectedGrant && <RevokeDialog busy={busy} grant={selectedGrant} onCancel={close} onSubmit={async (input) => { await mutate(`${baseApi}/access/${selectedGrant.id}`, 'DELETE', input, 'Database access revoked.'); close(); }} />}
		{accessAction && ['delete', 'restore', 'reveal', 'rotate', 'suspend'].includes(accessAction) && selectedUser && <UserActionDialog action={accessAction as DatabaseUserActionRequest['action']} busy={busy} onCancel={close} onSubmit={async (input) => { const result = await mutate<Record<string, unknown>>(`${baseApi}/users/${selectedUser.id}/action`, 'POST', input, `Database user ${accessAction} completed.`); if (accessAction === 'reveal' || accessAction === 'rotate') setCredential(result); else close(); }} user={selectedUser} />}
		{credential && <CredentialDialog credential={credential} databaseName={databaseName} onClose={close} />}
	</section>;
}

/** Shared create/edit form backed by the same Zod schemas as the API. */
function AccessFormDialog({ action, busy, data, grant, onCancel, onCreate, onUpdate }: { action: 'create' | 'edit'; busy: boolean; data: AccessPayload; grant?: AccessGrant; onCancel: () => void; onCreate: (input: CreateDatabaseAccessRequest) => Promise<void>; onUpdate: (input: UpdateDatabaseGrantRequest) => Promise<void> }) {
	const form = useForm<CreateDatabaseAccessRequest>({ resolver: zodResolver(createDatabaseAccessSchema), defaultValues: action === 'create' ? EMPTY_CREATE : { ...EMPTY_CREATE, username: 'existing', accessLevel: grant?.accessLevel === 'custom' ? 'custom' : grant?.accessLevel === 'read_write' ? 'read_write' : 'read_only', privileges: grant?.privileges ?? [], scopes: grant?.scopes ?? [], expiresAt: grant?.expiresAt ?? undefined } });
	const createForm = form;
	const accessLevel = useWatch({ control: form.control, name: 'accessLevel' });
	const userMode = useWatch({ control: createForm.control, name: 'userMode' });
	const privileges = useWatch({ control: form.control, name: 'privileges' }) ?? [];
	const submit = form.handleSubmit(async (input) => action === 'create' ? onCreate(input) : onUpdate(updateDatabaseGrantSchema.parse({ accessLevel: input.accessLevel, privileges: input.privileges, scopes: input.scopes, expiresAt: input.expiresAt })));
	return <Dialog title={action === 'create' ? 'Add Database User' : 'Edit Database Access'} onCancel={onCancel}><form onSubmit={(event) => void submit(event)}>
		{action === 'create' && <><fieldset><legend className="text-sm font-bold">Database user</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{(['new', 'existing'] as const).map((mode) => <Controller control={createForm.control} key={mode} name="userMode" render={({ field }) => <label className={`rounded-xl border p-3 font-bold capitalize ${field.value === mode ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/15'}`}><input checked={field.value === mode} className="mr-2" onChange={() => field.onChange(mode)} type="radio" />{mode}</label>} />)}</div></fieldset>{userMode === 'new' ? <><Controller control={createForm.control} name="username" render={({ field, fieldState }) => <Field error={fieldState.error?.message} hint={`Stored as ${data.usernamePrefix}${field.value || 'username'}`} label="Username"><div className="flex"><span className="rounded-l-xl border border-r-0 border-brand-primary/15 bg-brand-primary/5 px-4 py-3 font-mono text-sm">{data.usernamePrefix}</span><input {...field} className={`${INPUT_CLASS} rounded-l-none`} value={field.value ?? ''} /></div></Field>} /><Controller control={createForm.control} name="password" render={({ field, fieldState }) => <Field error={fieldState.error?.message} hint="Leave blank for a secure generated password shown once." label="Password"><input {...field} className={INPUT_CLASS} type="password" value={field.value ?? ''} /></Field>} /></> : <Controller control={createForm.control} name="databaseUserId" render={({ field, fieldState }) => <Field error={fieldState.error?.message} hint="The same login keeps its existing password." label="Existing user"><select {...field} className={INPUT_CLASS} value={field.value ?? ''}><option value="">Choose a user</option>{data.availableUsers.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select></Field>} />}</>}
		<fieldset className="mt-5"><legend className="text-sm font-bold">Access level</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{(['read_only', 'read_write', 'custom'] as const).map((level) => <Controller control={form.control} key={level} name="accessLevel" render={({ field }) => <label className={`rounded-xl border p-3 font-bold capitalize ${field.value === level ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/15'}`}><input checked={field.value === level} className="mr-2" onChange={() => { field.onChange(level); if (level !== 'custom') { form.setValue('privileges', []); form.setValue('scopes', []); } }} type="radio" />{level.replaceAll('_', ' ')}</label>} />)}</div></fieldset>
		{accessLevel === 'custom' && <div className="mt-5 rounded-xl border border-brand-primary/10 p-4"><p className="text-sm font-bold">Privileges</p><div className="mt-2 flex flex-wrap gap-4">{(['select', 'insert', 'update', 'delete'] as const).map((privilege) => <label className="text-sm capitalize" key={privilege}><input checked={privileges.includes(privilege)} className="mr-2" onChange={(event) => form.setValue('privileges', event.target.checked ? [...privileges, privilege] : privileges.filter((value) => value !== privilege), { shouldValidate: true })} type="checkbox" />{privilege}</label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Controller control={form.control} name="scopes" render={({ field }) => <Field hint="Leave blank for the default schema or enter a schema such as public." label="Schema"><input className={INPUT_CLASS} onChange={(event) => field.onChange(event.target.value ? [{ schema: event.target.value, table: field.value?.[0]?.table }] : [])} value={field.value?.[0]?.schema ?? ''} /></Field>} /><Controller control={form.control} name="scopes" render={({ field }) => <Field hint="Optional table name. Blank grants matching privileges across the schema." label="Table"><input className={INPUT_CLASS} disabled={!field.value?.[0]?.schema} onChange={(event) => field.onChange([{ schema: field.value?.[0]?.schema ?? '', table: event.target.value || undefined }])} value={field.value?.[0]?.table ?? ''} /></Field>} /></div></div>}
		<Controller control={form.control} name="expiresAt" render={({ field, fieldState }) => <Field error={fieldState.error?.message} hint="Optional. Expired access is revoked automatically by the background worker." label="Expires at"><input className={INPUT_CLASS} min={new Date().toISOString().slice(0, 16)} onChange={(event) => field.onChange(event.target.value ? new Date(event.target.value).toISOString() : undefined)} type="datetime-local" value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ''} /></Field>} />
		<DialogActions busy={busy} onCancel={onCancel} submitLabel={action === 'create' ? 'Grant Access' : 'Save Access'} />
	</form></Dialog>;
}

/** Exact-confirmation dialog for removing a database-specific grant. */
function RevokeDialog({ busy, grant, onCancel, onSubmit }: { busy: boolean; grant: AccessGrant; onCancel: () => void; onSubmit: (input: RevokeDatabaseGrantRequest) => Promise<void> }) {
	const { control, handleSubmit } = useForm<RevokeDatabaseGrantRequest>({ resolver: zodResolver(revokeDatabaseGrantSchema), defaultValues: { confirmation: '', reason: '' } });
	return <Dialog title="Revoke Database Access" onCancel={onCancel}><form onSubmit={(event) => void handleSubmit(onSubmit)(event)}><p className="text-sm text-app-muted">This removes access to this database only. Type <strong className="text-app-text">{grant.user.username}</strong> to confirm.</p><Controller control={control} name="confirmation" render={({ field, fieldState }) => <Field error={fieldState.error?.message} label="Username confirmation"><input {...field} className={INPUT_CLASS} /></Field>} /><Controller control={control} name="reason" render={({ field, fieldState }) => <Field error={fieldState.error?.message} label="Reason"><textarea {...field} className={`${INPUT_CLASS} min-h-24`} /></Field>} /><DialogActions busy={busy} danger onCancel={onCancel} submitLabel="Revoke Access" /></form></Dialog>;
}

/** Impact-confirmation dialog for cluster-level database user actions. */
function UserActionDialog({ action, busy, onCancel, onSubmit, user }: { action: DatabaseUserActionRequest['action']; busy: boolean; onCancel: () => void; onSubmit: (input: DatabaseUserActionRequest) => Promise<void>; user: AccessGrant['user'] }) {
	const { control, handleSubmit } = useForm<DatabaseUserActionRequest>({ resolver: zodResolver(databaseUserActionSchema), defaultValues: { acceptedImpact: true, action, confirmation: '' } });
	return <Dialog title={`${action[0].toUpperCase()}${action.slice(1)} Database User`} onCancel={onCancel}><form onSubmit={(event) => void handleSubmit(onSubmit)(event)}><p className="text-sm text-app-muted">This login may be shared by multiple databases. Type <strong className="text-app-text">{user.username}</strong> to confirm the impact.</p><Controller control={control} name="confirmation" render={({ field, fieldState }) => <Field error={fieldState.error?.message} label="Username confirmation"><input {...field} className={INPUT_CLASS} /></Field>} />{action === 'rotate' && <Controller control={control} name="password" render={({ field, fieldState }) => <Field error={fieldState.error?.message} hint="Leave blank to generate a secure password." label="New password"><input {...field} className={INPUT_CLASS} type="password" value={field.value ?? ''} /></Field>} />}{['delete', 'suspend'].includes(action) && <Controller control={control} name="reason" render={({ field, fieldState }) => <Field error={fieldState.error?.message} label="Reason"><textarea {...field} className={`${INPUT_CLASS} min-h-24`} value={field.value ?? ''} /></Field>} />}<DialogActions busy={busy} danger={['delete', 'suspend'].includes(action)} onCancel={onCancel} submitLabel={action === 'reveal' ? 'Reveal Credential' : `${action[0].toUpperCase()}${action.slice(1)} User`} /></form></Dialog>;
}

/** One-time credential view with browser clipboard support. */
function CredentialDialog({ credential, databaseName, onClose }: { credential: Record<string, unknown>; databaseName: string; onClose: () => void }) {
	const entries = Object.entries({ ...credential, databaseName }).filter(([, value]) => value !== undefined);
	return <Dialog title="Save Database Credential" onCancel={onClose}><p className="text-sm text-app-muted">Copy these values now. Passwords are masked again after closing.</p><dl className="mt-5 grid gap-3">{entries.map(([key, value]) => <div className="rounded-xl border border-brand-primary/10 p-3" key={key}><dt className="text-xs font-bold uppercase text-app-muted">{key.replaceAll(/([A-Z])/g, ' $1')}</dt><dd className="mt-1 flex items-start justify-between gap-3"><code className="break-all text-sm">{String(value)}</code><button className="shrink-0 rounded-lg border border-brand-primary/15 px-2 py-1 text-xs font-bold" onClick={() => void navigator.clipboard.writeText(String(value)).then(() => toast.success('Copied.'))} type="button">Copy</button></dd></div>)}</dl><div className="mt-5 flex justify-end"><button className="rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" onClick={onClose} type="button">Done</button></div></Dialog>;
}

/** Accessible modal shell used by URL-addressable access actions. */
function Dialog({ children, onCancel, title }: { children: React.ReactNode; onCancel: () => void; title: string }) {
	return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" role="dialog"><div className="my-auto w-full max-w-2xl rounded-3xl bg-app-surface p-6 shadow-2xl"><div className="flex items-center gap-3"><UserRoundCog className="size-6 text-brand-primary dark:text-brand-action" /><h3 className="text-2xl font-black">{title}</h3></div><div className="mt-5">{children}</div><button aria-label="Close" className="sr-only" onClick={onCancel} type="button">Close</button></div></div>;
}

/** Label, hint, and validation error wrapper for access forms. */
function Field({ children, error, hint, label }: { children: React.ReactNode; error?: string; hint?: string; label: string }) {
	return <label className="mt-4 block"><span className="text-sm font-bold">{label}</span><span className="mt-2 block">{children}</span>{hint && <small className="mt-1 block text-app-muted">{hint}</small>}{error && <small className="mt-1 block text-red-500">{error}</small>}</label>;
}

/** Consistent submit/cancel row with mutation feedback. */
function DialogActions({ busy, danger = false, onCancel, submitLabel }: { busy: boolean; danger?: boolean; onCancel: () => void; submitLabel: string }) {
	return <div className="mt-6 flex flex-wrap justify-end gap-3"><button className="rounded-xl border border-brand-primary/15 px-5 py-3 font-bold" disabled={busy} onClick={onCancel} type="button">Cancel</button><button className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold ${danger ? 'bg-red-600 text-white' : 'bg-brand-action text-brand-ink'}`} disabled={busy} type="submit">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{submitLabel}</button></div>;
}
