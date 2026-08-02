import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, PackagePlus, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
	Link,
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';

import { SearchableSelect } from '@root/app/components/forms/searchable-select';
import {
	DataTable,
	DataTableToolbar,
	SortableTableHeader,
	StickyActionsCell,
	StickyActionsHeader,
} from '@root/app/components/ui/data-table';
import { Offcanvas } from '@root/app/components/ui/offcanvas';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';
import { createPackageSchema } from '@schemas/package';

type PackageForm = z.infer<typeof createPackageSchema>;
type PackageStatus = 'archived' | 'draft' | 'published';
type TrialUnit = 'day' | 'month' | 'week';

interface CategoryOption {
	id: string;
	name: string;
	slug: string;
}

interface PackageRecord extends PackageForm {
	auditLogs?: Array<{
		action: string;
		createdAt: string;
		id: string;
		reason?: string | null;
	}>;
	categoryName?: string | null;
	createdAt: string;
	id: string;
	publishedAt?: string | null;
	updatedAt: string;
	prices?: PackagePriceRecord[];
	entitlements?: Array<{ id: string; code: string; name: string; unit: string | null; enforcementMode: string; numericValue: number | null; booleanValue: boolean | null; isUnlimited: boolean }>;
	costReviews?: Array<{ id: string; status: 'approved' | 'pending' | 'rejected'; estimatedMonthlyCostMinor: number; revenueMinor: number; marginBasisPoints: number; notes: string | null; createdAt: string }>;
	emailProducts?: Array<{ id: string; name: string; includedRecipients: number; monthlyPriceMinor: number | null }>;
}

interface PackagePriceRecord {
	amountMinor: number;
	billingInterval: 'month' | 'year';
	createdAt: string;
	currency: 'INR';
	effectiveFrom: string;
	effectiveUntil?: string | null;
	id: string;
	isActive: boolean;
	isPublic: boolean;
	taxBehavior: 'exclusive' | 'inclusive';
}

interface ApiEnvelope<T> {
	data: T;
	message: string;
	status: boolean;
}

