import { useLocation, useOutletContext } from 'react-router';

import type { WorkspaceSummary } from '@root/app/layouts/customer';

export default function CustomerSectionPage() {
	const section = useLocation().pathname.split('/').at(-1) ?? 'dashboard';
	const { active } = useOutletContext<{ active?: WorkspaceSummary }>();
	const detail = section === 'subscription' ? `${active?.packageName ?? 'No plan'} · ${active?.subscriptionStatus ?? 'inactive'}` : section === 'billing' ? `Billing is isolated to ${active?.name ?? 'this workspace'}.` : `Owner security is active for ${active?.name ?? 'this workspace'}.`;
	return <div className="mx-auto max-w-5xl"><p className="text-sm font-semibold capitalize text-brand-primary dark:text-brand-action">{section}</p><h2 className="mt-2 text-4xl font-black capitalize">Workspace {section}</h2><div className="mt-8 rounded-3xl border border-brand-primary/10 bg-app-surface p-7"><p className="text-lg font-semibold capitalize">{detail}</p>{active?.termEndsAt && section === 'subscription' && <p className="mt-3 text-sm text-app-muted">Current term ends {new Date(active.termEndsAt).toLocaleDateString('en-IN')}.</p>}</div></div>;
}
