import { zodResolver } from '@hookform/resolvers/zod';
import { Activity, Plus, Shield, Smartphone, Trash2, UserCog, X } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';
import { createAdminSchema } from '@schemas/admin';

interface AdminSummary { createdAt: string; displayName?: string | null; id: string; mobileE164: string; mobileVerifiedAt?: string | null; status: 'active' | 'inactive' | 'suspended' }
interface RoleOption { code: string; description?: string | null; id: string; name: string }
interface PermissionOption { code: string; id: string; name: string }
interface AdminDetail extends AdminSummary {
	auditLogs: Array<{ action: string; createdAt: string; id: string }>;
	authenticationEvents: Array<{ createdAt: string; id: string; status: string; type: string }>;
	overrides: Array<{ effect: 'allow' | 'deny'; expiresAt?: string | null; id: string; permissionCode: string; permissionId: string; reason: string }>;
	roles: Array<RoleOption>;
	sessions: Array<{ browserName?: string | null; deviceLabel?: string | null; id: string; ipAddress?: string | null; lastActiveAt: string; osName?: string | null; revokedAt?: string | null }>;
}
interface ApiEnvelope<T> { data: T; message: string; status: boolean }

type CreateAdminForm = z.infer<typeof createAdminSchema>;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = await response.json() as ApiEnvelope<T>;
	if (!response.ok || !body.status) throw new Error(body.message);
	return body.data;
}