const DEFAULT_VALUES: PackageForm = {
	categoryId: null,
	description: null,
	displayOrder: 0,
	isFeatured: false,
	name: '',
	slug: '',
	status: 'draft',
	trialDuration: null,
	trialDurationUnit: null,
	trialEnabled: false,
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = (await response.json()) as ApiEnvelope<T>;
	if (!response.ok || !body.status) throw new Error(body.message);
	return body.data;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/** URL-addressable package catalogue administration workspace. */
export default function PackagesPage() {
	const location = useLocation();
	const navigate = useNavigate();
	const params = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const [records, setRecords] = useState<PackageRecord[]>([]);
	const [categories, setCategories] = useState<CategoryOption[]>([]);
	const [canCreateCategory, setCanCreateCategory] = useState(false);
	const [detail, setDetail] = useState<PackageRecord>();
	const [busy, setBusy] = useState(false);
	const [monthlyAmount, setMonthlyAmount] = useState('');
	const [yearlyAmount, setYearlyAmount] = useState('');
	const [pricePublic, setPricePublic] = useState(false);
	const [estimatedCost, setEstimatedCost] = useState('');
	const [reviewRevenue, setReviewRevenue] = useState('');
	const [reviewNotes, setReviewNotes] = useState('');
	const [entitlementDraft, setEntitlementDraft] = useState<NonNullable<PackageRecord['entitlements']>>([]);
	const packageSlug = params.packageSlug;
	const section = params.section ?? 'basic';
	const creating = location.pathname === '/admin/packages/create';
	const editing = location.pathname.includes('/edit/');
	const open = creating || Boolean(packageSlug);
	const form = useForm<PackageForm>({
		defaultValues: DEFAULT_VALUES,
		resolver: zodResolver(createPackageSchema),
	});
	const trialEnabled = useWatch({ control: form.control, name: 'trialEnabled' });
	const search = searchParams.get('search') ?? '';
	const statusFilter = searchParams.get('status') ?? 'all';
	const categoryFilter = searchParams.get('category') ?? 'all';
	const sort = searchParams.get('sort') ?? 'displayOrder';
	const direction = searchParams.get('direction') === 'desc' ? 'desc' : 'asc';

	const load = useCallback(async () => {
		try {
			const [packagesData, categoryData] = await Promise.all([
				api<PackageRecord[]>('/api/v1/packages'),
				api<{ canCreate: boolean; items: CategoryOption[] }>(
					'/api/v1/package-categories',
				),
			]);
			setRecords(packagesData);
			setCategories(categoryData.items);
			setCanCreateCategory(categoryData.canCreate);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to load packages.');
		}
	}, []);

	useEffect(() => {
		const timeout = window.setTimeout(() => void load(), 0);
		return () => window.clearTimeout(timeout);
	}, [load]);
	useEffect(() => {
		if (!packageSlug) {
			const timeout = window.setTimeout(() => {
				setDetail(undefined);
				if (creating) form.reset(DEFAULT_VALUES);
			}, 0);
			return () => window.clearTimeout(timeout);
		}
		void api<PackageRecord>(`/api/v1/packages/${packageSlug}`)
			.then((record) => {
				setDetail(record);
				setEntitlementDraft(record.entitlements ?? []);
				const monthly = record.prices?.find((price) => price.isActive && price.billingInterval === 'month');
				const yearly = record.prices?.find((price) => price.isActive && price.billingInterval === 'year');
				setMonthlyAmount(monthly ? String(monthly.amountMinor / 100) : '');
				setYearlyAmount(yearly ? String(yearly.amountMinor / 100) : '');
				setPricePublic(Boolean(monthly?.isPublic && yearly?.isPublic));
				if (editing)
					form.reset({
						categoryId: record.categoryId,
						description: record.description,
						displayOrder: record.displayOrder,
						isFeatured: record.isFeatured,
						name: record.name,
						slug: record.slug,
						status: record.status,
						trialDuration: record.trialDuration,
						trialDurationUnit: record.trialDurationUnit,
						trialEnabled: record.trialEnabled,
					});
			})
			.catch((error) =>
				toast.error(error instanceof Error ? error.message : 'Unable to load package.'),
			);
	}, [creating, editing, form, packageSlug]);

	const filteredRecords = useMemo(() => {
		const query = search.trim().toLowerCase();
		return records
			.filter(
				(record) =>
					(!query ||
						`${record.name} ${record.slug} ${record.categoryName ?? ''}`
							.toLowerCase()
							.includes(query)) &&
					(statusFilter === 'all' || record.status === statusFilter) &&
					(categoryFilter === 'all' || record.categoryId === categoryFilter),
			)
			.sort((left, right) => {
				const leftValue =
					sort === 'name'
						? left.name
						: sort === 'status'
							? left.status
							: sort === 'category'
								? left.categoryName ?? ''
								: String(left.displayOrder).padStart(8, '0');
				const rightValue =
					sort === 'name'
						? right.name
						: sort === 'status'
							? right.status
							: sort === 'category'
								? right.categoryName ?? ''
								: String(right.displayOrder).padStart(8, '0');
				return leftValue.localeCompare(rightValue) * (direction === 'asc' ? 1 : -1);
			});
	}, [categoryFilter, direction, records, search, sort, statusFilter]);

	function updateQuery(key: string, value: string): void {
		const next = new URLSearchParams(searchParams);
		if (!value || value === 'all') next.delete(key);
		else next.set(key, value);
		setSearchParams(next, { replace: true });
	}

	async function savePrices(): Promise<void> {
		if (!packageSlug) return;
		setBusy(true);
		try {
			await api(`/api/v1/packages/${packageSlug}/prices`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ currency: 'INR', monthlyAmount: Number(monthlyAmount), yearlyAmount: Number(yearlyAmount), taxBehavior: 'exclusive', isPublic: pricePublic }),
			});
			toast.success('Package prices updated. Previous prices remain in history.');
			const record = await api<PackageRecord>(`/api/v1/packages/${packageSlug}`);
			setDetail(record);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to save prices.');
		} finally {
			setBusy(false);
		}
	}

	async function deletePrice(price: PackagePriceRecord): Promise<void> {
		if (!packageSlug) return;
		try {
			const impact = await api<{ activeUsers: number; latestTermEnd: string | null }>(`/api/v1/packages/${packageSlug}/prices/${price.id}`);
			const warning = impact.activeUsers > 0
				? `${impact.activeUsers} active user${impact.activeUsers === 1 ? '' : 's'} will continue on this price until their current term ends${impact.latestTermEnd ? ` (latest: ${new Date(impact.latestTermEnd).toLocaleDateString()})` : ''}. Remove it from future purchases?`
				: 'Remove this price from future purchases? Historical records will remain preserved.';
			if (!window.confirm(warning)) return;
			await api(`/api/v1/packages/${packageSlug}/prices/${price.id}`, { method: 'DELETE' });
			toast.success('Price removed. Existing customer terms remain unchanged.');
			const record = await api<PackageRecord>(`/api/v1/packages/${packageSlug}`);
			setDetail(record);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to remove price.');
		}
	}

	async function saveCostReview(status: 'approved' | 'pending' | 'rejected'): Promise<void> {
		if (!packageSlug) return;
		setBusy(true);
		try {
			await api(`/api/v1/packages/${packageSlug}/cost-reviews`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estimatedMonthlyCost: Number(estimatedCost), revenue: Number(reviewRevenue), notes: reviewNotes, status }) });
			toast.success('AWS cost and margin review recorded.');
			const record = await api<PackageRecord>(`/api/v1/packages/${packageSlug}`);
			setDetail(record);
			setReviewNotes('');
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save cost review.'); }
		finally { setBusy(false); }
	}

	async function saveEntitlements(): Promise<void> {
		if (!packageSlug) return;
		setBusy(true);
		try {
			await api(`/api/v1/packages/${packageSlug}/entitlements`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: entitlementDraft.map((item) => ({ entitlementId: item.id, numericValue: item.isUnlimited ? null : item.numericValue, booleanValue: item.isUnlimited ? null : item.booleanValue, isUnlimited: item.isUnlimited })) }) });
			toast.success('Package entitlements updated for future purchases.');
			const record = await api<PackageRecord>(`/api/v1/packages/${packageSlug}`); setDetail(record); setEntitlementDraft(record.entitlements ?? []);
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save entitlements.'); }
		finally { setBusy(false); }
	}

	function updateSort(column: string): void {
		const next = new URLSearchParams(searchParams);
		next.set('sort', column);
		next.set('direction', sort === column && direction === 'asc' ? 'desc' : 'asc');
		setSearchParams(next, { replace: true });
	}

	async function save(values: PackageForm): Promise<void> {
		setBusy(true);
		try {
			const record = await api<PackageRecord>(
				editing && packageSlug
					? `/api/v1/packages/${packageSlug}`
					: '/api/v1/packages',
				{
					method: editing ? 'PATCH' : 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(values),
				},
			);
			toast.success(editing ? 'Package updated.' : 'Package created.');
			await load();
			navigate(`/admin/packages/${record.slug}/basic${location.search}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to save package.');
		} finally {
			setBusy(false);
		}
	}

	async function createCategory(label: string) {
		const category = await api<CategoryOption>('/api/v1/package-categories', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				description: null,
				displayOrder: categories.length,
				name: label,
				slug: slugify(label),
			}),
		});
		setCategories((current) => [...current, category]);
		toast.success('Package category added.');
		return { label: category.name, value: category.id };
	}

	async function remove(): Promise<void> {
		if (!packageSlug || !window.confirm('Delete this package?')) return;
		setBusy(true);
		try {
			await api(`/api/v1/packages/${packageSlug}`, {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reason: 'Deleted from package administration.' }),
			});
			toast.success('Package deleted.');
			await load();
			navigate(`/admin/packages${location.search}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to delete package.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto max-w-7xl">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Commercial catalogue</p>
					<h2 className="mt-1 text-3xl font-bold">Packages</h2>
					<p className="mt-2 text-sm text-app-muted">Manage package visibility, categories, and trial eligibility.</p>
				</div>
				<Link className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-action px-4 py-2.5 text-sm font-semibold text-brand-ink" to={`/admin/packages/create${location.search}`}>
					<PackagePlus className="size-4" /> Add package
				</Link>
			</div>
			<div className="mt-8">
				<DataTableToolbar
					onSearchChange={(value) => updateQuery('search', value)}
					resultLabel={`${filteredRecords.length} of ${records.length} packages`}
					searchPlaceholder="Search packages"
					searchValue={search}
				>
					<SearchableSelect
						ariaLabel="Filter package status"
						className="w-full sm:w-40"
						onChange={(value) => updateQuery('status', value)}
						options={[
							{ label: 'All statuses', value: 'all' },
							{ label: 'Draft', value: 'draft' },
							{ label: 'Published', value: 'published' },
							{ label: 'Archived', value: 'archived' },
						]}
						searchable={false}
						value={statusFilter}
					/>
					<SearchableSelect
						ariaLabel="Filter package category"
						className="w-full sm:w-52"
						onChange={(value) => updateQuery('category', value)}
						options={[
							{ label: 'All categories', value: 'all' },
							...categories.map((category) => ({ label: category.name, value: category.id })),
						]}
						searchPlaceholder="Search categories"
						value={categoryFilter}
					/>
				</DataTableToolbar>
				<DataTable>
					<thead className="bg-stone-50 text-left text-xs uppercase text-app-muted dark:bg-stone-950/50">
						<tr>
							<SortableTableHeader activeDirection={sort === 'name' ? direction : undefined} onSort={() => updateSort('name')}>Package</SortableTableHeader>
							<SortableTableHeader activeDirection={sort === 'category' ? direction : undefined} onSort={() => updateSort('category')}>Category</SortableTableHeader>
							<SortableTableHeader activeDirection={sort === 'status' ? direction : undefined} onSort={() => updateSort('status')}>Status</SortableTableHeader>
							<th className="px-5 py-3">Trial</th>
							<StickyActionsHeader />
						</tr>
					</thead>
					<tbody className="divide-y divide-stone-200 dark:divide-stone-800">
						{filteredRecords.map((record) => (
							<tr key={record.id}>
								<td className="px-5 py-4"><p className="font-semibold">{record.name}</p><p className="text-xs text-app-muted">{record.slug}</p></td>
								<td className="px-5 py-4">{record.categoryName ?? 'Uncategorised'}</td>
								<td className="px-5 py-4 capitalize"><span className="rounded-full bg-brand-muted/20 px-2 py-1 text-xs font-semibold">{record.status}</span></td>
								<td className="px-5 py-4">{record.trialEnabled ? `${record.trialDuration} ${record.trialDurationUnit}${record.trialDuration === 1 ? '' : 's'}` : 'No trial'}</td>
								<StickyActionsCell><Link aria-label={`View ${record.name}`} className="grid size-9 place-items-center rounded-lg text-brand-primary hover:bg-brand-muted/20 dark:text-brand-action" to={`/admin/packages/${record.slug}/basic${location.search}`}><Eye className="size-4" /></Link></StickyActionsCell>
							</tr>
						))}
						{filteredRecords.length === 0 && <tr><td className="px-5 py-10 text-center text-app-muted" colSpan={5}>No packages match the current search and filters.</td></tr>}
					</tbody>
				</DataTable>
			</div>

			{open && (
				<Offcanvas onClose={() => navigate(`/admin/packages${location.search}`)} title={creating ? 'Add package' : detail?.name ?? 'Package details'} width="full">
					{!creating && !editing && <div className="flex items-end gap-3 border-b border-stone-200 dark:border-stone-800">
						<nav className="min-w-0 flex-1 overflow-x-auto"><div className="flex w-max gap-2">{['basic', 'pricing', 'entitlements', 'cost-review', 'audit-logs'].map((tab) => <Link className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold capitalize ${section === tab ? 'border-brand-action text-brand-primary dark:text-brand-action' : 'border-transparent text-app-muted'}`} key={tab} to={`/admin/packages/${packageSlug}/${tab}${location.search}`}>{tab.replace('-', ' ')}</Link>)}</div></nav>
						{detail && !editing && <Link className="mb-2.5 inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-action px-4 py-2.5 text-sm font-semibold text-brand-ink" to={`/admin/packages/${detail.slug}/edit/basic${location.search}`}><Pencil className="size-4" /> Edit</Link>}
					</div>}

					{section === 'basic' && (creating || editing) && (
						<form className="mt-6 grid max-w-4xl gap-5 sm:grid-cols-2" onSubmit={form.handleSubmit((values) => void save(values))}>
							<label className="block text-sm font-medium">Package name<input {...form.register('name', { onChange: (event) => { if (!editing) form.setValue('slug', slugify(event.target.value)); } })} className="mt-2 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" />{form.formState.errors.name && <span className="mt-1 block text-xs text-rose-600">{form.formState.errors.name.message}</span>}</label>
							<label className="block text-sm font-medium">Slug<input {...form.register('slug')} className="mt-2 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" />{form.formState.errors.slug && <span className="mt-1 block text-xs text-rose-600">{form.formState.errors.slug.message}</span>}</label>
							<div className="text-sm font-medium"><span>Category</span><Controller control={form.control} name="categoryId" render={({ field }) => <SearchableSelect allowCreate={canCreateCategory} ariaLabel="Package category" className="mt-2" onChange={(value) => field.onChange(value || null)} onCreate={createCategory} options={[{ label: 'No category', value: '' }, ...categories.map((category) => ({ label: category.name, value: category.id }))]} searchPlaceholder="Search or add category" value={field.value ?? ''} />} /></div>
							<div className="text-sm font-medium"><span>Status</span><Controller control={form.control} name="status" render={({ field }) => <SearchableSelect ariaLabel="Package status" className="mt-2" onChange={(value) => field.onChange(value as PackageStatus)} options={[{ label: 'Draft', value: 'draft' }, { label: 'Published', value: 'published' }, { label: 'Archived', value: 'archived' }]} searchable={false} value={field.value} />} /></div>
							<label className="block text-sm font-medium sm:col-span-2">Description<textarea {...form.register('description')} className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" /></label>
							<label className="block text-sm font-medium">Display order<input {...form.register('displayOrder', { valueAsNumber: true })} className="mt-2 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" min={0} type="number" /></label>
							<label className="flex items-center gap-3 self-end rounded-xl border border-stone-200 p-3 text-sm font-medium dark:border-stone-700"><input {...form.register('isFeatured')} className="size-4 accent-brand-action" type="checkbox" /> Featured package</label>
							<div className="sm:col-span-2 rounded-2xl border border-stone-200 p-4 dark:border-stone-700"><label className="flex items-center justify-between gap-4 font-semibold"><span><span className="block">Trial period</span><span className="text-xs font-normal text-app-muted">Allow eligible customers to start without immediate billing.</span></span><input checked={trialEnabled} className="size-5 accent-brand-action" onChange={(event) => { const enabled = event.target.checked; form.setValue('trialEnabled', enabled); form.setValue('trialDuration', enabled ? 14 : null); form.setValue('trialDurationUnit', enabled ? 'day' : null); }} type="checkbox" /></label>{trialEnabled && <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem]"><label className="text-sm font-medium">Duration<input {...form.register('trialDuration', { valueAsNumber: true })} className="mt-2 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" min={1} type="number" /></label><div className="text-sm font-medium"><span>Unit</span><Controller control={form.control} name="trialDurationUnit" render={({ field }) => <SearchableSelect ariaLabel="Trial duration unit" className="mt-2" onChange={(value) => field.onChange(value as TrialUnit)} options={[{ label: 'Days', value: 'day' }, { label: 'Weeks', value: 'week' }, { label: 'Months', value: 'month' }]} searchable={false} value={field.value ?? ''} />} /></div></div>}{form.formState.errors.trialDuration && <p className="mt-2 text-xs text-rose-600">{form.formState.errors.trialDuration.message}</p>}</div>
							<div className="flex gap-3 sm:col-span-2"><button className="rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink disabled:opacity-60" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save package'}</button>{editing && <button className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-semibold text-white" disabled={busy} onClick={() => void remove()} type="button"><Trash2 className="size-4" /> Delete</button>}</div>
						</form>
					)}

					{section === 'basic' && !creating && !editing && detail && <section className="mt-6 grid max-w-4xl gap-4 sm:grid-cols-2">{[['Name', detail.name], ['Slug', detail.slug], ['Category', detail.categoryName ?? 'Uncategorised'], ['Status', detail.status], ['Featured', detail.isFeatured ? 'Yes' : 'No'], ['Trial', detail.trialEnabled ? `${detail.trialDuration} ${detail.trialDurationUnit}${detail.trialDuration === 1 ? '' : 's'}` : 'Disabled']].map(([label, value]) => <article className="rounded-2xl border border-stone-200 bg-app-surface p-4 dark:border-stone-800" key={label}><p className="text-xs uppercase tracking-wide text-app-muted">{label}</p><p className="mt-2 font-semibold capitalize">{value}</p></article>)}</section>}
					{section === 'pricing' && detail && <section className="mt-6 max-w-4xl space-y-6"><div className="rounded-2xl border border-stone-200 bg-app-surface p-5 dark:border-stone-800"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Current INR pricing</h3><p className="text-sm text-app-muted">Amounts exclude GST. Saving creates a new version.</p></div><label className="flex items-center gap-2 text-sm font-medium"><input checked={pricePublic} className="size-4 accent-brand-action" onChange={(event) => setPricePublic(event.target.checked)} type="checkbox" /> Public price</label></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Monthly price (₹)<input className="mt-2 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" min="0.01" onChange={(event) => { setMonthlyAmount(event.target.value); if (event.target.value) setYearlyAmount(String(Number(event.target.value) * 10)); }} step="0.01" type="number" value={monthlyAmount} /></label><label className="text-sm font-medium">Yearly price (₹)<input className="mt-2 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" min="0.01" onChange={(event) => setYearlyAmount(event.target.value)} step="0.01" type="number" value={yearlyAmount} /><span className="mt-1 block text-xs text-app-muted">Suggested: ten months of the monthly price.</span></label></div><button className="mt-5 rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink disabled:opacity-60" disabled={busy || !monthlyAmount || !yearlyAmount} onClick={() => void savePrices()} type="button">{busy ? 'Saving…' : 'Save new price version'}</button></div><div><h3 className="font-semibold">Price history</h3><div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800"><table className="w-full text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-app-muted dark:bg-stone-950/50"><tr><th className="px-4 py-3">Term</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Visibility</th><th className="px-4 py-3">Effective</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-stone-200 dark:divide-stone-800">{detail.prices?.map((price) => <tr key={price.id}><td className="px-4 py-3 capitalize">{price.billingInterval}ly</td><td className="px-4 py-3">₹{(price.amountMinor / 100).toLocaleString('en-IN')}</td><td className="px-4 py-3">{price.isActive ? (price.isPublic ? 'Public' : 'Private') : 'Historical'}</td><td className="px-4 py-3 text-app-muted">{new Date(price.effectiveFrom).toLocaleDateString()}{price.effectiveUntil ? ` – ${new Date(price.effectiveUntil).toLocaleDateString()}` : ''}</td><td className="px-4 py-3 text-right"><button aria-label={`Delete ${price.billingInterval} price`} className="inline-grid size-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-500/10" onClick={() => void deletePrice(price)} type="button"><Trash2 className="size-4" /></button></td></tr>)}{!detail.prices?.length && <tr><td className="px-4 py-8 text-center text-app-muted" colSpan={5}>No prices configured.</td></tr>}</tbody></table></div></div></section>}
					{section === 'entitlements' && detail && <section className="mt-6 max-w-4xl space-y-6"><div><div className="flex items-end justify-between gap-4"><div><h3 className="font-semibold">Package limits</h3><p className="mt-1 text-sm text-app-muted">Changes apply to future subscription snapshots. Existing purchases stay unchanged.</p></div><button className="rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink disabled:opacity-50" disabled={busy} onClick={() => void saveEntitlements()} type="button">Save entitlements</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{entitlementDraft.map((item, index) => <article className="rounded-2xl border border-stone-200 bg-app-surface p-4 dark:border-stone-800" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-app-muted">{item.code}</p></div><span className="rounded-full bg-brand-muted/20 px-2 py-1 text-xs capitalize">{item.enforcementMode}</span></div><div className="mt-4 flex items-center gap-3">{item.booleanValue !== null ? <label className="flex items-center gap-2 text-sm font-medium"><input checked={item.booleanValue} className="size-4 accent-brand-action" disabled={item.isUnlimited} onChange={(event) => setEntitlementDraft((current) => current.map((entry, position) => position === index ? { ...entry, booleanValue: event.target.checked } : entry))} type="checkbox" /> Enabled</label> : <input className="w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-2.5 dark:border-stone-700" disabled={item.isUnlimited} min={0} onChange={(event) => setEntitlementDraft((current) => current.map((entry, position) => position === index ? { ...entry, numericValue: Number(event.target.value) } : entry))} type="number" value={item.numericValue ?? 0} />}<label className="ml-auto flex items-center gap-2 text-xs"><input checked={item.isUnlimited} className="accent-brand-action" onChange={(event) => setEntitlementDraft((current) => current.map((entry, position) => position === index ? { ...entry, isUnlimited: event.target.checked } : entry))} type="checkbox" /> Unlimited</label></div>{item.unit && <p className="mt-1 text-xs text-app-muted">Unit: {item.unit}</p>}</article>)}{!entitlementDraft.length && <p className="text-app-muted">No entitlements configured.</p>}</div></div><div><h3 className="font-semibold">Amazon SES recipient add-ons</h3><p className="mt-1 text-sm text-app-muted">Transactional delivery only; these are not hosted mailboxes.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{detail.emailProducts?.map((product) => <article className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800" key={product.id}><p className="font-semibold">{product.name}</p><p className="mt-2 text-lg font-bold">{product.monthlyPriceMinor === null ? 'Custom pricing' : `₹${(product.monthlyPriceMinor / 100).toLocaleString('en-IN')}/month`}</p></article>)}</div></div></section>}
					{section === 'cost-review' && detail && <section className="mt-6 max-w-4xl"><div className={`rounded-2xl border p-5 ${detail.costReviews?.[0]?.status === 'approved' ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100' : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'}`}><h3 className="font-semibold">AWS cost &amp; margin review</h3><p className="mt-2 text-sm">{detail.costReviews?.[0]?.status === 'approved' ? 'The latest review is approved while it matches the current monthly price.' : 'Review EC2, EBS, S3, bandwidth, SES, support, payment fees, and GST assumptions before publishing.'}</p></div><div className="mt-4 rounded-2xl border border-stone-200 p-5 dark:border-stone-800"><h3 className="font-semibold">Record review</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Estimated monthly cost (₹)<input className="mt-2 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" min="0" onChange={(event) => setEstimatedCost(event.target.value)} step="0.01" type="number" value={estimatedCost} /></label><label className="text-sm font-medium">Monthly revenue (₹)<input className="mt-2 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" min="0.01" onChange={(event) => setReviewRevenue(event.target.value)} step="0.01" type="number" value={reviewRevenue} /></label><label className="text-sm font-medium sm:col-span-2">Assumptions and evidence<textarea className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 bg-app-surface px-3 py-3 dark:border-stone-700" onChange={(event) => setReviewNotes(event.target.value)} value={reviewNotes} /></label></div><div className="mt-4 flex flex-wrap gap-2"><button className="rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink disabled:opacity-50" disabled={busy || !estimatedCost || !reviewRevenue || reviewNotes.trim().length < 10} onClick={() => void saveCostReview('approved')} type="button">Approve review</button><button className="rounded-xl border border-stone-300 px-4 py-2.5 font-semibold dark:border-stone-700" disabled={busy || !estimatedCost || !reviewRevenue || reviewNotes.trim().length < 10} onClick={() => void saveCostReview('pending')} type="button">Save pending</button></div></div><div className="mt-4 space-y-3">{detail.costReviews?.map((review) => <article className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800" key={review.id}><div className="flex justify-between gap-3"><p className="font-semibold capitalize">{review.status}</p><span>{(review.marginBasisPoints / 100).toFixed(2)}% margin</span></div><p className="mt-2 text-sm text-app-muted">Cost ₹{(review.estimatedMonthlyCostMinor / 100).toLocaleString('en-IN')} · Revenue ₹{(review.revenueMinor / 100).toLocaleString('en-IN')}</p>{review.notes && <p className="mt-2 text-sm">{review.notes}</p>}</article>)}{!detail.costReviews?.length && <p className="rounded-2xl border border-stone-200 p-5 text-app-muted dark:border-stone-800">No cost review recorded. Publishing remains locked.</p>}</div></section>}
					{section === 'audit-logs' && detail && <div className="mt-6 max-w-4xl space-y-3">{detail.auditLogs?.map((log) => <article className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800" key={log.id}><p className="font-semibold">{log.action}</p><p className="mt-1 text-xs text-app-muted">{new Date(log.createdAt).toLocaleString()}</p></article>)}{!detail.auditLogs?.length && <p className="text-app-muted">No audit activity recorded.</p>}</div>}
				</Offcanvas>
			)}
		</div>
	);
}
