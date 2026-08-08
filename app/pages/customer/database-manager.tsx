import { KeyRound, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { toast } from 'sonner';

import { DatabaseBackups } from '@components/customer/DatabaseBackups';
import { DatabaseExplorer } from '@components/customer/DatabaseExplorer';
import { DatabaseObjects } from '@components/customer/DatabaseObjects';
import { DatabaseSchemaManager } from '@components/customer/DatabaseSchemaManager';
import type { DatabaseManagerContext } from '@root/app/layouts/database';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Credential { databaseName: string; engine: string; host: string; password: string; port: number; username: string }

/** URL-addressable content area for the standalone database manager. */
export default function DatabaseManagerPage() {
	const { database } = useOutletContext<{ database: DatabaseManagerContext }>();
	const { objectKind, schemaName, section } = useParams();
	const activeSection = objectKind ? 'objects' : schemaName ? 'tables' : (section ?? 'overview');
	const basePath = `/database/${database.id}`;
	const [credential, setCredential] = useState<Credential>();
	const [showPassword, setShowPassword] = useState(false);
	const [rotating, setRotating] = useState(false);
	async function credentialAction(action: 'credentials' | 'rotate'): Promise<void> {
		setRotating(true);
		try { const response = await authenticatedFetch(`/api/v1/workspaces/${database.workspacePublicId}/databases/${database.id}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action === 'rotate' ? { acceptedImpact: true } : {}) }); const body = await response.json() as { data?: Credential; message: string; status: boolean }; if (!response.ok || !body.status || !body.data) throw new Error(body.message); setCredential(body.data); setShowPassword(true); toast.success(action === 'rotate' ? 'Database-user password changed.' : 'Credentials revealed.'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Credential action failed.'); } finally { setRotating(false); }
	}
	if (activeSection === 'tables') return <DatabaseExplorer basePath={basePath} databaseId={database.id} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'objects') return <DatabaseObjects basePath={basePath} databaseId={database.id} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'schema') return <DatabaseSchemaManager databaseId={database.id} engine={database.engine} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'settings') return <div className="grid gap-6"><section className="rounded-2xl border border-brand-primary/10 bg-app-surface p-5"><h2 className="text-xl font-black">Connection and Password</h2><p className="mt-1 text-sm text-app-muted">The password belongs to the database user. Changing it affects every database and application using <strong>{database.username}</strong>. Running applications may need to be redeployed with the new credential.</p><div className="mt-4 grid gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm sm:grid-cols-2"><div><strong>Affected Databases ({database.passwordImpact.databases.length})</strong><p className="mt-1 break-words text-app-muted">{database.passwordImpact.databases.map(({ databaseName }) => databaseName).join(', ')}</p></div><div><strong>Affected Applications ({database.passwordImpact.applications.length})</strong><p className="mt-1 break-words text-app-muted">{database.passwordImpact.applications.map(({ name }) => name).join(', ') || 'None'}</p></div></div><dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[['Host', credential?.host ?? 'Reveal credentials to view'], ['Port', credential?.port ?? '—'], ['Database', database.databaseName], ['Username', database.username], ['Password', credential && showPassword ? credential.password : '••••••••••••']].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase text-app-muted">{label}</dt><dd className="mt-1 break-all font-mono text-sm">{value}</dd></div>)}</dl><div className="mt-6 flex flex-wrap gap-3"><button className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-3 font-bold" disabled={rotating} onClick={() => void credentialAction('credentials')} type="button"><KeyRound className="size-4" />Reveal Credentials</button><button className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-bold text-white" disabled={rotating} onClick={() => { if (window.confirm(`Generate a new password for ${database.username}? This affects ${database.passwordImpact.databases.length} database(s) and ${database.passwordImpact.applications.length} application(s).`)) void credentialAction('rotate'); }} type="button"><RotateCw className="size-4" />Change Password</button>{credential && <button className="rounded-xl border border-brand-primary/15 px-4 py-3 font-bold" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? 'Mask Password' : 'Show Password'}</button>}</div></section></div>;
	return <div className="grid gap-6"><div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Database Manager</p><h1 className="mt-2 text-4xl font-black">{database.displayName}</h1><p className="mt-2 font-mono text-sm text-app-muted">{database.databaseName}</p></div><dl className="grid gap-4 rounded-2xl border border-brand-primary/10 bg-app-surface p-5 sm:grid-cols-2 lg:grid-cols-3">{[['Engine', `${database.engine} ${database.engineVersion}`], ['Status', database.status], ['Username', database.username], ['Connected Applications', database.connectedApplications.map(({ name }) => name).join(', ') || 'None'], ['Connection Limit', database.connectionLimit ?? '—'], ['Storage Quota', `${database.storageQuotaMb ?? '—'} MB`]].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase text-app-muted">{label}</dt><dd className="mt-1 break-all text-sm">{String(value)}</dd></div>)}</dl><DatabaseBackups databaseId={database.id} databaseName={database.databaseName} workspacePublicId={database.workspacePublicId} /></div>;
}
