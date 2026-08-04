import { ExternalLink, Server, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';

import { CheckoutAttemptHistory } from '@root/app/components/customer/checkout-attempt-history';
import { PlanCard, type WorkspaceDetail } from '@root/app/pages/customer/section';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Resource { id: string; jobStatus: string; kind?: string | null; lastError?: string | null; name?: string | null; provider: string; publicUrl?: string | null; status?: string | null }

export default function CustomerOverviewPage() {
	const { active } = useOutletContext<{ active?: { name: string; packageName?: string | null; publicId: number; subscriptionStatus?: string | null } }>();
	const [resources, setResources] = useState<Resource[]>([]);
	const [detail, setDetail] = useState<WorkspaceDetail>();
	useEffect(() => {
		if (!active) { setResources([]); setDetail(undefined); return; }
		void Promise.all([
			authenticatedFetch(`/api/v1/workspaces/${active.publicId}/resources`).then((response) => response.json()),
			authenticatedFetch(`/api/v1/workspaces/${active.publicId}`).then((response) => response.json()),
		]).then(([resourceBody, detailBody]: [{ data?: Resource[]; status: boolean }, { data?: WorkspaceDetail; status: boolean }]) => {
			setResources(resourceBody.status ? resourceBody.data ?? [] : []);
			setDetail(detailBody.status ? detailBody.data : undefined);
		});
	}, [active]);
	const latest = resources[0];
	const resourceText = latest?.jobStatus === 'failed' ? 'Provisioning needs attention' : latest?.status === 'running' ? 'Application is running' : latest ? 'Provisioning in progress' : 'Awaiting provisioning';
	return <div className="mx-auto max-w-6xl"><section className="rounded-[2rem] bg-brand-primary p-7 text-white sm:p-10"><p className="text-sm font-semibold text-brand-action">Customer Dashboard</p><h2 className="mt-3 text-4xl font-black">Welcome to {active?.name ?? 'your account'}.</h2><p className="mt-4 max-w-2xl text-white/70">{active ? 'Your subscription, billing history, limits, and hosting resources live here.' : 'Your payment attempts are saved here. Complete or retry a checkout to create your first workspace.'}</p></section>{!active && <div className="mt-6"><CheckoutAttemptHistory /></div>}<div className="mt-6 grid gap-4 md:grid-cols-2">{[[Server, 'Hosting resources', resourceText], [ShieldCheck, 'Account security', 'Passwordless access and device sessions']].map(([Icon, title, text]) => { const CardIcon = Icon as typeof Server; return <article className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6" key={String(title)}><CardIcon className="size-6 text-brand-primary dark:text-brand-action" /><h3 className="mt-8 font-bold">{String(title)}</h3><p className="mt-2 text-sm text-app-muted">{String(text)}</p></article>; })}</div>{detail && <div className="mt-6"><PlanCard detail={detail} /></div>}{latest && <section className="mt-6 rounded-3xl border border-brand-primary/10 bg-app-surface p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-app-muted">{latest.provider}</p><h3 className="mt-2 text-xl font-bold">{latest.name ?? 'Starter application'}</h3><p className="mt-2 text-sm capitalize text-app-muted">{latest.status ?? latest.jobStatus}</p></div>{latest.publicUrl && <a className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-4 py-2 font-semibold text-brand-ink" href={latest.publicUrl} rel="noreferrer" target="_blank">Open application <ExternalLink className="size-4" /></a>}</div>{latest.lastError && <p className="mt-5 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">{latest.lastError}</p>}</section>}</div>;
}
