import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, Percent, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';

import { SearchableSelect } from '@root/app/components/forms/searchable-select';
import { DataTable, StickyActionsCell, StickyActionsHeader } from '@root/app/components/ui/data-table';
import { Offcanvas } from '@root/app/components/ui/offcanvas';
import { DestructiveConfirmation, type DestructiveConfirmationValue } from '@components/ui/destructive-confirmation';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';
import { normalizeNullableText } from '@root/app/utils/formValues';
import { createOfferSchema } from '@schemas/offer';

type OfferForm = z.infer<typeof createOfferSchema>;
type EligibleTerm = OfferForm['eligibleTerms'][number];

interface PackagePrice {
	amountMinor: number;
	billingInterval: 'month' | 'year';
	id: string;
	intervalCount: number;
	isActive: boolean;
}

interface PackageRecord {
	id: string;
	name: string;
	prices?: PackagePrice[];
	slug: string;
}

interface OfferRecord {
	couponCode: string | null;
	customerEligibility: OfferForm['customerEligibility'];
	description: string | null;
	discountRecurrence: OfferForm['discountRecurrence'];
	discountType: OfferForm['discountType'];
	eligibleTerms?: EligibleTerm[];
	endsAt: string | null;
	fixedAmountMinor: number | null;
	id: string;
	maximumDiscount: number | null;
	maxRedemptions: number | null;
	maxRedemptionsPerCustomer: number;
	minimumSubtotal: number | null;
	name: string;
	packageIds?: string[];
	percentageBasisPoints: number | null;
	priceIds?: string[];
	priority: number;
	recurrenceCycles: number | null;
	slug: string;
	stackable: boolean;
	startsAt: string | null;
	status: OfferForm['status'];
	subscriptionEvent: OfferForm['subscriptionEvent'];
	trialHandling: OfferForm['trialHandling'];
}

const TERMS: Array<EligibleTerm & { label: string }> = [
	{ billingInterval: 'month', intervalCount: 1, label: 'Monthly' },
	{ billingInterval: 'year', intervalCount: 1, label: 'Yearly' },
	{ billingInterval: 'year', intervalCount: 2, label: '2 years' },
	{ billingInterval: 'year', intervalCount: 3, label: '3 years' },
];

