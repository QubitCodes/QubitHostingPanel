import { ArrowRight, Building2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface WorkspaceSummary { name: string; publicId: number; role: string; type: 'organisation' | 'personal' }

export default function WorkspacesPage() {
	const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
	useEffect(() => { void authenticatedFetch('/api/v1/workspaces').then((response) => response.json()).then((body: { data?: WorkspaceSummary[] }) => setWorkspaces(body.data ?? [])); }, []);
	return <div className="mx-auto max-w-6xl"><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Your account</p><h2 className="mt-1 text-4xl font-black tracking-tight">Choose a workspace</h2><p className="mt-3 text-app-muted">Each workspace keeps its own subscription, billing, and hosting resources.</p></div><button className="inline-flex items-center gap-2 rounded-xl bg-brand-action px-4 py-3 font-semibold text-brand-ink" type="button"><Plus className="size-4" /> New workspace</button></div><div className="mt-10 grid gap-4 md:grid-cols-2">{workspaces.map((workspace) => <Link className="group rounded-3xl border border-brand-primary/10 bg-app-surface p-6 transition hover:-translate-y-0.5 hover:border-brand-action" key={workspace.publicId} to={`/workspace/${workspace.publicId}/overview`}><div className="flex items-start justify-between"><Building2 className="size-7 text-brand-primary dark:text-brand-action" /><ArrowRight className="size-5 text-app-muted transition group-hover:translate-x-1" /></div><h3 className="mt-8 text-2xl font-bold">{workspace.name}</h3><p className="mt-2 text-sm capitalize text-app-muted">{workspace.type} workspace · {workspace.role}</p><p className="mt-5 text-xs font-semibold text-app-muted">{workspace.publicId}</p></Link>)}</div></div>;
}
