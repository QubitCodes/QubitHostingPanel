import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Quote { billingInterval: 'month' | 'year'; currency: string; discountMinor: number; intervalCount: number; packageName: string; subtotalMinor: number; taxMinor: number; token: string; totalMinor: number }
const money = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`;

/** Authenticated purchase confirmation that persists the signed server quote before workspace setup. */
export default function CheckoutPage() {
	const { packageSlug, priceId } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const [quote, setQuote] = useState<Quote>();
	const [error, setError] = useState('');
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!sessionStorage.getItem('accessToken')) { navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true }); return; }
		void fetch('/api/v1/public/checkout-quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priceId }) }).then(async (response) => {
			const body = await response.json() as { data?: Quote; message: string; status: boolean };
			if (!response.ok || !body.status || !body.data) throw new Error(body.message);
			setQuote(body.data);
		}).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to prepare checkout.'));
	}, [location.pathname, navigate, priceId]);

	async function purchase(): Promise<void> {
		if (!quote) return;
		setSubmitting(true); setError('');
		try {
			const response = await authenticatedFetch('/api/v1/checkouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteToken: quote.token }) });
			const body = await response.json() as { data?: { setupUrl?: string }; message: string; status: boolean };
			if (!response.ok || !body.status || !body.data?.setupUrl) throw new Error(body.message);
			navigate(body.data.setupUrl);
		} catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete the purchase.'); setSubmitting(false); }
	}

	if (error && !quote) return <main className="grid min-h-screen place-items-center bg-app-canvas p-5 text-app-text"><section className="max-w-lg rounded-3xl border bg-app-surface p-8"><h1 className="text-2xl font-bold">Checkout unavailable</h1><p className="mt-3 text-app-muted">{error}</p><Link className="mt-6 inline-flex text-brand-primary dark:text-brand-action" to="/#plans">Return to plans</Link></section></main>;
	if (!quote) return <main className="grid min-h-screen place-items-center bg-app-canvas text-brand-primary dark:text-brand-action"><LoaderCircle className="size-7 animate-spin" /></main>;
	const term = quote.billingInterval === 'month' ? 'Monthly' : quote.intervalCount === 1 ? 'Yearly' : `${quote.intervalCount} years`;
	return <main className="min-h-screen bg-app-canvas px-5 py-10 text-app-text sm:px-8"><div className="mx-auto max-w-5xl"><Link className="inline-flex items-center gap-2 text-sm font-semibold text-app-muted" to="/#plans"><ArrowLeft className="size-4" /> Plans</Link><div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-[2rem] border border-brand-primary/10 bg-app-surface p-6 sm:p-9"><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Checkout · {packageSlug}</p><h1 className="mt-2 text-4xl font-black">Confirm your purchase</h1><p className="mt-4 leading-7 text-app-muted">After confirmation, you will name your new workspace and choose whether it is Personal or an Organisation.</p>{error && <p className="mt-6 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}<button className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-action px-5 py-4 font-bold text-brand-ink disabled:opacity-60" disabled={submitting} onClick={() => void purchase()} type="button">{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Confirm purchase <ArrowRight className="size-4" /></>}</button><p className="mt-4 text-xs leading-5 text-app-muted">Payment-provider capture will attach to this persistent checkout record. Trial-enabled plans can continue without a card.</p></section><aside className="h-fit rounded-[2rem] bg-brand-primary p-6 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-brand-action">Order summary</p><h2 className="mt-5 text-3xl font-black">{quote.packageName}</h2><p className="mt-2 text-white/60">{term} billing</p><dl className="mt-8 space-y-4 border-t border-white/10 pt-6 text-sm"><div className="flex justify-between"><dt className="text-white/60">Package</dt><dd>{money(quote.subtotalMinor)}</dd></div>{quote.discountMinor > 0 && <div className="flex justify-between text-brand-action"><dt>Discount</dt><dd>-{money(quote.discountMinor)}</dd></div>}<div className="flex justify-between"><dt className="text-white/60">GST</dt><dd>{money(quote.taxMinor)}</dd></div><div className="flex justify-between border-t border-white/10 pt-4 text-lg font-bold"><dt>Total</dt><dd>{money(quote.totalMinor)}</dd></div></dl></aside></div></div></main>;
}