function formatted(value: string): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/** URL-driven administrator workspace for identities, roles, overrides, sessions, and security history. */
export default function AdminsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const selectedId = searchParams.get('admin');
	const creating = searchParams.get('action') === 'create';
	const [admins, setAdmins] = useState<AdminSummary[]>([]);
	const [roles, setRoles] = useState<RoleOption[]>([]);
	const [permissions, setPermissions] = useState<PermissionOption[]>([]);
	const [detail, setDetail] = useState<AdminDetail>();
	const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
	const [overrides, setOverrides] = useState<AdminDetail['overrides']>([]);
	const [busy, setBusy] = useState(false);
	const form = useForm<CreateAdminForm>({ resolver: zodResolver(createAdminSchema), defaultValues: { countryCallingCode: '+91', displayName: '', localMobileNumber: '', roleIds: [] } });

	const loadBase = useCallback(async () => {
		try {
			const [adminData, options] = await Promise.all([api<AdminSummary[]>('/api/v1/admins'), api<{ permissions: PermissionOption[]; roles: RoleOption[] }>('/api/v1/admins/options')]);
			setAdmins(adminData); setRoles(options.roles); setPermissions(options.permissions);
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load administrators.'); }
	}, []);

	useEffect(() => { const timeout = window.setTimeout(() => void loadBase(), 0); return () => clearTimeout(timeout); }, [loadBase]);
	useEffect(() => {
		if (!selectedId) return;
		const timeout = window.setTimeout(() => void api<AdminDetail>(`/api/v1/admins/${selectedId}`).then((value) => { setDetail(value); setSelectedRoles(value.roles.map(({ id }) => id)); setOverrides(value.overrides); }).catch((error) => toast.error(error.message)), 0);
		return () => clearTimeout(timeout);
	}, [selectedId]);

	function closePanel(): void { setSearchParams({}); setDetail(undefined); }

	async function createAdmin(values: CreateAdminForm): Promise<void> {
		setBusy(true);
		try {
			const created = await api<AdminSummary>('/api/v1/admins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
			toast.success('Administrator created.'); form.reset(); await loadBase(); setSearchParams({ admin: created.id });
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create administrator.'); } finally { setBusy(false); }
	}

	async function updateStatus(status: AdminSummary['status']): Promise<void> {
		if (!detail) return; setBusy(true);
		try { await api(`/api/v1/admins/${detail.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) }); toast.success('Status updated.'); await loadBase(); setDetail(await api(`/api/v1/admins/${detail.id}`)); }
		catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update status.'); } finally { setBusy(false); }
	}

	async function saveRoles(): Promise<void> {
		if (!detail) return; setBusy(true);
		try { await api(`/api/v1/admins/${detail.id}/roles`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roleIds: selectedRoles }) }); toast.success('Roles updated.'); }
		catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update roles.'); } finally { setBusy(false); }
	}

	async function saveOverrides(): Promise<void> {
		if (!detail) return; setBusy(true);
		try { await api(`/api/v1/admins/${detail.id}/overrides`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ overrides: overrides.map(({ permissionId, effect, reason, expiresAt }) => ({ permissionId, effect, reason, expiresAt })) }) }); toast.success('Permission overrides updated.'); }
		catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update overrides.'); } finally { setBusy(false); }
	}

	async function deleteAdmin(): Promise<void> {
		if (!detail) return; const reason = window.prompt('Reason for deleting this administrator'); if (!reason?.trim()) return;
		setBusy(true); try { await api(`/api/v1/admins/${detail.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) }); toast.success('Administrator deleted.'); closePanel(); await loadBase(); }
		catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to delete administrator.'); } finally { setBusy(false); }
	}

	return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Platform access</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Administrators</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Manage passwordless identities, roles, overrides, sessions, and security activity.</p></div><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700" onClick={() => setSearchParams({ action: 'create' })}><Plus className="size-4" />Add administrator</button></div>
		<div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/50 dark:text-slate-400"><tr><th className="px-5 py-3">Administrator</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Verified</th><th className="px-5 py-3"><span className="sr-only">Open</span></th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-800">{admins.map((admin) => <tr key={admin.id}><td className="px-5 py-4"><p className="font-semibold">{admin.displayName || 'Unnamed administrator'}</p><p className="text-slate-500 dark:text-slate-400">{admin.mobileE164}</p></td><td className="px-5 py-4 capitalize">{admin.status}</td><td className="px-5 py-4">{admin.mobileVerifiedAt ? 'Yes' : 'Pending first login'}</td><td className="px-5 py-4 text-right"><button className="font-semibold text-indigo-700 hover:underline dark:text-indigo-300" onClick={() => setSearchParams({ admin: admin.id })}>Manage</button></td></tr>)}</tbody></table></div></div>
	</div>
	{(creating || selectedId) && <div className="fixed inset-0 z-40 bg-slate-950/50" onMouseDown={(event) => { if (event.currentTarget === event.target) closePanel(); }}><aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl dark:bg-slate-900 sm:p-7"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{creating ? 'Add administrator' : detail?.displayName || 'Administrator details'}</h2><button className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={closePanel}><X className="size-5" /><span className="sr-only">Close</span></button></div>
	{creating ? <form className="mt-6 space-y-5" onSubmit={form.handleSubmit(createAdmin)}>{(['displayName', 'countryCallingCode', 'localMobileNumber'] as const).map((name) => <Controller control={form.control} key={name} name={name} render={({ field, fieldState }) => <label className="block text-sm font-medium capitalize">{name.replace(/([A-Z])/g, ' $1')}<input {...field} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />{fieldState.error && <span className="mt-1 block text-xs text-rose-600">{fieldState.error.message}</span>}</label>} />)}<Controller control={form.control} name="roleIds" render={({ field, fieldState }) => <fieldset><legend className="text-sm font-medium">Roles</legend><div className="mt-2 space-y-2">{roles.map((role) => <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700" key={role.id}><input checked={field.value.includes(role.id)} className="mt-1" onChange={(event) => field.onChange(event.target.checked ? [...field.value, role.id] : field.value.filter((id) => id !== role.id))} type="checkbox" /><span><span className="block font-medium">{role.name}</span><span className="text-xs text-slate-500 dark:text-slate-400">{role.description}</span></span></label>)}</div>{fieldState.error && <span className="mt-1 block text-xs text-rose-600">{fieldState.error.message}</span>}</fieldset>} /><button className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">Create administrator</button></form> : detail ? <div className="mt-6 space-y-7">
	<section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center gap-3"><UserCog className="size-5 text-indigo-600" /><div><p className="font-semibold">{detail.mobileE164}</p><p className="text-sm capitalize text-slate-500">{detail.status}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{(['active', 'inactive', 'suspended'] as const).map((status) => <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm capitalize disabled:opacity-50 dark:border-slate-700" disabled={busy || detail.status === status} key={status} onClick={() => void updateStatus(status)}>{status}</button>)}<button className="ml-auto inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white" onClick={() => void deleteAdmin()}><Trash2 className="size-4" />Delete</button></div></section>
	<section><h3 className="flex items-center gap-2 font-semibold"><Shield className="size-4" />Roles</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{roles.map((role) => <label className="flex gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700" key={role.id}><input checked={selectedRoles.includes(role.id)} onChange={(event) => setSelectedRoles(event.target.checked ? [...selectedRoles, role.id] : selectedRoles.filter((id) => id !== role.id))} type="checkbox" /><span>{role.name}</span></label>)}</div><button className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" disabled={busy || selectedRoles.length === 0} onClick={() => void saveRoles()}>Save roles</button></section>
	<section><h3 className="font-semibold">Permission overrides</h3><div className="mt-3 space-y-3">{overrides.map((override, index) => <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700" key={`${override.permissionId}-${index}`}><div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{override.permissionCode}</span><button aria-label="Remove override" onClick={() => setOverrides(overrides.filter((_, itemIndex) => itemIndex !== index))}><X className="size-4" /></button></div><div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr]"><select className="rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-800" onChange={(event) => setOverrides(overrides.map((item, itemIndex) => itemIndex === index ? { ...item, effect: event.target.value as 'allow' | 'deny' } : item))} value={override.effect}><option value="allow">Allow</option><option value="deny">Deny</option></select><input aria-label="Override reason" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-white" onChange={(event) => setOverrides(overrides.map((item, itemIndex) => itemIndex === index ? { ...item, reason: event.target.value } : item))} placeholder="Reason" value={override.reason} /></div></div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" defaultValue="" onChange={(event) => { const permission = permissions.find(({ id }) => id === event.target.value); if (permission && !overrides.some(({ permissionId }) => permissionId === permission.id)) setOverrides([...overrides, { id: crypto.randomUUID(), permissionId: permission.id, permissionCode: permission.code, effect: 'deny', reason: 'Explicit administrative override' }]); event.target.value = ''; }}><option value="">Add permission override…</option>{permissions.map((permission) => <option key={permission.id} value={permission.id}>{permission.code}</option>)}</select><button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" disabled={busy} onClick={() => void saveOverrides()}>Save overrides</button></div></section>
	<section><h3 className="flex items-center gap-2 font-semibold"><Smartphone className="size-4" />Sessions</h3><div className="mt-3 space-y-2">{detail.sessions.map((session) => <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700" key={session.id}><p className="font-medium">{session.deviceLabel || [session.browserName, session.osName].filter(Boolean).join(' · ') || 'Unknown device'}</p><p className="text-slate-500">{session.ipAddress || 'IP unavailable'} · {session.revokedAt ? 'Revoked' : `Active ${formatted(session.lastActiveAt)}`}</p></div>)}</div></section>
	<section><h3 className="flex items-center gap-2 font-semibold"><Activity className="size-4" />Authentication &amp; audit history</h3><div className="mt-3 space-y-2">{[...detail.authenticationEvents.map((event) => ({ id: event.id, label: event.type, status: event.status, at: event.createdAt })), ...detail.auditLogs.map((audit) => ({ id: audit.id, label: audit.action, status: 'audit', at: audit.createdAt }))].sort((a, b) => b.at.localeCompare(a.at)).map((event) => <div className="flex justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700" key={`${event.status}-${event.id}`}><span>{event.label}</span><time className="text-slate-500">{formatted(event.at)}</time></div>)}</div></section>
	</div> : <p className="mt-8 text-slate-500">Loading administrator…</p>}
	</aside></div>}
	</main>;
}
