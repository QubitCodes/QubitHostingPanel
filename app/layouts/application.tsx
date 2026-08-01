import { Bell, ChevronLeft, ChevronRight, LogOut, Menu, Moon, Search, Server, Settings, Shield, Sun, UserRound, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { authenticatedFetch, clearAuthentication } from '@root/app/utils/authenticatedFetch';

const navigation = [
	{ label: 'Overview', path: '/admin/overview', icon: Server },
	{ label: 'Administrators', path: '/admin/administrators', icon: Shield },
	{ label: 'Settings', path: '/settings/profile', icon: Settings }
];

const titles: Record<string, string> = {
	'/admin/overview': 'Overview',
	'/admin/administrators': 'Administrators',
	'/settings/profile': 'Profile settings',
	'/settings/security': 'Security settings',
	'/settings/sessions': 'Active sessions'
};

function pageTitle(pathname: string): string {
	return titles[pathname] ?? (pathname.startsWith('/admin/administrators/') ? 'Administrator details' : pathname.startsWith('/settings/sessions/') ? 'Session details' : pathname.startsWith('/search/') ? 'Search' : 'Qubit Hosting');
}

/** Authenticated application frame shared by platform and account routes. */
export default function ApplicationLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches));
	const [query, setQuery] = useState('');
	const user = (() => { try { return JSON.parse(sessionStorage.getItem('authUser') ?? '{}') as { displayName?: string; mobileE164?: string }; } catch { return {}; } })();

	useEffect(() => {
		if (!sessionStorage.getItem('accessToken')) navigate('/login', { replace: true });
		document.documentElement.classList.toggle('dark', dark);
	}, [dark, navigate]);

	function toggleTheme(): void {
		const next = !dark; setDark(next); localStorage.setItem('theme', next ? 'dark' : 'light'); document.documentElement.classList.toggle('dark', next);
	}

	async function logout(): Promise<void> {
		try { await authenticatedFetch('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); } finally { clearAuthentication(); navigate('/login'); }
	}

	function search(event: FormEvent): void { event.preventDefault(); if (query.trim()) navigate(`/search/${encodeURIComponent(query.trim())}`); }

	const sidebar = <><div className="flex h-20 items-center justify-between px-4"><NavLink className="flex items-center gap-3 overflow-hidden" to="/admin/overview"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e0ff71] font-bold text-[#123c32]">Q</span>{!collapsed && <span className="whitespace-nowrap font-semibold tracking-tight">Qubit Hosting</span>}</NavLink><button className="lg:hidden" onClick={() => setMobileOpen(false)}><X className="size-5" /></button></div><nav className="flex-1 space-y-1 px-3">{navigation.map(({ icon: Icon, ...item }) => <NavLink className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${isActive ? 'bg-[#e0ff71] text-[#123c32]' : 'text-emerald-50/70 hover:bg-white/10 hover:text-white'}`} key={item.path} onClick={() => setMobileOpen(false)} to={item.path}><Icon className="size-5 shrink-0" />{!collapsed && item.label}</NavLink>)}</nav><div className="m-3 rounded-2xl border border-white/10 bg-white/5 p-3">{!collapsed && <div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-emerald-100/50">Company credits</p><p className="mt-1 text-sm text-emerald-50">Available with billing</p></div>}<div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100/10"><UserRound className="size-4" /></span>{!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.displayName || 'Account'}</p><p className="truncate text-xs text-emerald-100/55">{user.mobileE164 || 'Verified identity'}</p></div>}<button aria-label="Sign out" className="rounded-lg p-2 text-emerald-100/60 hover:bg-white/10 hover:text-white" onClick={() => void logout()}><LogOut className="size-4" /></button></div></div></>;

	return <div className="min-h-screen bg-[#f4f2ec] text-stone-950 dark:bg-[#111513] dark:text-stone-50"><aside className={`fixed inset-y-0 left-0 z-50 hidden flex-col bg-[#123c32] text-white transition-[width] lg:flex ${collapsed ? 'w-20' : 'w-64'}`}>{sidebar}<button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="absolute -right-3 top-24 grid size-7 place-items-center rounded-full bg-[#e0ff71] text-[#123c32] shadow" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}</button></aside>{mobileOpen && <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#123c32] text-white shadow-2xl lg:hidden">{sidebar}</aside>}<div className={`transition-[padding] ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}><header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-stone-200/80 bg-[#f4f2ec]/90 px-4 backdrop-blur-xl dark:border-stone-800 dark:bg-[#111513]/90 sm:px-6"><button className="rounded-xl p-2 hover:bg-stone-200 dark:hover:bg-stone-800 lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></button><div className="min-w-0"><p className="text-xs font-medium text-teal-700 dark:text-[#e0ff71]">Control centre</p><h1 className="truncate text-lg font-semibold">{pageTitle(location.pathname)}</h1></div><form className="ml-auto hidden w-full max-w-sm sm:block" onSubmit={search}><label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" /><input className="w-full rounded-xl border border-stone-200 bg-white/70 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-700 dark:border-stone-700 dark:bg-stone-900 dark:text-white" onChange={(event) => setQuery(event.target.value)} placeholder="Search the panel" value={query} /></label></form><button aria-label="Notifications" className="rounded-xl p-2.5 hover:bg-stone-200 dark:hover:bg-stone-800"><Bell className="size-5" /></button><button aria-label="Toggle theme" className="rounded-xl p-2.5 hover:bg-stone-200 dark:hover:bg-stone-800" onClick={toggleTheme}>{dark ? <Sun className="size-5" /> : <Moon className="size-5" />}</button></header><main className="p-4 sm:p-6 lg:p-8"><Outlet /></main></div></div>;
}
