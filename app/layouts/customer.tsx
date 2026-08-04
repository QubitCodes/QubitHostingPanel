import { BarChart3, Boxes, CreditCard, Database, LayoutDashboard, LogOut, ServerCog, Settings2, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { SearchableSelect } from '@root/app/components/forms/searchable-select';
import { authenticatedFetch, clearAuthentication } from '@root/app/utils/authenticatedFetch';

export interface WorkspaceSummary { cancelAtPeriodEnd?: boolean | null; name: string; packageName?: string | null; publicId: number; role: string; subscriptionStatus?: string | null; termEndsAt?: string | null; trialEndsAt?: string | null; type: 'organisation' | 'personal' }

/** Customer dashboard shell with URL-independent workspace selection in the topbar. */
export default function CustomerLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
	const [activeId, setActiveId] = useState('');
	const [authUser, setAuthUser] = useState<{ displayName?: string; hasAdminAccess?: boolean; hasCustomerDashboardAccess?: boolean }>(() => typeof sessionStorage === 'undefined' ? {} : JSON.parse(sessionStorage.getItem('authUser') ?? '{}'));
	const active = workspaces.find((workspace) => String(workspace.publicId) === activeId) ?? workspaces[0];
	const options = useMemo(() => workspaces.map((workspace) => ({ label: workspace.name, value: String(workspace.publicId), keywords: `${workspace.publicId} ${workspace.type}` })), [workspaces]);

	useEffect(() => {
		if (!sessionStorage.getItem('accessToken')) { navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true }); return; }
		void Promise.all([authenticatedFetch('/api/v1/auth/profile'), authenticatedFetch('/api/v1/workspaces')]).then(async ([profileResponse, workspaceResponse]) => {
			const profileBody = await profileResponse.json() as { data?: typeof authUser; status: boolean };
			const workspaceBody = await workspaceResponse.json() as { data?: WorkspaceSummary[]; status: boolean };
			if (!profileResponse.ok || !profileBody.status || !profileBody.data || !workspaceResponse.ok || !workspaceBody.status) throw new Error();
			if (!profileBody.data.hasCustomerDashboardAccess) { navigate('/', { replace: true }); return; }
			sessionStorage.setItem('authUser', JSON.stringify(profileBody.data));
			setAuthUser(profileBody.data);
			const rows = workspaceBody.data ?? [];
			setWorkspaces(rows);
			const stored = localStorage.getItem('activeWorkspaceId');
			const selected = rows.some((workspace) => String(workspace.publicId) === stored) ? stored : rows[0] ? String(rows[0].publicId) : '';
			setActiveId(selected ?? '');
		}).catch(() => navigate('/login', { replace: true }));
	}, [location.pathname, navigate]);

	async function logout(): Promise<void> { await authenticatedFetch('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); clearAuthentication(); navigate('/'); }
	const navigation = [{ icon: LayoutDashboard, label: 'Overview', to: '/dashboard' }, ...(workspaces.length ? [{ icon: Boxes, label: 'Applications', to: '/dashboard/applications' }, { icon: Database, label: 'Databases', to: '/dashboard/databases' }, { icon: BarChart3, label: 'Usage', to: '/dashboard/usage' }, { icon: ServerCog, label: 'Subscription', to: '/dashboard/subscription' }, { icon: Settings2, label: 'Workspace', to: '/dashboard/workspace' }] : []), { icon: CreditCard, label: 'Billing', to: '/dashboard/billing' }, { icon: ShieldCheck, label: 'Security', to: '/dashboard/security' }];
	return <main className="min-h-screen bg-app-canvas text-app-text lg:grid lg:grid-cols-[16rem_1fr]"><aside className="border-b border-brand-primary/10 bg-brand-primary p-5 text-white lg:sticky lg:top-0 lg:h-screen"><Link className="flex items-center gap-3 font-bold" to="/"><span className="grid size-10 place-items-center rounded-xl bg-brand-action text-brand-ink">Q</span> Qubit Hosting</Link><nav className="mt-10 grid gap-1">{navigation.map(({ icon: Icon, label, to }) => <NavLink className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${isActive ? 'bg-brand-action text-brand-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'}`} end={to === '/dashboard'} key={to} to={to}><Icon className="size-4" />{label}</NavLink>)}</nav></aside><section className="min-w-0"><header className="sticky top-0 z-40 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-brand-primary/10 bg-app-canvas/90 px-5 py-3 backdrop-blur-xl sm:px-8"><div className="min-w-[12rem] flex-1 sm:max-w-sm">{workspaces.length ? <SearchableSelect ariaLabel="Choose active workspace" onChange={(value) => { setActiveId(value); localStorage.setItem('activeWorkspaceId', value); }} options={options} placeholder="Choose workspace" searchable value={active ? String(active.publicId) : ''} /> : <p className="text-sm font-semibold text-app-muted">No active workspace</p>}</div><details className="relative"><summary className="cursor-pointer list-none rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-semibold">{authUser.displayName ?? 'Account'}</summary><div className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-brand-primary/10 bg-app-surface p-2 shadow-xl"><Link className="block rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-primary/5" to="/">Website</Link><Link className="block rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-primary/5" to="/dashboard">Dashboard</Link>{authUser.hasAdminAccess && <Link className="block rounded-xl px-3 py-2 text-sm font-semibold hover:bg-brand-primary/5" to="/admin/overview">Admin Dashboard</Link>}<button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-500 hover:bg-rose-500/10" onClick={() => void logout()} type="button"><LogOut className="size-4" /> Logout</button></div></details></header><div className="p-5 sm:p-8"><Outlet context={{ active, workspaces }} /></div></section></main>;
}
