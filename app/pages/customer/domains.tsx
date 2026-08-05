import {
	Globe2,
	LoaderCircle,
	Pencil,
	Plus,
	RefreshCw,
	Save,
	ServerCog,
	Trash2,
	X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
	Link,
	useNavigate,
	useOutletContext,
	useSearchParams,
} from 'react-router';
import { toast } from 'sonner';

import { DataTable } from '@components/ui/data-table';
import { Offcanvas } from '@components/ui/offcanvas';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface RootDomain {
	hostname: string;
	id: string;
	status: string;
	subdomainCount: number;
	verificationMethod: string;
	verificationToken?: string | null;
}
interface DnsRecord {
	content: string;
	id: string;
	isEnabled: boolean;
	name: string;
	priority?: number | null;
	proxied: boolean;
	published: boolean;
	source: string;
	ttl: number;
	type: string;
	updatedAt: string;
}
interface DomainDetail {
	domain: RootDomain;
	records: DnsRecord[];
	subdomains: Array<{
		applicationId: string;
		applicationName: string;
		domainId: string;
		hostname: string;
		status: string;
		tlsStatus: string;
	}>;
	zone: {
		delegationVerifiedAt?: string | null;
		lastError?: string | null;
		lastImportedAt?: string | null;
		lastSynchronizedAt?: string | null;
		nameservers: string[];
		provisioned: boolean;
		status: string;
	};
}
interface ApiBody<T> {
	data?: T;
	message: string;
	status: boolean;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = (await response.json()) as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined)
		throw new Error(body.message);
	return body.data;
}

