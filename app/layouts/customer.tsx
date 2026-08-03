import { CreditCard, Database, LayoutDashboard, LogOut, ServerCog, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { SearchableSelect } from '@root/app/components/forms/searchable-select';
import { authenticatedFetch, clearAuthentication } from '@root/app/utils/authenticatedFetch';

export interface WorkspaceSummary { name: string; packageName?: string | null; publicId: number; role: string; subscriptionStatus?: string | null; termEndsAt?: string | null; trialEndsAt?: string | null; type: 'organisation' | 'personal' }

/** Customer dashboard shell with URL-independent workspace selection in the topbar. */
export default function CustomerLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
	const [activeId, setActiveId] = useState('');
	const authUser = typeof sessionStorage === 'undefined' ? {} : JSON.parse(sessionStorage.getItem('authUser') ?? '{}') as { displayName?: string; hasAdminAccess?: boolean };
	const active = workspaces.find((workspace) => String(workspace.publicId) === activeId) ?? workspaces[0];
	const options = useMemo(() => workspaces.map((workspace) => ({ label: workspace.name, value: String(workspace.publicId), keywords: `${workspace.publicId} ${workspace.type}` })), [workspaces]);

	useEffect(() => {
		if (!sessionStorage.getItem('accessToken')) { navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true }); return; }
		void authenticatedFetch('/api/v1/workspaces').then(async (response) => { const body = await response.json() as { data?: WorkspaceSummary[]; status: boolean }; if (!response.ok || !body.status) throw new Error(); const rows = body.data ?? []; if (!rows.length) { navigate('/#plans', { replace: true }); return; } setWorkspaces(rows); const stored = localStorage.getItem('activeWorkspaceId'); const selected = rows.some((workspace) => String(workspace.publicId) === stored) ? stored : String(rows[0].publicId); setActiveId(selected ?? ''); }).catch(() => navigate('/login', { replace: true }));
	}, [location.pathname, navigate]);

	async function logout(): Promise<void> { await authenticatedFetch('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); clearAuthentication(); navigate('/'); }
	const navigation = [{ icon: LayoutDashboard, label: 'Overview', to: '/dashboard' }, { icon: Database, label: 'Databases', to: '/dashboard/databases' }, { icon: ServerCog, label: 'Subscription', to: '/dashboard/subscription' }, { icon: CreditCard, label: 'Billing', to: '/dashboard/billing' }, { icon: ShieldCheck, label: 'Security', to: '/dashboard/security' }];
	return <main className="min-h-screen bg-app-canvas text-app-text lg:grid lg:grid-cols-[16rem_1fr]"><aside className="border-b border-brand-primary/10 bg-brand-primary p-5 text-white lg:sticky lg:top-0 lg:h-screen"><Link className="flex items-center gap-3 font-bold" to="/"><span className="grid size-10 place-items-center rounded-xl bg-brand-action text-brand-ink">Q</span> Qubit Hosting</Link><nav className="mt-10 grid gap-1">{navigation.map(({ icon: Icon, label, to }) => <NavLink className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${isActive ? 'bg-brand-action text-brand-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'}`} end={to === '/dashboard'} key={to} to={to}><Icon className="size-4" />{label}</NavLink>)}</nav><div className="mt-8 border-t border-white/10 pt-5 lg:absolute lg:inset-x-5 lg:bottom-5"><p className="truncate text-sm font-semibold">{authUser.displayName ?? 'Customer'}</p><div className="mt-3 flex gap-2">{authUser.hasAdminAccess && <Link className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold" to="/admin/overview">Admin panel</Link>}<button className="rounded-lg bg-rose-500/15 p-2 text-rose-200" onClick={() => void logout()} type="button"><LogOut className="size-4" /></button></div></div></aside><section className="min-w-0"><header className="sticky top-0 z-40 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-brand-primary/10 bg-app-canvas/90 px-5 py-3 backdrop-blur-xl sm:px-8"><div className="min-w-[12rem] flex-1 sm:max-w-sm"><SearchableSelect ariaLabel="Choose active workspace" onChange={(value) => { setActiveId(value); localStorage.setItem('activeWorkspaceId', value); }} options={options} placeholder="Choose workspace" searchable value={active ? String(active.publicId) : ''} /></div><div className="flex items-center gap-2"><Link className="rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-semibold" to="/dashboard/workspaces/create">Create workspace</Link><Link className="rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-semibold" to="/">Website</Link></div></header><div className="p-5 sm:p-8"><Outlet context={{ active, workspaces }} /></div></section></main>;
}
