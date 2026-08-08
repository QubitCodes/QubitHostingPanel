import { KeyRound, RotateCw, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { DatabaseBackups } from '@components/customer/DatabaseBackups';
import { DatabaseInventoryList } from '@components/customer/DatabaseInventoryList';
import { DatabaseSchemaManager } from '@components/customer/DatabaseSchemaManager';
import { DatabaseQueryWorkspace } from '@components/customer/DatabaseQueryWorkspace';
import { DatabaseTransfers } from '@components/customer/DatabaseTransfers';
import { openAuthenticatedPanelTab } from '@root/app/utils/panelNavigation';

interface DatabaseRecord {
	connectedApplications: Array<{ id: string; name: string }>;
	connectionLimit?: number | null;
	createdAt: string;
	databaseName: string;
	displayName: string;
	engine: 'mysql' | 'postgresql';
	engineVersion: string;
	id: string;
	status: string;
	storageQuotaMb?: number | null;
	username: string;
}
interface Credential { databaseName: string; engine: string; host: string; password: string; port: number; username: string }
interface Props {
	credential?: Credential;
	onCredentialAction: (action: 'credentials' | 'rotate') => void;
	onTogglePassword: () => void;
	passwordVisible: boolean;
	record: DatabaseRecord;
	submitting: boolean;
	workspacePublicId: number;
}

/** Full-screen, URL-addressable workspace for one logical database. */
export function DatabaseWorkspace({ credential, onCredentialAction, onTogglePassword, passwordVisible, record, submitting, workspacePublicId }: Props) {
	const navigate = useNavigate();
	const location = useLocation();
	const { objectKind, schemaName, section } = useParams();
	const requestedSection = objectKind ? 'objects' : schemaName ? 'tables' : section;
	const activeSection = requestedSection && ['backups', 'connection', 'objects', 'overview', 'schema', 'settings', 'sql', 'tables', 'transfers'].includes(requestedSection) ? requestedSection : 'overview';
	const basePath = `/dashboard/databases/${record.id}`;
	useEffect(() => {
		if (location.pathname === basePath) navigate(`${basePath}/overview`, { replace: true });
	}, [basePath, location.pathname, navigate]);
	const tabs = [
		{ label: 'Overview', path: 'overview' },
		{ label: 'Tables', path: 'tables' },
		{ label: 'Schema Designer', path: 'schema' },
		{ label: 'SQL', path: 'sql' },
		{ label: 'Objects', path: 'objects' },
		{ label: 'Backups', path: 'backups' },
		{ label: 'Import / Export', path: 'transfers' },
		{ label: 'Connection', path: 'connection' },
		{ label: 'Settings', path: 'settings' },
	];

	return <div className="mx-auto max-w-[100rem]">
		<div className="flex flex-col gap-3 border-b border-brand-primary/10 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">{record.engine} {record.engineVersion}</p><h2 className="mt-1 text-3xl font-black">{record.displayName || record.databaseName}</h2><p className="mt-1 font-mono text-xs text-app-muted">{record.databaseName}</p></div><span className="w-fit rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold capitalize text-emerald-700 dark:text-emerald-300">{record.status}</span></div>
		<nav className="mt-5 flex gap-6 overflow-x-auto border-b border-brand-primary/10">{tabs.map((tab) => <Link className={`shrink-0 border-b-2 px-1 pb-3 font-bold ${activeSection === tab.path ? 'border-brand-action text-app-text' : 'border-transparent text-app-muted hover:text-app-text'}`} key={tab.path} to={`${basePath}/${tab.path}`}>{tab.label}</Link>)}</nav>
		<div className="py-7">
			{activeSection === 'overview' && <div className="grid gap-5"><dl className="grid gap-4 rounded-2xl border border-brand-primary/10 p-5 sm:grid-cols-2 lg:grid-cols-3">{[['Engine', `${record.engine} ${record.engineVersion}`], ['Status', record.status], ['Username', record.username], ['Connected applications', record.connectedApplications.length ? record.connectedApplications.map(({ name }) => name).join(', ') : 'None'], ['Connection limit', record.connectionLimit ?? '—'], ['Storage quota', `${record.storageQuotaMb ?? '—'} MB`], ['Created', new Date(record.createdAt).toLocaleString('en-IN')]].map(([label, value]) => <div key={String(label)}><dt className="text-xs font-bold uppercase text-app-muted">{label}</dt><dd className="mt-1 break-all font-mono text-sm">{String(value)}</dd></div>)}</dl><div className="flex flex-col gap-4 rounded-2xl border border-brand-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black">Database Manager</h3><p className="mt-1 text-sm text-app-muted">Open the full database workspace in a separate tab.</p></div><button className="shrink-0 rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" onClick={() => void openAuthenticatedPanelTab(`/database/${record.id}`).catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Unable to open database.'))} type="button">Open DB</button></div></div>}
			{activeSection === 'tables' && <DatabaseInventoryList databaseId={record.id} kind="tables" workspacePublicId={workspacePublicId} />}
			{activeSection === 'schema' && <DatabaseSchemaManager databaseId={record.id} engine={record.engine} workspacePublicId={workspacePublicId} />}
			{activeSection === 'sql' && <DatabaseQueryWorkspace databaseId={record.id} databaseName={record.databaseName} workspacePublicId={workspacePublicId} />}
			{activeSection === 'objects' && <DatabaseInventoryList databaseId={record.id} kind="objects" workspacePublicId={workspacePublicId} />}
			{activeSection === 'backups' && <DatabaseBackups databaseId={record.id} databaseName={record.databaseName} workspacePublicId={workspacePublicId} />}
			{activeSection === 'transfers' && <DatabaseTransfers databaseId={record.id} databaseName={record.databaseName} engine={record.engine} workspacePublicId={workspacePublicId} />}
			{activeSection === 'connection' && <section><div className="rounded-2xl border border-brand-primary/10 p-5"><h3 className="text-xl font-black">Connection details</h3><p className="mt-1 text-sm text-app-muted">Credentials are revealed only after an audited request.</p><dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[['Host', credential?.host ?? 'Reveal credentials to view'], ['Port', credential?.port ?? '—'], ['Database', record.databaseName], ['Username', record.username], ['Password', passwordVisible && credential ? credential.password : '••••••••••••']].map(([label, value]) => <div key={String(label)}><dt className="text-xs font-bold uppercase text-app-muted">{label}</dt><dd className="mt-1 break-all font-mono text-sm">{String(value)}</dd></div>)}</dl><div className="mt-6 flex flex-wrap gap-3"><button className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-3 font-bold" disabled={submitting} onClick={() => onCredentialAction('credentials')} type="button"><KeyRound className="size-4" />Reveal Credentials</button><button className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 font-bold text-red-600 dark:text-red-300" disabled={submitting} onClick={() => { if (window.confirm(`Generate a new password for ${record.username}? Every connected database and application using this user will be affected.`)) onCredentialAction('rotate'); }} type="button"><RotateCw className="size-4" />Change Password</button>{credential && <button className="rounded-xl border border-brand-primary/15 px-4 py-3 font-bold" onClick={onTogglePassword} type="button">{passwordVisible ? 'Mask Password' : 'Show Password'}</button>}</div></div></section>}
			{activeSection === 'settings' && <section className="rounded-2xl border border-red-500/20 p-5"><h3 className="text-xl font-black text-red-600 dark:text-red-300">Danger zone</h3><p className="mt-2 text-sm text-app-muted">Database deletion is permanent and validates all connected project confirmations.</p><button className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 font-bold text-red-600 dark:text-red-300" disabled={submitting} onClick={() => navigate(`${basePath}/settings?action=delete`)} type="button"><Trash2 className="size-4" />Delete Database</button></section>}
		</div>
	</div>;
}