/** Root-domain inventory with URL-addressed DNS, subdomain, and ownership detail. */
export default function CustomerDomainsPage() {
	const { active } = useOutletContext<{ active?: { publicId: number } }>();
	const workspaceId = active?.publicId;
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const selectedId = searchParams.get('domain');
	const tab = searchParams.get('tab') ?? 'overview';
	const [domains, setDomains] = useState<RootDomain[]>([]);
	const [detail, setDetail] = useState<DomainDetail>();
	const [editingRecord, setEditingRecord] = useState<DnsRecord>();
	const [loading, setLoading] = useState(true);
	const [working, setWorking] = useState(false);
	const load = useCallback(async () => {
		if (!workspaceId) return;
		setLoading(true);
		try {
			setDomains(
				await api<RootDomain[]>(`/api/v1/workspaces/${workspaceId}/domains`),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to load domains.',
			);
		} finally {
			setLoading(false);
		}
	}, [workspaceId]);
	const loadDetail = useCallback(async () => {
		if (!workspaceId || !selectedId) {
			setDetail(undefined);
			return;
		}
		try {
			setDetail(
				await api<DomainDetail>(
					`/api/v1/workspaces/${workspaceId}/domains/${selectedId}/dns`,
				),
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to load domain.',
			);
		}
	}, [selectedId, workspaceId]);
	useEffect(() => {
		const timeout = window.setTimeout(() => void load(), 0);
		return () => window.clearTimeout(timeout);
	}, [load]);
	useEffect(() => {
		const timeout = window.setTimeout(() => void loadDetail(), 0);
		return () => window.clearTimeout(timeout);
	}, [loadDetail]);
	async function post(
		path: string,
		body: unknown,
		success: string,
	): Promise<void> {
		setWorking(true);
		try {
			await api(path, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			});
			toast.success(success);
			await loadDetail();
			await load();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Domain operation failed.',
			);
		} finally {
			setWorking(false);
		}
	}
	async function importRecords(
		source: 'godaddy' | 'hostinger' | 'public_scan' | 'zone_file',
		form?: HTMLFormElement,
	): Promise<void> {
		if (!workspaceId || !selectedId) return;
		const data = form ? new FormData(form) : undefined;
		await post(
			`/api/v1/workspaces/${workspaceId}/domains/${selectedId}/dns/import`,
			{
				source,
				...(data?.get('apiToken')
					? { apiToken: String(data.get('apiToken')) }
					: {}),
				...(data?.get('zoneFile')
					? { zoneFile: String(data.get('zoneFile')) }
					: {}),
			},
			'DNS records captured into the draft.',
		);
		if (form) form.reset();
	}
	async function createRecord(form: HTMLFormElement): Promise<void> {
		if (!workspaceId || !selectedId) return;
		const data = new FormData(form);
		await post(
			`/api/v1/workspaces/${workspaceId}/domains/${selectedId}/dns/records`,
			{
				name: String(data.get('name')),
				type: String(data.get('type')),
				content: String(data.get('content')),
				ttl: Number(data.get('ttl')),
				proxied: data.get('proxied') === 'on',
				...(data.get('priority')
					? { priority: Number(data.get('priority')) }
					: {}),
			},
			'DNS record added.',
		);
		form.reset();
	}
	async function updateRecord(): Promise<void> {
		if (!workspaceId || !selectedId || !editingRecord) return;
		await post(
			`/api/v1/workspaces/${workspaceId}/domains/${selectedId}/dns/records/${editingRecord.id}`,
			{
				name: editingRecord.name,
				type: editingRecord.type,
				content: editingRecord.content,
				ttl: editingRecord.ttl,
				priority: editingRecord.priority ?? null,
				proxied: editingRecord.proxied,
			},
			'DNS record updated.',
		);
		setEditingRecord(undefined);
	}
	async function removeRecord(record: DnsRecord): Promise<void> {
		if (
			!workspaceId ||
			!selectedId ||
			!window.confirm(`Remove ${record.type} ${record.name}?`)
		)
			return;
		setWorking(true);
		try {
			await api(
				`/api/v1/workspaces/${workspaceId}/domains/${selectedId}/dns/records/${record.id}`,
				{ method: 'DELETE' },
			);
			toast.success('DNS record removed.');
			await loadDetail();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to remove DNS record.',
			);
		} finally {
			setWorking(false);
		}
	}
	const selectTab = (next: string) =>
		navigate(`/dashboard/domains?domain=${selectedId}&tab=${next}`);
	return (
		<main className="mx-auto max-w-7xl">
			<p className="text-sm font-semibold text-brand-primary dark:text-brand-action">
				Workspace routing
			</p>
			<h2 className="mt-2 text-4xl font-black">Domains</h2>
			<p className="mt-3 text-app-muted">
				Root domains owned by this workspace. External application subdomains
				remain with their applications.
			</p>
			{loading ? (
				<LoaderCircle className="mt-8 size-6 animate-spin" />
			) : (
				<div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{domains.map((domain) => (
						<Link
							className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6 transition hover:border-brand-action"
							key={domain.id}
							to={`/dashboard/domains?domain=${domain.id}&tab=overview`}
						>
							<Globe2 className="size-6 text-brand-primary dark:text-brand-action" />
							<h3 className="mt-4 text-xl font-black">{domain.hostname}</h3>
							<p className="mt-2 text-sm capitalize text-app-muted">
								{domain.status} · {domain.subdomainCount} managed subdomain
								{domain.subdomainCount === 1 ? '' : 's'}
							</p>
						</Link>
					))}
					{!domains.length && (
						<p className="text-app-muted">
							No root domains are registered in this workspace.
						</p>
					)}
				</div>
			)}
			{selectedId && (
				<Offcanvas
					onClose={() => navigate('/dashboard/domains')}
					title={detail?.domain.hostname ?? 'Domain'}
					width="full"
				>
					<div className="flex gap-2 overflow-x-auto border-b border-brand-primary/10">
						{['overview', 'dns', 'subdomains', 'ssl', 'activity'].map(
							(item) => (
								<button
									className={`shrink-0 border-b-2 px-4 py-3 text-sm font-bold capitalize ${tab === item ? 'border-brand-action text-brand-primary dark:text-brand-action' : 'border-transparent text-app-muted'}`}
									key={item}
									onClick={() => selectTab(item)}
									type="button"
								>
									{item === 'dns' ? 'DNS Config' : item}
								</button>
							),
						)}
					</div>
					{!detail ? (
						<LoaderCircle className="mt-8 size-6 animate-spin" />
					) : (
						<div className="mt-6">
							{tab === 'overview' && (
								<div className="grid gap-4 sm:grid-cols-3">
									{[
										['Ownership', detail.domain.status],
										['DNS zone', detail.zone.status],
										['Subdomains', String(detail.subdomains.length)],
									].map(([label, value]) => (
										<article
											className="rounded-2xl border border-brand-primary/10 p-5"
											key={label}
										>
											<p className="text-xs font-bold uppercase text-app-muted">
												{label}
											</p>
											<p className="mt-2 font-bold capitalize">{value}</p>
										</article>
									))}
								</div>
							)}
							{tab === 'dns' && (
								<div className="space-y-6">
									<section className="rounded-2xl border border-brand-primary/10 p-5">
										<h3 className="font-black">Capture current DNS</h3>
										<p className="mt-1 text-sm text-app-muted">
											Capture and review records before changing nameservers.
											Leave a token blank to use the platform connection. A
											supplied token is used once and is not stored.
										</p>
										<div className="mt-4 flex flex-wrap gap-2">
											<button
												className="rounded-xl bg-brand-action px-4 py-2 text-sm font-bold text-brand-ink"
												disabled={working}
												onClick={() => void importRecords('public_scan')}
												type="button"
											>
												Public scan
											</button>
										</div>
										<div className="mt-4 grid gap-4 lg:grid-cols-2">
											<form
												className="grid gap-3 rounded-xl border border-brand-primary/10 p-4"
												onSubmit={(event) => {
													event.preventDefault();
													void importRecords('godaddy', event.currentTarget);
												}}
											>
												<strong>GoDaddy import</strong>
												<input
													className="rounded-xl border border-brand-primary/15 bg-app-canvas px-3 py-2"
													name="apiToken"
													placeholder="Optional personal access token"
													type="password"
												/>
												<button
													className="rounded-xl border border-brand-primary/15 px-3 py-2 font-bold"
													disabled={working}
												>
													Capture
												</button>
											</form>
											<form
												className="grid gap-3 rounded-xl border border-brand-primary/10 p-4"
												onSubmit={(event) => {
													event.preventDefault();
													void importRecords('hostinger', event.currentTarget);
												}}
											>
												<strong>Hostinger import</strong>
												<input
													className="rounded-xl border border-brand-primary/15 bg-app-canvas px-3 py-2"
													name="apiToken"
													placeholder="Optional API token"
													type="password"
												/>
												<button
													className="rounded-xl border border-brand-primary/15 px-3 py-2 font-bold"
													disabled={working}
												>
													Capture
												</button>
											</form>
										</div>
										<form
											className="mt-4 grid gap-3"
											onSubmit={(event) => {
												event.preventDefault();
												void importRecords('zone_file', event.currentTarget);
											}}
										>
											<textarea
												className="min-h-32 rounded-xl border border-brand-primary/15 bg-app-canvas p-3 font-mono text-sm"
												name="zoneFile"
												placeholder="Paste a BIND zone file"
												required
											/>
											<button
												className="w-fit rounded-xl border border-brand-primary/15 px-4 py-2 font-bold"
												disabled={working}
											>
												Import zone file
											</button>
										</form>
									</section>
									<section className="rounded-2xl border border-brand-primary/10 p-5">
										<div className="flex flex-wrap items-center justify-between gap-3">
											<div>
												<h3 className="font-black">Authoritative DNS</h3>
												<p className="text-sm text-app-muted">
													{detail.zone.provisioned
														? 'Records publish automatically. Sync retries any pending records.'
														: 'Create the managed zone, change nameservers, then refresh delegation.'}
												</p>
											</div>
											<div className="flex gap-2">
												<button
													className="rounded-xl bg-brand-action px-4 py-2 text-sm font-bold text-brand-ink"
													disabled={working}
													onClick={() =>
														void post(
															`/api/v1/workspaces/${workspaceId}/domains/${selectedId}/dns`,
															{ action: 'provision' },
															'DNS zone provisioned.',
														)
													}
												>
													<ServerCog className="mr-2 inline size-4" />
													{detail.zone.provisioned
														? 'Sync records'
														: 'Enable managed DNS'}
												</button>
												<button
													className="rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold"
													disabled={working}
													onClick={() =>
														void post(
															`/api/v1/workspaces/${workspaceId}/domains/${selectedId}/dns`,
															{ action: 'refresh' },
															'Delegation refreshed.',
														)
													}
												>
													<RefreshCw className="mr-2 inline size-4" />
													Refresh
												</button>
											</div>
										</div>
										{detail.zone.nameservers.length > 0 && (
											<div className="mt-4 rounded-xl bg-app-canvas p-4 font-mono text-sm">
												{detail.zone.nameservers.map((value) => (
													<p key={value}>{value}</p>
												))}
											</div>
										)}
										<div className="mt-4 grid gap-2 text-xs text-app-muted sm:grid-cols-2">
											<p>
												Status:{' '}
												<strong className="capitalize text-app-ink">
													{detail.zone.status.replace('_', ' ')}
												</strong>
											</p>
											<p>
												Last synchronized:{' '}
												{detail.zone.lastSynchronizedAt
													? new Date(
															detail.zone.lastSynchronizedAt,
														).toLocaleString()
													: 'Not yet'}
											</p>
										</div>
										{detail.zone.lastError && (
											<p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
												{detail.zone.lastError}
											</p>
										)}
									</section>
									<form
										className="grid gap-3 rounded-2xl border border-brand-primary/10 p-5 sm:grid-cols-2 lg:grid-cols-7"
										onSubmit={(event) => {
											event.preventDefault();
											void createRecord(event.currentTarget);
										}}
									>
										<input
											className="rounded-xl border border-brand-primary/15 bg-app-canvas px-3 py-2"
											name="name"
											placeholder="Name or @"
											required
										/>
										<select
											className="rounded-xl border border-brand-primary/15 bg-app-canvas px-3 py-2"
											name="type"
										>
											{[
												'A',
												'AAAA',
												'CNAME',
												'MX',
												'TXT',
												'CAA',
												'SRV',
												'NS',
											].map((value) => (
												<option key={value}>{value}</option>
											))}
										</select>
										<input
											className="rounded-xl border border-brand-primary/15 bg-app-canvas px-3 py-2 lg:col-span-2"
											name="content"
											placeholder="Value"
											required
										/>
										<input
											className="rounded-xl border border-brand-primary/15 bg-app-canvas px-3 py-2"
											defaultValue="300"
											min="60"
											name="ttl"
											type="number"
										/>
										<input
											className="rounded-xl border border-brand-primary/15 bg-app-canvas px-3 py-2"
											min="0"
											name="priority"
											placeholder="Priority"
											type="number"
										/>
										<label className="flex items-center gap-2 rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-semibold">
											<input
												className="accent-brand-action"
												name="proxied"
												type="checkbox"
											/>
											Proxy traffic
										</label>
										<button
											className="rounded-xl bg-brand-action px-4 py-2 font-bold text-brand-ink sm:col-span-2 lg:col-span-7"
											disabled={working}
										>
											<Plus className="mr-2 inline size-4" />
											Add record
										</button>
									</form>
									<DataTable minimumWidth="55rem">
										<thead>
											<tr>
												<th className="px-4 py-3 text-left">Name</th>
												<th className="px-4 py-3 text-left">Type</th>
												<th className="px-4 py-3 text-left">Value</th>
												<th className="px-4 py-3 text-left">TTL</th>
												<th className="px-4 py-3 text-left">Priority</th>
												<th className="px-4 py-3 text-left">Published</th>
												<th className="px-4 py-3 text-left">Source</th>
												<th />
											</tr>
										</thead>
										<tbody>
											{detail.records.map((record) => (
												<tr
													className="border-t border-brand-primary/10"
													key={record.id}
												>
													<td className="px-4 py-3 font-mono">
														{editingRecord?.id === record.id ? (
															<input
																className="w-28 rounded-lg border border-brand-primary/15 bg-app-canvas px-2 py-1"
																onChange={(event) =>
																	setEditingRecord({
																		...editingRecord,
																		name: event.target.value,
																	})
																}
																value={editingRecord.name}
															/>
														) : (
															record.name
														)}
													</td>
													<td className="px-4 py-3">
														{editingRecord?.id === record.id ? (
															<select
																className="rounded-lg border border-brand-primary/15 bg-app-canvas px-2 py-1"
																onChange={(event) =>
																	setEditingRecord({
																		...editingRecord,
																		type: event.target.value,
																	})
																}
																value={editingRecord.type}
															>
																{[
																	'A',
																	'AAAA',
																	'CNAME',
																	'MX',
																	'TXT',
																	'CAA',
																	'SRV',
																	'NS',
																].map((value) => (
																	<option key={value}>{value}</option>
																))}
															</select>
														) : (
															record.type
														)}
													</td>
													<td className="max-w-md break-all px-4 py-3 font-mono text-sm">
														{editingRecord?.id === record.id ? (
															<input
																className="min-w-64 rounded-lg border border-brand-primary/15 bg-app-canvas px-2 py-1"
																onChange={(event) =>
																	setEditingRecord({
																		...editingRecord,
																		content: event.target.value,
																	})
																}
																value={editingRecord.content}
															/>
														) : (
															record.content
														)}
													</td>
													<td className="px-4 py-3">
														{editingRecord?.id === record.id ? (
															<input
																className="w-20 rounded-lg border border-brand-primary/15 bg-app-canvas px-2 py-1"
																min="60"
																onChange={(event) =>
																	setEditingRecord({
																		...editingRecord,
																		ttl: Number(event.target.value),
																	})
																}
																type="number"
																value={editingRecord.ttl}
															/>
														) : (
															record.ttl
														)}
													</td>
													<td className="px-4 py-3">
														{editingRecord?.id === record.id ? (
															<input
																className="w-20 rounded-lg border border-brand-primary/15 bg-app-canvas px-2 py-1"
																min="0"
																onChange={(event) =>
																	setEditingRecord({
																		...editingRecord,
																		priority: event.target.value
																			? Number(event.target.value)
																			: null,
																	})
																}
																type="number"
																value={editingRecord.priority ?? ''}
															/>
														) : (
															(record.priority ?? '—')
														)}
													</td>
													<td className="px-4 py-3">
														<div className="grid gap-2">
															<span
																className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${record.published ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}
															>
																{record.published ? 'Yes' : 'Pending'}
															</span>
															{editingRecord?.id === record.id &&
																['A', 'AAAA', 'CNAME'].includes(
																	editingRecord.type,
																) && (
																	<label className="flex items-center gap-2 text-xs">
																		<input
																			checked={editingRecord.proxied}
																			className="accent-brand-action"
																			onChange={(event) =>
																				setEditingRecord({
																					...editingRecord,
																					proxied: event.target.checked,
																				})
																			}
																			type="checkbox"
																		/>
																		Proxy traffic
																	</label>
																)}
														</div>
													</td>
													<td className="px-4 py-3 capitalize">
														{record.source.replace('_', ' ')}
													</td>
													<td className="px-4 py-3">
														{editingRecord?.id === record.id ? (
															<div className="flex gap-2">
																<button
																	aria-label="Save record"
																	className="text-emerald-600"
																	disabled={working}
																	onClick={() => void updateRecord()}
																	type="button"
																>
																	<Save className="size-4" />
																</button>
																<button
																	aria-label="Cancel editing"
																	className="text-app-muted"
																	onClick={() => setEditingRecord(undefined)}
																	type="button"
																>
																	<X className="size-4" />
																</button>
															</div>
														) : (
															<div className="flex gap-3">
																<button
																	aria-label="Edit record"
																	className="text-brand-primary disabled:opacity-30 dark:text-brand-action"
																	disabled={
																		record.source === 'platform_managed' ||
																		working
																	}
																	onClick={() => setEditingRecord(record)}
																	type="button"
																>
																	<Pencil className="size-4" />
																</button>
																<button
																	aria-label="Delete record"
																	className="text-red-600 disabled:opacity-30"
																	disabled={
																		record.source === 'platform_managed' ||
																		working
																	}
																	onClick={() => void removeRecord(record)}
																	type="button"
																>
																	<Trash2 className="size-4" />
																</button>
															</div>
														)}
													</td>
												</tr>
											))}
										</tbody>
									</DataTable>
								</div>
							)}
							{tab === 'subdomains' && (
								<div className="grid gap-3">
									{detail.subdomains.map((item) => (
										<article
											className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-primary/10 p-5"
											key={item.domainId}
										>
											<div>
												<p className="font-mono font-bold">{item.hostname}</p>
												<Link
													className="text-sm text-brand-primary dark:text-brand-action"
													to={`/dashboard/applications/${item.applicationId}`}
												>
													{item.applicationName}
												</Link>
											</div>
											<p className="text-sm capitalize text-app-muted">
												{item.status} · SSL {item.tlsStatus}
											</p>
										</article>
									))}
									{!detail.subdomains.length && (
										<p className="text-app-muted">No managed subdomains.</p>
									)}
								</div>
							)}
							{(tab === 'ssl' || tab === 'activity') && (
								<p className="rounded-2xl border border-brand-primary/10 p-6 text-app-muted">
									{tab === 'ssl'
										? 'SSL status is shown for every connected subdomain.'
										: 'DNS and domain changes are retained in the platform audit log.'}
								</p>
							)}
						</div>
					)}
				</Offcanvas>
			)}
		</main>
	);
}
