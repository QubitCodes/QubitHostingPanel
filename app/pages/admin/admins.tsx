import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Plus, Search, Shield, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';

import { Offcanvas } from '@root/app/components/ui/offcanvas';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';
import { createAdminSchema } from '@schemas/admin';

interface AdminSummary {
	createdAt: string;
	displayName?: string | null;
	id: string;
	mobileE164: string;
	mobileVerifiedAt?: string | null;
	status: 'active' | 'inactive' | 'suspended';
}
interface RoleOption {
	code: string;
	description?: string | null;
	id: string;
	name: string;
	permissionIds: string[];
}
interface PermissionOption {
	code: string;
	id: string;
	name: string;
}
interface AdminDetail extends AdminSummary {
	overrides: Array<{ effect: 'allow' | 'deny'; permissionId: string }>;
	roles: RoleOption[];
}
interface ApiEnvelope<T> {
	data: T;
	message: string;
	status: boolean;
}
type CreateAdminForm = z.infer<typeof createAdminSchema>;
type Tab = 'basic' | 'roles' | 'permissions';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = (await response.json()) as ApiEnvelope<T>;
	if (!response.ok || !body.status) throw new Error(body.message);
	return body.data;
}

function effectivePermissionIds(
	inherited: Set<string>,
	overrides: AdminDetail['overrides'],
): Set<string> {
	const result = new Set(inherited);
	overrides.forEach(({ effect, permissionId }) =>
		effect === 'allow' ? result.add(permissionId) : result.delete(permissionId),
	);
	return result;
}

function normalizedTab(value?: string): Tab {
	return value === 'roles' || value === 'permissions' ? value : 'basic';
}

