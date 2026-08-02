import { useLocation } from 'react-router';

export default function CustomerSectionPage() {
	const section = useLocation().pathname.split('/').at(-1) ?? 'workspace';
	return <div className="mx-auto max-w-5xl"><p className="text-sm font-semibold capitalize text-brand-primary dark:text-brand-action">{section}</p><h2 className="mt-2 text-4xl font-black capitalize">Workspace {section}</h2><div className="mt-8 rounded-3xl border border-brand-primary/10 bg-app-surface p-7"><p className="text-app-muted">This workspace-owned section is ready for the next billing and subscription implementation step.</p></div></div>;
}
