import { Building2, CreditCard, LayoutDashboard, LogOut, ServerCog, Settings, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';

import { authenticatedFetch, clearAuthentication } from '@root/app/utils/authenticatedFetch';

interface WorkspaceSummary { name: string; publicId: number; role: string; type: 'organisation' | 'personal' }

/** Customer-specific workspace shell, intentionally independent from platform-admin navigation. */
export default function CustomerLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const { workspaceId } = useParams();
	const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
	const active = workspaces.find((workspace) => String(workspace.publicId) === workspaceId);
	const authUser = typeof sessionStorage === 'undefined' ? {} : JSON.parse(sessionStorage.getItem('authUser') ?? '{}') as { displayName?: string; hasAdminAccess?: boolean };

	useEffect(() => {
		if (!sessionStorage.getItem('accessToken')) { navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true }); return; }
		void authenticatedFetch('/api/v1/workspaces').then(async (response) => {
			const body = await response.json() as { data?: WorkspaceSummary[]; status: boolean };
			if (!response.ok || !body.status) throw new Error();
			setWorkspaces(body.data ?? []);
		}).catch(() => navigate('/login', { replace: true }));
	}, [location.pathname, navigate]);

	async function logout(): Promise<void> {
		await authenticatedFetch('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
		clearAuthentication();
		navigate('/');
	}

	const base = active ? `/workspace/${active.publicId}` : undefined;
	const navigation = base ? [
		{ icon: LayoutDashboard, label: 'Overview', to: `${base}/overview` },
		{ icon: ServerCog, label: 'Subscription', to: `${base}/subscription` },
		{ icon: CreditCard, label: 'Billing', to: `${base}/billing` },
		{ icon: ShieldCheck, label: 'Security', to: `${base}/security` },
	] : [];

	return <main className="min-h-screen bg-app-canvas text-app-text lg:grid lg:grid-cols-[17rem_1fr]">
		<aside className="border-b border-brand-primary/10 bg-brand-primary p-5 text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
			<Link className="flex items-center gap-3 font-bold" to="/"><span className="grid size-10 place-items-center rounded-xl bg-brand-action text-brand-ink">Q</span> Qubit Hosting</Link>
			<Link className="mt-8 flex items-center gap-3 rounded-2xl border border-white/15 p-3" to="/workspaces"><Building2 className="size-5 text-brand-action" /><span className="min-w-0"><span className="block truncate font-semibold">{active?.name ?? 'Your workspaces'}</span><span className="text-xs capitalize text-white/55">{active ? `${active.type} · ${active.role}` : 'Choose workspace'}</span></span></Link>
			<nav className="mt-6 grid gap-1">{navigation.map(({ icon: Icon, label, to }) => <NavLink className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${isActive ? 'bg-brand-action text-brand-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'}`} key={to} to={to}><Icon className="size-4" />{label}</NavLink>)}</nav>
			<div className="mt-8 border-t border-white/10 pt-5 lg:absolute lg:inset-x-5 lg:bottom-5"><p className="truncate text-sm font-semibold">{authUser.displayName ?? 'Customer'}</p><div className="mt-3 flex flex-wrap gap-2">{authUser.hasAdminAccess && <Link className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold" to="/admin/overview">Admin panel</Link>}<Link className="rounded-lg bg-white/10 p-2" to="/settings/profile"><Settings className="size-4" /></Link><button className="rounded-lg bg-rose-500/15 p-2 text-rose-200" onClick={() => void logout()} type="button"><LogOut className="size-4" /></button></div></div>
		</aside>
		<section className="min-w-0"><header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-brand-primary/10 bg-app-canvas/90 px-5 backdrop-blur-xl sm:px-8"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-brand-primary dark:text-brand-action">Customer panel</p><h1 className="text-xl font-bold">{active?.name ?? 'Workspaces'}</h1></div><Link className="rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-semibold" to="/">View website</Link></header><div className="p-5 sm:p-8"><Outlet context={{ active, workspaces }} /></div></section>
	</main>;
}