const DEFAULTS: OfferForm = {
	couponCode: null,
	currency: 'INR',
	customerEligibility: 'everyone',
	description: null,
	discountRecurrence: 'once',
	discountType: 'percentage',
	eligibleTerms: [],
	endsAt: null,
	fixedAmount: null,
	maximumDiscount: null,
	maxRedemptions: null,
	maxRedemptionsPerCustomer: 1,
	minimumSubtotal: null,
	name: '',
	packageIds: [],
	percentage: 10,
	priceIds: [],
	priority: 0,
	recurrenceCycles: null,
	slug: '',
	stackable: false,
	startsAt: null,
	status: 'draft',
	subscriptionEvent: 'both',
	trialHandling: 'after_trial',
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = await response.json() as { data: T; message: string; status: boolean };
	if (!response.ok || !body.status) throw new Error(body.message);
	return body.data;
}

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const termKey = (term: EligibleTerm) => `${term.billingInterval}:${term.intervalCount}`;
const money = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`;

/** URL-driven offers and coupon administration. */
export default function OffersPage() {
	const { offerSlug } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const creating = location.pathname === '/admin/offers/create';
	const editing = location.pathname.includes('/edit');
	const open = creating || Boolean(offerSlug);
	const [records, setRecords] = useState<OfferRecord[]>([]);
	const [packages, setPackages] = useState<PackageRecord[]>([]);
	const [busy, setBusy] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const form = useForm<OfferForm>({ defaultValues: DEFAULTS, resolver: zodResolver(createOfferSchema) });
	const values = useWatch({ control: form.control });
	const selectedPackageIds = useMemo(() => values.packageIds ?? [], [values.packageIds]);
	const selectedTerms = useMemo(() => (values.eligibleTerms ?? []).flatMap((term) => term.billingInterval && term.intervalCount ? [{ billingInterval: term.billingInterval, intervalCount: term.intervalCount }] : []), [values.eligibleTerms]);

	const load = useCallback(async () => {
		try {
			const [offers, packageRows] = await Promise.all([
				api<OfferRecord[]>('/api/v1/offers'),
				api<PackageRecord[]>('/api/v1/packages'),
			]);
			const packageDetails = await Promise.all(packageRows.map((item) => api<PackageRecord>(`/api/v1/packages/${item.slug}`)));
			setRecords(offers);
			setPackages(packageDetails);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to load offers.');
		}
	}, []);

	useEffect(() => {
		const timeout = window.setTimeout(() => void load(), 0);
		return () => window.clearTimeout(timeout);
	}, [load]);

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			if (creating) form.reset(DEFAULTS);
			else if (offerSlug) void api<OfferRecord>(`/api/v1/offers/${offerSlug}`).then((offer) => form.reset({
				...DEFAULTS,
				couponCode: offer.couponCode,
				customerEligibility: offer.customerEligibility,
				description: offer.description,
				discountRecurrence: offer.discountRecurrence,
				discountType: offer.discountType,
				eligibleTerms: offer.eligibleTerms ?? [],
				endsAt: offer.endsAt,
				fixedAmount: offer.fixedAmountMinor === null ? null : offer.fixedAmountMinor / 100,
				maximumDiscount: offer.maximumDiscount,
				maxRedemptions: offer.maxRedemptions,
				maxRedemptionsPerCustomer: offer.maxRedemptionsPerCustomer,
				minimumSubtotal: offer.minimumSubtotal,
				name: offer.name,
				packageIds: offer.packageIds ?? [],
				percentage: offer.percentageBasisPoints === null ? null : offer.percentageBasisPoints / 100,
				priceIds: offer.priceIds ?? [],
				priority: offer.priority,
				recurrenceCycles: offer.recurrenceCycles,
				slug: offer.slug,
				stackable: offer.stackable,
				startsAt: offer.startsAt,
				status: offer.status,
				subscriptionEvent: offer.subscriptionEvent,
				trialHandling: offer.trialHandling,
			})).catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to load offer.'));
		}, 0);
		return () => window.clearTimeout(timeout);
	}, [creating, form, offerSlug]);

	const preview = useMemo(() => {
		if (selectedPackageIds.length === 0 && selectedTerms.length === 0) return [];
		const selectedTermKeys = new Set((selectedTerms.length ? selectedTerms : TERMS).map(termKey));
		return packages.filter((item) => selectedPackageIds.length === 0 || selectedPackageIds.includes(item.id)).flatMap((item) =>
			(item.prices ?? []).filter((price) => price.isActive && selectedTermKeys.has(termKey(price))).map((price) => {
				const percentageDiscount = Math.round(price.amountMinor * (values.percentage ?? 0) / 100);
				const rawDiscount = values.discountType === 'fixed' ? Math.round((values.fixedAmount ?? 0) * 100) : percentageDiscount;
				const cappedDiscount = values.maximumDiscount ? Math.min(rawDiscount, Math.round(values.maximumDiscount * 100)) : rawDiscount;
				const discountMinor = Math.min(price.amountMinor, cappedDiscount);
				const afterMinor = price.amountMinor - discountMinor;
				const taxMinor = Math.round(afterMinor * 0.18);
				return { afterMinor, discountMinor, item, payableMinor: afterMinor + taxMinor, price, taxMinor };
			}),
		);
	}, [packages, selectedPackageIds, selectedTerms, values.discountType, values.fixedAmount, values.maximumDiscount, values.percentage]);

	async function save(input: OfferForm) {
		setBusy(true);
		try {
			const record = await api<OfferRecord>(editing && offerSlug ? `/api/v1/offers/${offerSlug}` : '/api/v1/offers', {
				body: JSON.stringify(input),
				headers: { 'content-type': 'application/json' },
				method: editing ? 'PATCH' : 'POST',
			});
			toast.success(editing ? 'Offer updated.' : 'Offer created.');
			await load();
			navigate(`/admin/offers/${record.slug}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to save offer.');
		} finally {
			setBusy(false);
		}
	}

	async function remove(confirmation: DestructiveConfirmationValue) {
		if (!offerSlug) return;
		setBusy(true);
		try { await api(`/api/v1/offers/${offerSlug}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(confirmation) }); await load(); navigate('/admin/offers'); toast.success('Offer deleted.'); setDeleting(false); }
		catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to delete offer.'); }
		finally { setBusy(false); }
	}

	const setAllPackages = () => form.setValue('packageIds', selectedPackageIds.length === packages.length ? [] : packages.map((item) => item.id), { shouldValidate: true });
	const setAllTerms = () => form.setValue('eligibleTerms', selectedTerms.length === TERMS.length ? [] : TERMS.map(({ billingInterval, intervalCount }) => ({ billingInterval, intervalCount })), { shouldValidate: true });

	return <div className="mx-auto max-w-7xl">
		<div className="flex items-end justify-between gap-4">
			<div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Commercial catalogue</p><h2 className="mt-1 text-3xl font-bold">Offers</h2><p className="mt-2 text-sm text-app-muted">Coupons, automatic discounts, eligibility, and redemption limits.</p></div>
			<Link className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink" to="/admin/offers/create"><Plus className="size-4" /> Add offer</Link>
		</div>
		<div className="mt-8"><DataTable><thead className="bg-stone-50 text-left text-xs uppercase text-app-muted dark:bg-stone-950/50"><tr><th className="px-5 py-3">Offer</th><th className="px-5 py-3">Discount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Coupon</th><StickyActionsHeader /></tr></thead><tbody className="divide-y divide-stone-200 dark:divide-stone-800">{records.map((offer) => <tr key={offer.id}><td className="px-5 py-4"><p className="font-semibold">{offer.name}</p><p className="text-xs text-app-muted">{offer.slug}</p></td><td className="px-5 py-4">{offer.discountType === 'percentage' ? `${(offer.percentageBasisPoints ?? 0) / 100}%` : money(offer.fixedAmountMinor ?? 0)}</td><td className="px-5 py-4 capitalize">{offer.status}</td><td className="px-5 py-4">{offer.couponCode ?? 'Automatic'}</td><StickyActionsCell><Link aria-label={`View ${offer.name}`} className="grid size-9 place-items-center text-brand-primary" to={`/admin/offers/${offer.slug}`}><Eye className="size-4" /></Link></StickyActionsCell></tr>)}</tbody></DataTable></div>
		{open && <Offcanvas onClose={() => navigate('/admin/offers')} title={creating ? 'Add offer' : editing ? 'Edit offer' : 'Offer details'} width="full">
			{!creating && !editing && <div className="flex justify-end gap-2"><Link className="rounded-xl bg-brand-action px-4 py-2 font-semibold text-brand-ink" to={`/admin/offers/${offerSlug}/edit`}>Edit</Link><button className="rounded-xl p-2 text-rose-600" onClick={() => setDeleting(true)} type="button"><Trash2 className="size-5" /></button></div>}
			{(creating || editing) && <form className="mt-4 grid max-w-6xl gap-5 sm:grid-cols-2" onSubmit={form.handleSubmit((input) => void save(input))}>
				<label className="text-sm font-medium">Name<input {...form.register('name', { onChange: (event) => { if (creating) form.setValue('slug', slugify(event.target.value)); } })} className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" /></label>
				<label className="text-sm font-medium">Slug<input {...form.register('slug')} className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" /></label>
				<label className="text-sm font-medium">Coupon code<input {...form.register('couponCode', { setValueAs: normalizeNullableText })} className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" placeholder="Leave blank for automatic" /></label>
				<SelectField control={form.control} label="Status" name="status" options={[['Draft', 'draft'], ['Active', 'active'], ['Archived', 'archived']]} />
				<SelectField control={form.control} label="Discount type" name="discountType" onChange={(value) => { form.setValue('percentage', value === 'percentage' ? 10 : null); form.setValue('fixedAmount', value === 'fixed' ? 100 : null); form.setValue('maximumDiscount', null); }} options={[['Percentage', 'percentage'], ['Fixed amount', 'fixed']]} />
				<label className="text-sm font-medium">{values.discountType === 'percentage' ? 'Percentage' : 'Fixed amount (₹)'}<input {...form.register(values.discountType === 'percentage' ? 'percentage' : 'fixedAmount', { valueAsNumber: true })} className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" min="0.01" step="0.01" type="number" /></label>
				{values.discountType === 'percentage' && <NullableMoneyInput form={form} label="Maximum discount (₹)" name="maximumDiscount" />}
				<NullableMoneyInput form={form} label="Minimum order value (₹)" name="minimumSubtotal" />
				<SelectField control={form.control} label="Customer eligibility" name="customerEligibility" options={[['Everyone', 'everyone'], ['New customers only', 'new_customers'], ['Existing customers only', 'existing_customers']]} />
				<SelectField control={form.control} label="Subscription event" name="subscriptionEvent" options={[['New subscriptions', 'new_subscription'], ['Renewals', 'renewal'], ['New subscriptions and renewals', 'both']]} />
				<SelectField control={form.control} label="Discount recurrence" name="discountRecurrence" onChange={(value) => form.setValue('recurrenceCycles', value === 'cycles' ? 1 : null)} options={[['First invoice only', 'once'], ['Specific billing cycles', 'cycles'], ['Entire subscription term', 'term']]} />
				{values.discountRecurrence === 'cycles' && <label className="text-sm font-medium">Billing cycles<input {...form.register('recurrenceCycles', { valueAsNumber: true })} className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" min={1} max={120} type="number" /></label>}
				<SelectField control={form.control} label="Trial handling" name="trialHandling" options={[['Apply after trial', 'after_trial'], ['Apply immediately', 'immediate'], ['Exclude trial subscriptions', 'exclude_trial']]} />
				<label className="text-sm font-medium">Starts at<input className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" onChange={(event) => form.setValue('startsAt', event.target.value ? new Date(event.target.value).toISOString() : null)} type="datetime-local" /></label>
				<label className="text-sm font-medium">Ends at<input className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" onChange={(event) => form.setValue('endsAt', event.target.value ? new Date(event.target.value).toISOString() : null)} type="datetime-local" /></label>
				<label className="text-sm font-medium">Global redemption limit<input {...form.register('maxRedemptions', { setValueAs: (value) => value === '' || value === null ? null : Number(value) })} className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" min={1} type="number" /></label>
				<label className="text-sm font-medium">Per-customer limit<input {...form.register('maxRedemptionsPerCustomer', { valueAsNumber: true })} className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" min={1} type="number" /></label>
				<fieldset className="sm:col-span-2"><div className="flex items-center justify-between gap-3"><legend className="text-sm font-semibold">Eligible packages</legend><button className="text-sm font-semibold text-brand-primary dark:text-brand-action" onClick={setAllPackages} type="button">{selectedPackageIds.length === packages.length ? 'Deselect all' : 'Select all'}</button></div><p className="mt-1 text-xs text-app-muted">No selection means every package.</p><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{packages.map((item) => <div className="flex items-center gap-3 rounded-xl border p-3" key={item.id}><label className="flex min-w-0 flex-1 items-center gap-3 text-sm"><input type="checkbox" value={item.id} {...form.register('packageIds')} /><span className="truncate">{item.name}</span></label><Link aria-label={`View ${item.name}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-brand-primary hover:bg-brand-muted/20 dark:text-brand-action" target="_blank" to={`/admin/packages/${item.slug}/basic`}><Eye className="size-4" /></Link></div>)}</div></fieldset>
				<fieldset className="sm:col-span-2"><div className="flex items-center justify-between gap-3"><legend className="text-sm font-semibold">Eligible durations</legend><button className="text-sm font-semibold text-brand-primary dark:text-brand-action" onClick={setAllTerms} type="button">{selectedTerms.length === TERMS.length ? 'Deselect all' : 'Select all'}</button></div><p className="mt-1 text-xs text-app-muted">No selection means every billing duration.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{TERMS.map((term) => { const checked = selectedTerms.some((item) => termKey(item) === termKey(term)); return <label className="flex items-center gap-3 rounded-xl border p-3 text-sm" key={termKey(term)}><input checked={checked} onChange={() => form.setValue('eligibleTerms', checked ? selectedTerms.filter((item) => termKey(item) !== termKey(term)) : [...selectedTerms, { billingInterval: term.billingInterval, intervalCount: term.intervalCount }], { shouldValidate: true })} type="checkbox" /> {term.label}</label>; })}</div></fieldset>
				{preview.length > 0 && <section className="sm:col-span-2"><h3 className="font-semibold">Offer price preview</h3><p className="mt-1 text-xs text-app-muted">Estimate uses the current checkout GST rate of 18% and active package prices.</p><div className="mt-3 grid gap-3 lg:grid-cols-2">{preview.map(({ afterMinor, discountMinor, item, payableMinor, price, taxMinor }) => <article className="rounded-2xl border p-4" key={price.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-app-muted">{TERMS.find((term) => termKey(term) === termKey(price))?.label}</p></div><span className="rounded-full bg-brand-muted/25 px-2.5 py-1 text-xs font-semibold text-brand-primary dark:text-brand-action">Save {money(discountMinor)}</span></div><dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><dt className="text-app-muted">Before</dt><dd className="text-right line-through">{money(price.amountMinor)}</dd><dt className="text-app-muted">After offer</dt><dd className="text-right font-semibold">{money(afterMinor)}</dd><dt className="text-app-muted">GST</dt><dd className="text-right">{money(taxMinor)}</dd><dt className="font-semibold">Payable</dt><dd className="text-right font-bold">{money(payableMinor)}</dd></dl>{discountMinor === price.amountMinor && <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">Discount reaches the full package price.</p>}</article>)}</div></section>}
				<label className="flex items-center gap-2 text-sm"><input {...form.register('stackable')} type="checkbox" /> Stackable</label>
				<label className="sm:col-span-2 text-sm font-medium">Description<textarea {...form.register('description')} className="mt-2 min-h-24 w-full rounded-xl border bg-app-surface px-3 py-3" /></label>
				<button className="w-fit rounded-xl bg-brand-action px-4 py-2.5 font-semibold text-brand-ink" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save offer'}</button>
			</form>}
			{!creating && !editing && offerSlug && <div className="mt-8 max-w-3xl rounded-2xl border p-5"><Percent className="size-6 text-brand-primary" /><p className="mt-3 text-app-muted">Use Edit to manage discount rules, dates, eligibility, recurrence, and limits.</p></div>}
		</Offcanvas>}
		{deleting && offerSlug && <DestructiveConfirmation busy={busy} description="This archives the offer and removes it from future eligibility. Historical discount records remain preserved." onCancel={() => setDeleting(false)} onConfirm={remove} resourceName={offerSlug} title="Delete Offer" />}
	</div>;
}

