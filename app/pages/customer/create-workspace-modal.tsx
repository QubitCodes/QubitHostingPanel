import { X } from 'lucide-react';
import { Link } from 'react-router';

import CustomerOverviewPage from './overview';

export default function CreateWorkspaceModalPage() {
	return <><CustomerOverviewPage /><div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"><section className="w-full max-w-lg rounded-[2rem] bg-app-surface p-7 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">New workspace</p><h2 className="mt-1 text-3xl font-black">Choose its plan first</h2></div><Link aria-label="Close" className="rounded-xl border border-brand-primary/10 p-2" to="/dashboard"><X className="size-5" /></Link></div><p className="mt-5 leading-7 text-app-muted">Every workspace has independent billing and its own plan. Select a package, complete its purchase, then name and configure the workspace.</p><Link className="mt-7 inline-flex w-full justify-center rounded-2xl bg-brand-action px-5 py-4 font-bold text-brand-ink" to="/#plans">Choose a plan</Link></section></div></>;
}