/** Full-width URL-driven administrator create, view, and update workspace. */
export default function AdminsPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { adminId, section } = useParams();
	const creating = location.pathname.includes('/create');
	const activeTab = normalizedTab(section);
	const [admins, setAdmins] = useState<AdminSummary[]>([]);
	const [roles, setRoles] = useState<RoleOption[]>([]);
	const [permissions, setPermissions] = useState<PermissionOption[]>([]);
	const [detail, setDetail] = useState<AdminDetail>();
	const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
	const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
		new Set(),
	);
	const [roleSearch, setRoleSearch] = useState('');
	const [permissionSearch, setPermissionSearch] = useState('');
	const [permissionNote, setPermissionNote] = useState<string>();
	const [busy, setBusy] = useState(false);
	const draft = useMemo(() => {
		if (typeof sessionStorage === 'undefined') return undefined;
		try {
			return JSON.parse(
				sessionStorage.getItem('adminCreateDraft') ?? 'null',
			) as Partial<CreateAdminForm> | undefined;
		} catch {
			return undefined;
		}
	}, []);
	const form = useForm<CreateAdminForm>({
		resolver: zodResolver(createAdminSchema),
		defaultValues: {
			countryCode: draft?.countryCode ?? '+91',
			displayName: draft?.displayName ?? '',
			mobile: draft?.mobile ?? '',
			roleIds: draft?.roleIds ?? [],
		},
	});
	const draftRoleIds = useMemo(() => draft?.roleIds ?? [], [draft]);

	const loadBase = useCallback(async () => {
		try {
			const [adminData, options] = await Promise.all([
				api<AdminSummary[]>('/api/v1/admins'),
				api<{ permissions: PermissionOption[]; roles: RoleOption[] }>(
					'/api/v1/admins/options',
				),
			]);
			setAdmins(adminData);
			setRoles(options.roles);
			setPermissions(options.permissions);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Unable to load administrators.',
			);
		}
	}, []);

	useEffect(() => {
		const timeout = window.setTimeout(() => void loadBase(), 0);
		return () => clearTimeout(timeout);
	}, [loadBase]);
	useEffect(() => {
		if (!adminId) return;
		const timeout = window.setTimeout(
			() =>
				void api<AdminDetail>(`/api/v1/admins/${adminId}`)
					.then((value) => {
						setDetail(value);
						const roleIds = value.roles.map(({ id }) => id);
						setSelectedRoles(roleIds);
						const inherited = new Set(
							roles
								.filter(({ id }) => roleIds.includes(id))
								.flatMap(({ permissionIds }) => permissionIds),
						);
						setSelectedPermissions(
							effectivePermissionIds(inherited, value.overrides),
						);
					})
					.catch((error) => toast.error(error.message)),
			0,
		);
		return () => clearTimeout(timeout);
	}, [adminId, roles]);
	useEffect(() => {
		if (!creating) return;
		const timeout = window.setTimeout(() => {
			setSelectedRoles(draftRoleIds);
			setSelectedPermissions(
				new Set(
					roles
						.filter(({ id }) => draftRoleIds.includes(id))
						.flatMap(({ permissionIds }) => permissionIds),
				),
			);
		}, 0);
		return () => clearTimeout(timeout);
	}, [creating, draftRoleIds, roles]);

	const inheritedPermissions = useMemo(
		() =>
			new Set(
				roles
					.filter(({ id }) => selectedRoles.includes(id))
					.flatMap(({ permissionIds }) => permissionIds),
			),
		[roles, selectedRoles],
	);
	const filteredRoles = roles.filter((role) =>
		`${role.name} ${role.code} ${role.description ?? ''}`
			.toLowerCase()
			.includes(roleSearch.toLowerCase()),
	);
	const filteredPermissions = permissions.filter((permission) =>
		`${permission.name} ${permission.code}`
			.toLowerCase()
			.includes(permissionSearch.toLowerCase()),
	);
	const permissionModules = Object.entries(
		filteredPermissions.reduce<Record<string, PermissionOption[]>>(
			(modules, permission) => {
				const module = permission.code.split('.')[0] ?? 'general';
				(modules[module] ??= []).push(permission);
				return modules;
			},
			{},
		),
	);
	const basePath = creating
		? '/admin/administrators/create'
		: `/admin/administrators/${adminId}`;

	function go(tab: Tab): void {
		if (creating && typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(
				'adminCreateDraft',
				JSON.stringify({ ...form.getValues(), roleIds: selectedRoles }),
			);
		}
		navigate(`${basePath}/${tab}`);
	}
	function close(): void {
		navigate('/admin/administrators');
		setDetail(undefined);
		if (typeof sessionStorage !== 'undefined')
			sessionStorage.removeItem('adminCreateDraft');
	}
	function updateRoles(next: string[]): void {
		setSelectedRoles(next);
		form.setValue('roleIds', next, { shouldValidate: true });
		if (creating && typeof sessionStorage !== 'undefined')
			sessionStorage.setItem(
				'adminCreateDraft',
				JSON.stringify({ ...form.getValues(), roleIds: next }),
			);
	}
	function updatePermissionSelection(ids: string[], selected: boolean): void {
		const next = new Set(selectedPermissions);
		ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
		setSelectedPermissions(next);
		setPermissionNote(
			'Permissions updated. Save changes or reset to role defaults.',
		);
	}
	function resetPermissions(): void {
		setSelectedPermissions(new Set(inheritedPermissions));
		setPermissionNote(
			'Permissions reset to the access inherited from selected roles.',
		);
	}
	function buildOverrides(): Array<{
		effect: 'allow' | 'deny';
		permissionId: string;
		reason: string;
	}> {
		return permissions.flatMap(({ id }) =>
			selectedPermissions.has(id) === inheritedPermissions.has(id)
				? []
				: [
						{
							permissionId: id,
							effect: selectedPermissions.has(id)
								? ('allow' as const)
								: ('deny' as const),
							reason: 'Updated permission through administrator workspace',
						},
					],
		);
	}

	async function saveRoles(): Promise<void> {
		if (!adminId) return;
		setBusy(true);
		try {
			await api(`/api/v1/admins/${adminId}/roles`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ roleIds: selectedRoles }),
			});
			toast.success('Roles updated.');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to update roles.',
			);
		} finally {
			setBusy(false);
		}
	}
	async function savePermissions(): Promise<void> {
		if (!adminId) return;
		setBusy(true);
		try {
			await api(`/api/v1/admins/${adminId}/overrides`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ overrides: buildOverrides() }),
			});
			setPermissionNote(undefined);
			toast.success('Permissions updated.');
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Unable to update permissions.',
			);
		} finally {
			setBusy(false);
		}
	}
	async function createAdmin(values: CreateAdminForm): Promise<void> {
		setBusy(true);
		try {
			const created = await api<AdminSummary>('/api/v1/admins', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...values, roleIds: selectedRoles }),
			});
			const overrides = buildOverrides();
			if (overrides.length)
				await api(`/api/v1/admins/${created.id}/overrides`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ overrides }),
				});
			if (typeof sessionStorage !== 'undefined')
				sessionStorage.removeItem('adminCreateDraft');
			toast.success('Administrator created.');
			await loadBase();
			navigate(`/admin/administrators/${created.id}/basic`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Unable to create administrator.',
			);
		} finally {
			setBusy(false);
		}
	}
	async function updateBasic(): Promise<void> {
		if (!adminId || !detail) return;
		setBusy(true);
		try {
			await api(`/api/v1/admins/${adminId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					displayName: detail.displayName,
					status: detail.status,
				}),
			});
			toast.success('Basic details updated.');
			await loadBase();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Unable to update administrator.',
			);
		} finally {
			setBusy(false);
		}
	}
	async function deleteAdmin(): Promise<void> {
		if (!adminId) return;
		const reason = window.prompt('Reason for deleting this administrator');
		if (!reason?.trim()) return;
		setBusy(true);
		try {
			await api(`/api/v1/admins/${adminId}`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reason }),
			});
			toast.success('Administrator deleted.');
			close();
			await loadBase();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Unable to delete administrator.',
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto max-w-7xl">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-sm font-semibold text-teal-700 dark:text-[#e0ff71]">
						Platform access
					</p>
					<h2 className="mt-1 text-3xl font-bold">Administrators</h2>
					<p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
						Manage identities, roles, and effective permissions.
					</p>
				</div>
				<Link
					className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#123c32] px-4 py-2.5 text-sm font-semibold text-white dark:bg-[#e0ff71] dark:text-[#123c32]"
					to="/admin/administrators/create/basic"
				>
					<Plus className="size-4" />
					Add administrator
				</Link>
			</div>
			<div className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-[#1b211e]">
				<table className="w-full text-sm">
					<thead className="bg-stone-50 text-left text-xs uppercase text-stone-500 dark:bg-stone-950/50">
						<tr>
							<th className="px-5 py-3">Administrator</th>
							<th className="px-5 py-3">Status</th>
							<th className="px-5 py-3 text-right">Action</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-stone-200 dark:divide-stone-800">
						{admins.map((admin) => (
							<tr key={admin.id}>
								<td className="px-5 py-4">
									<p className="font-semibold">
										{admin.displayName || 'Unnamed administrator'}
									</p>
									<p className="text-stone-500">{admin.mobileE164}</p>
								</td>
								<td className="px-5 py-4 capitalize">{admin.status}</td>
								<td className="px-5 py-4 text-right">
									<Link
										className="font-semibold text-teal-700 dark:text-[#e0ff71]"
										to={`/admin/administrators/${admin.id}/basic`}
									>
										Manage
									</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{(creating || adminId) && (
				<Offcanvas
					onClose={close}
					title={
						creating
							? 'Add administrator'
							: detail?.displayName || 'Administrator details'
					}
					width="full"
				>
					<nav className="mt-5 flex gap-2 border-b border-stone-200 dark:border-stone-800">
						{(['basic', 'roles', 'permissions'] as Tab[]).map((tab) => (
							<Link
								className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize ${activeTab === tab ? 'border-teal-700 text-teal-800 dark:border-[#e0ff71] dark:text-[#e0ff71]' : 'border-transparent text-stone-500'}`}
								key={tab}
								to={`${basePath}/${tab}`}
							>
								{tab === 'basic' ? 'Basic details' : tab}
							</Link>
						))}
					</nav>
					{activeTab === 'basic' &&
						(creating ? (
							<form
								className="mt-7 max-w-2xl space-y-5"
								onSubmit={(event) => {
									event.preventDefault();
									go('roles');
								}}
							>
								{(['displayName', 'countryCode', 'mobile'] as const).map(
									(name) => (
										<Controller
											control={form.control}
											key={name}
											name={name}
											render={({ field, fieldState }) => (
												<label className="block text-sm font-medium capitalize">
													{name.replace(/([A-Z])/g, ' $1')}
													<input
														{...field}
														className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900"
													/>
													{fieldState.error && (
														<span className="mt-1 block text-xs text-rose-600">
															{fieldState.error.message}
														</span>
													)}
												</label>
											)}
										/>
									),
								)}
								<button
									className="rounded-xl bg-[#123c32] px-4 py-2.5 font-semibold text-white"
									type="submit"
								>
									Continue to roles
								</button>
							</form>
						) : detail ? (
							<div className="mt-7 max-w-2xl space-y-5">
								<label className="block text-sm font-medium">
									Display name
									<input
										className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900"
										onChange={(event) =>
											setDetail({ ...detail, displayName: event.target.value })
										}
										value={detail.displayName ?? ''}
									/>
								</label>
								<label className="block text-sm font-medium">
									Status
									<select
										className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 dark:border-stone-700 dark:bg-stone-900"
										onChange={(event) =>
											setDetail({
												...detail,
												status: event.target.value as AdminSummary['status'],
											})
										}
										value={detail.status}
									>
										<option value="active">Active</option>
										<option value="inactive">Inactive</option>
										<option value="suspended">Suspended</option>
									</select>
								</label>
								<div className="flex gap-3">
									<button
										className="rounded-xl bg-[#123c32] px-4 py-2.5 font-semibold text-white"
										disabled={busy}
										onClick={() => void updateBasic()}
									>
										Save details
									</button>
									<button
										className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-semibold text-white"
										onClick={() => void deleteAdmin()}
									>
										<Trash2 className="size-4" />
										Delete
									</button>
								</div>
							</div>
						) : (
							<p className="mt-7 text-stone-500">Loading administrator…</p>
						))}
					{activeTab === 'roles' && (
						<section className="mt-7">
							<div className="flex flex-wrap items-center gap-3">
								<label className="relative min-w-64 flex-1">
									<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
									<input
										className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3 dark:border-stone-700 dark:bg-stone-900"
										onChange={(event) => setRoleSearch(event.target.value)}
										placeholder="Search roles"
										value={roleSearch}
									/>
								</label>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={() =>
										updateRoles([
											...new Set([
												...selectedRoles,
												...filteredRoles.map(({ id }) => id),
											]),
										])
									}
								>
									Select filtered
								</button>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={() =>
										updateRoles(
											selectedRoles.filter(
												(id) => !filteredRoles.some((role) => role.id === id),
											),
										)
									}
								>
									Deselect filtered
								</button>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={() => updateRoles(roles.map(({ id }) => id))}
								>
									Select all
								</button>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={() => updateRoles([])}
								>
									Deselect all
								</button>
							</div>
							<p className="mt-4 text-sm text-stone-500">
								{selectedRoles.length} of {roles.length} roles selected
							</p>
							<div className="mt-4 grid gap-3 md:grid-cols-2">
								{filteredRoles.map((role) => (
									<label
										className="flex gap-3 rounded-2xl border border-stone-200 p-4 dark:border-stone-800"
										key={role.id}
									>
										<input
											checked={selectedRoles.includes(role.id)}
											onChange={(event) =>
												updateRoles(
													event.target.checked
														? [...selectedRoles, role.id]
														: selectedRoles.filter((id) => id !== role.id),
												)
											}
											type="checkbox"
										/>
										<span>
											<span className="block font-semibold">{role.name}</span>
											<span className="text-sm text-stone-500">
												{role.description || role.code}
											</span>
										</span>
									</label>
								))}
							</div>
							<button
								className="mt-6 rounded-xl bg-[#123c32] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
								disabled={busy || selectedRoles.length === 0}
								onClick={() =>
									creating ? go('permissions') : void saveRoles()
								}
							>
								{creating ? 'Continue to permissions' : 'Save roles'}
							</button>
						</section>
					)}
					{activeTab === 'permissions' && (
						<section className="mt-7">
							{permissionNote && (
								<div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
									<Check className="size-5" />
									<span className="flex-1">{permissionNote}</span>
									<button
										className="font-semibold underline"
										onClick={resetPermissions}
									>
										Reset permissions
									</button>
								</div>
							)}
							<div className="flex flex-wrap items-center gap-3">
								<label className="relative min-w-64 flex-1">
									<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
									<input
										className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-9 pr-3 dark:border-stone-700 dark:bg-stone-900"
										onChange={(event) =>
											setPermissionSearch(event.target.value)
										}
										placeholder="Search permissions"
										value={permissionSearch}
									/>
								</label>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={() =>
										updatePermissionSelection(
											filteredPermissions.map(({ id }) => id),
											true,
										)
									}
								>
									Select filtered
								</button>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={() =>
										updatePermissionSelection(
											filteredPermissions.map(({ id }) => id),
											false,
										)
									}
								>
									Deselect filtered
								</button>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={() =>
										updatePermissionSelection(
											permissions.map(({ id }) => id),
											true,
										)
									}
								>
									Select all
								</button>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={() =>
										updatePermissionSelection(
											permissions.map(({ id }) => id),
											false,
										)
									}
								>
									Deselect all
								</button>
								<button
									className="rounded-xl border px-3 py-2 text-sm"
									onClick={resetPermissions}
								>
									Reset permissions
								</button>
							</div>
							<p className="mt-4 text-sm text-stone-500">
								{selectedPermissions.size} of {permissions.length} permissions
								selected
							</p>
							<div className="mt-5 space-y-5">
								{permissionModules.map(([module, items = []]) => (
									<section
										className="rounded-2xl border border-stone-200 p-5 dark:border-stone-800"
										key={module}
									>
										<div className="flex items-center justify-between gap-4">
											<h3 className="flex items-center gap-2 font-semibold capitalize">
												<Shield className="size-4" />
												{module}
											</h3>
											<div className="flex gap-2">
												<button
													className="text-xs font-semibold text-teal-700"
													onClick={() =>
														updatePermissionSelection(
															items.map(({ id }) => id),
															true,
														)
													}
												>
													Select all
												</button>
												<button
													className="text-xs font-semibold text-stone-500"
													onClick={() =>
														updatePermissionSelection(
															items.map(({ id }) => id),
															false,
														)
													}
												>
													Deselect all
												</button>
											</div>
										</div>
										<div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
											{items.map((permission) => (
												<label
													className="flex items-start gap-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-900"
													key={permission.id}
												>
													<input
														checked={selectedPermissions.has(permission.id)}
														onChange={(event) =>
															updatePermissionSelection(
																[permission.id],
																event.target.checked,
															)
														}
														type="checkbox"
													/>
													<span>
														<span className="block text-sm font-medium">
															{permission.name}
														</span>
														<span className="text-xs text-stone-500">
															{permission.code}
															{inheritedPermissions.has(permission.id)
																? ' · Inherited'
																: ''}
														</span>
													</span>
												</label>
											))}
										</div>
									</section>
								))}
							</div>
							<button
								className="mt-6 rounded-xl bg-[#123c32] px-4 py-2.5 font-semibold text-white disabled:opacity-50"
								disabled={busy || selectedRoles.length === 0}
								onClick={
									creating
										? form.handleSubmit(createAdmin)
										: () => void savePermissions()
								}
							>
								{creating ? 'Create administrator' : 'Save permissions'}
							</button>
						</section>
					)}
				</Offcanvas>
			)}
		</div>
	);
}