interface SelectFieldProps {
	control: ReturnType<typeof useForm<OfferForm>>['control'];
	label: string;
	name: 'customerEligibility' | 'discountRecurrence' | 'discountType' | 'status' | 'subscriptionEvent' | 'trialHandling';
	onChange?: (value: string) => void;
	options: Array<[string, string]>;
}

/** Theme-aware offer enum selector. */
function SelectField({ control, label, name, onChange, options }: SelectFieldProps) {
	return <div className="text-sm font-medium"><span>{label}</span><Controller control={control} name={name} render={({ field }) => <SearchableSelect className="mt-2" onChange={(value) => { field.onChange(value); onChange?.(value); }} options={options.map(([optionLabel, value]) => ({ label: optionLabel, value }))} searchable={false} value={String(field.value)} />} /></div>;
}

interface NullableMoneyInputProps {
	form: ReturnType<typeof useForm<OfferForm>>;
	label: string;
	name: 'maximumDiscount' | 'minimumSubtotal';
}

/** Optional rupee input that preserves null instead of NaN. */
function NullableMoneyInput({ form, label, name }: NullableMoneyInputProps) {
	return <label className="text-sm font-medium">{label}<input {...form.register(name, { setValueAs: (value) => value === '' || value === null ? null : Number(value) })} className="mt-2 w-full rounded-xl border bg-app-surface px-3 py-3" min="0.01" step="0.01" type="number" /></label>;
}
