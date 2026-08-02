import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Quote { billingInterval: 'month' | 'year'; discountMinor: number; intervalCount: number; packageName: string; subtotalMinor: number; taxMinor: number; totalMinor: number }
interface WorkspaceSummary { name: string; publicId: number; type: string }
const money = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN')}`;

/** Authenticated checkout entry that preserves the exact public package price selection. */
export default function CheckoutPage() {
	const { packageSlug, priceId } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const [quote, setQuote] = useState<Quote>();
	const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
	const [workspaceId, setWorkspaceId] = useState<number>();
	const [error, setError] = useState('');

	useEffect(() => {
		if (!sessionStorage.getItem('accessToken')) {
			navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true });
			return;
		}
		void Promise.all([
			authenticatedFetch('/api/v1/workspaces').then((response) => response.json()),
			fetch('/api/v1/public/checkout-quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ priceId }) }).then((response) => response.json()),
		]).then(([workspaceBody, quoteBody]: [{ data?: WorkspaceSummary[]; message: string; status: boolean }, { data?: Quote; message: string; status: boolean }]) => {
			if (!workspaceBody.status || !quoteBody.status || !quoteBody.data) throw new Error(quoteBody.message || workspaceBody.message);
			setWorkspaces(workspaceBody.data ?? []);
			setWorkspaceId(workspaceBody.data?.[0]?.publicId);
			setQuote(quoteBody.data);
		}).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to prepare checkout.'));
	}, [location.pathname, navigate, priceId]);

	if (error) return <main className="grid min-h-screen place-items-center bg-app-canvas p-5 text-app-text"><section className="max-w-lg rounded-3xl border bg-app-surface p-8"><h1 className="text-2xl font-bold">Checkout unavailable</h1><p className="mt-3 text-app-muted">{error}</p><Link className="mt-6 inline-flex text-brand-primary dark:text-brand-action" to="/#plans">Return to plans</Link></section></main>;
	if (!quote) return <main className="grid min-h-screen place-items-center bg-app-canvas text-brand-primary dark:text-brand-action"><LoaderCircle className="size-7 animate-spin" /></main>;
	const term = quote.billingInterval === 'month' ? 'Monthly' : quote.intervalCount === 1 ? 'Yearly' : `${quote.intervalCount} years`;
	return <main className="min-h-screen bg-app-canvas px-5 py-10 text-app-text sm:px-8"><div className="mx-auto max-w-6xl"><Link className="inline-flex items-center gap-2 text-sm font-semibold text-app-muted" to="/#plans"><ArrowLeft className="size-4" /> Plans</Link><div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-[2rem] border border-brand-primary/10 bg-app-surface p-6 sm:p-9"><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Checkout · {packageSlug}</p><h1 className="mt-2 text-4xl font-black">Choose the paying workspace</h1><p className="mt-3 text-app-muted">The selected workspace will own this subscription, billing history, entitlements, and resources.</p><div className="mt-8 grid gap-3">{workspaces.map((workspace) => <button className={`flex items-center justify-between rounded-2xl border p-4 text-left ${workspaceId === workspace.publicId ? 'border-brand-action bg-brand-action/10' : 'border-brand-primary/10'}`} key={workspace.publicId} onClick={() => setWorkspaceId(workspace.publicId)} type="button"><span><span className="block font-bold">{workspace.name}</span><span className="text-xs capitalize text-app-muted">{workspace.type} · {workspace.publicId}</span></span>{workspaceId === workspace.publicId && <Check className="size-5 text-brand-primary dark:text-brand-action" />}</button>)}</div>{workspaceId && <Link className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-action px-5 py-4 font-bold text-brand-ink" to={`/workspace/${workspaceId}/subscription`}>Continue to subscription <ArrowRight className="size-4" /></Link>}</section><aside className="h-fit rounded-[2rem] bg-brand-primary p-6 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-brand-action">Order summary</p><h2 className="mt-5 text-3xl font-black">{quote.packageName}</h2><p className="mt-2 text-white/60">{term} billing</p><dl className="mt-8 space-y-4 border-t border-white/10 pt-6 text-sm"><div className="flex justify-between"><dt className="text-white/60">Package</dt><dd>{money(quote.subtotalMinor)}</dd></div>{quote.discountMinor > 0 && <div className="flex justify-between text-brand-action"><dt>Discount</dt><dd>-{money(quote.discountMinor)}</dd></div>}<div className="flex justify-between"><dt className="text-white/60">GST</dt><dd>{money(quote.taxMinor)}</dd></div><div className="flex justify-between border-t border-white/10 pt-4 text-lg font-bold"><dt>Total</dt><dd>{money(quote.totalMinor)}</dd></div></dl><p className="mt-6 text-xs leading-5 text-white/50">The server recalculated this quote from the selected price ID. Payment is added in the next workspace-billing step.</p></aside></div></div></main>;
}
