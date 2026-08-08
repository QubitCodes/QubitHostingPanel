import { Activity, ArrowLeft, ArrowRightLeft, Braces, Code2, DatabaseZap, LayoutDashboard, Moon, Settings2, Sun, Table2, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

export interface DatabaseManagerContext {
	connectedApplications: Array<{ id: string; name: string }>;
	connectionLimit?: number | null;
	createdAt: string;
	databaseName: string;
	displayName: string;
	engine: 'mysql' | 'postgresql';
	engineVersion: string;
	id: string;
	passwordImpact: { applications: Array<{ id: string; name: string }>; databases: Array<{ databaseName: string; id: string }> };
	status: string;
	storageQuotaMb?: number | null;
	username: string;
	workspacePublicId: number;
}

/** Standalone database-management shell, isolated from the customer dashboard. */
export default function DatabaseLayout() {
	const { databaseId } = useParams();
	const navigate = useNavigate();
	const [database, setDatabase] = useState<DatabaseManagerContext>();
	const [error, setError] = useState('');
	const [dark, setDark] = useState(false);
	useEffect(() => {
		if (!sessionStorage.getItem('accessToken')) { navigate(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`, { replace: true }); return; }
		const controller = new AbortController();
		void authenticatedFetch(`/api/v1/databases/${databaseId}/context`, { signal: controller.signal }).then(async (response) => { const body = await response.json() as { data?: DatabaseManagerContext; message: string; status: boolean }; if (!response.ok || !body.status || !body.data) throw new Error(body.message); setDatabase(body.data); }).catch((reason: unknown) => { if (reason instanceof DOMException && reason.name === 'AbortError') return; setError(reason instanceof Error ? reason.message : 'Unable to open database.'); });
		return () => controller.abort();
	}, [databaseId, navigate]);
	useEffect(() => { const timeout = window.setTimeout(() => { const enabled = localStorage.getItem('theme') === 'dark'; setDark(enabled); document.documentElement.classList.toggle('dark', enabled); }, 0); return () => window.clearTimeout(timeout); }, []);
	const basePath = `/database/${databaseId}`;
	const navigation = [{ icon: LayoutDashboard, label: 'Overview', to: basePath, end: true }, { icon: Table2, label: 'Tables', to: `${basePath}/tables` }, { icon: DatabaseZap, label: 'Schema Designer', to: `${basePath}/schema` }, { icon: Code2, label: 'SQL', to: `${basePath}/sql` }, { icon: Braces, label: 'Objects', to: `${basePath}/objects` }, { icon: ArrowRightLeft, label: 'Import / Export', to: `${basePath}/transfers` }, { icon: UsersRound, label: 'Access', to: `${basePath}/access` }, { icon: Activity, label: 'Diagnostics', to: `${basePath}/diagnostics` }, { icon: Settings2, label: 'Settings', to: `${basePath}/settings` }];
	if (error) return <main className="grid min-h-screen place-items-center bg-app-canvas p-5 text-app-text"><section className="max-w-md rounded-3xl border border-red-500/20 bg-app-surface p-8 text-center"><h1 className="text-2xl font-black">Unable to Open Database</h1><p className="mt-3 text-sm text-red-500">{error}</p><Link className="mt-6 inline-flex rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" to="/dashboard/databases">Return to Databases</Link></section></main>;
	if (!database) return <main className="grid min-h-screen place-items-center bg-app-canvas text-app-text"><div className="size-8 animate-spin rounded-full border-4 border-brand-primary/20 border-t-brand-action" /></main>;
	return <main className="min-h-screen bg-app-canvas text-app-text lg:grid lg:grid-cols-[17rem_1fr]">
		<aside className="border-b border-brand-primary/10 bg-brand-primary p-5 text-white lg:sticky lg:top-0 lg:h-screen"><Link className="flex items-center gap-3 font-bold" to="/"><span className="grid size-10 place-items-center rounded-xl bg-brand-action text-brand-ink">G</span>Ghost Deploy</Link><div className="mt-8 rounded-2xl bg-white/10 p-4"><p className="text-xs font-bold uppercase text-white/60">Database</p><h1 className="mt-1 truncate text-lg font-black" title={database.databaseName}>{database.displayName}</h1><p className="mt-1 truncate font-mono text-xs text-white/60">{database.databaseName}</p></div><nav className="mt-6 grid gap-1">{navigation.map(({ end, icon: Icon, label, to }) => <NavLink className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${isActive ? 'bg-brand-action text-brand-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'}`} end={end} key={to} to={to}><Icon className="size-4" />{label}</NavLink>)}</nav><Link className="mt-8 flex items-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-sm font-bold text-white/80 hover:bg-white/10" to={`/dashboard/databases/${database.id}`}><ArrowLeft className="size-4" />Back to Dashboard</Link></aside>
		<section className="min-w-0"><header className="sticky top-0 z-40 flex min-h-20 items-center justify-between border-b border-brand-primary/10 bg-app-canvas/90 px-5 backdrop-blur-xl sm:px-8"><div><p className="text-xs font-bold uppercase text-app-muted">{database.engine} {database.engineVersion}</p><strong>{database.databaseName}</strong></div><button aria-label="Toggle colour theme" className="rounded-xl border border-brand-primary/15 p-2.5" onClick={() => { const next = !dark; setDark(next); localStorage.setItem('theme', next ? 'dark' : 'light'); document.documentElement.classList.toggle('dark', next); }} type="button">{dark ? <Sun className="size-5" /> : <Moon className="size-5" />}</button></header><div className="p-5 sm:p-8"><Outlet context={{ database }} /></div></section>
	</main>;
}
