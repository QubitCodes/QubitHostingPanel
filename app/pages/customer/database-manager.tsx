import { useOutletContext, useParams } from 'react-router';

import { DatabaseAccessManager } from '@components/customer/DatabaseAccessManager';
import { DatabaseBackups } from '@components/customer/DatabaseBackups';
import { DatabaseDiagnostics } from '@components/customer/DatabaseDiagnostics';
import { DatabaseExplorer } from '@components/customer/DatabaseExplorer';
import { DatabaseLifecycleSettings } from '@components/customer/DatabaseLifecycleSettings';
import { DatabaseObjects } from '@components/customer/DatabaseObjects';
import { DatabaseQueryWorkspace } from '@components/customer/DatabaseQueryWorkspace';
import { DatabaseSchemaManager } from '@components/customer/DatabaseSchemaManager';
import { DatabaseTransfers } from '@components/customer/DatabaseTransfers';
import type { DatabaseManagerContext } from '@root/app/layouts/database';

/** URL-addressable content area for the standalone database manager. */
export default function DatabaseManagerPage() {
	const { database } = useOutletContext<{ database: DatabaseManagerContext }>();
	const { objectKind, schemaName, section } = useParams();
	const activeSection = objectKind ? 'objects' : schemaName ? 'tables' : (section ?? 'overview');
	const basePath = `/database/${database.id}`;
	if (activeSection === 'tables') return <DatabaseExplorer basePath={basePath} databaseId={database.id} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'objects') return <DatabaseObjects basePath={basePath} databaseId={database.id} databaseName={database.databaseName} engine={database.engine} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'schema') return <DatabaseSchemaManager databaseId={database.id} engine={database.engine} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'sql') return <DatabaseQueryWorkspace databaseId={database.id} databaseName={database.databaseName} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'transfers') return <DatabaseTransfers databaseId={database.id} databaseName={database.databaseName} engine={database.engine} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'access') return <DatabaseAccessManager databaseId={database.id} databaseName={database.databaseName} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'diagnostics') return <DatabaseDiagnostics databaseId={database.id} databaseName={database.databaseName} workspacePublicId={database.workspacePublicId} />;
	if (activeSection === 'settings') return <DatabaseLifecycleSettings database={database} />;
	return <div className="grid gap-6"><div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Database Manager</p><h1 className="mt-2 text-4xl font-black">{database.displayName}</h1><p className="mt-2 font-mono text-sm text-app-muted">{database.databaseName}</p></div><dl className="grid gap-4 rounded-2xl border border-brand-primary/10 bg-app-surface p-5 sm:grid-cols-2 lg:grid-cols-3">{[['Engine', `${database.engine} ${database.engineVersion}`], ['Status', database.status], ['Username', database.username], ['Connected Applications', database.connectedApplications.map(({ name }) => name).join(', ') || 'None'], ['Connection Limit', database.connectionLimit ?? '—'], ['Storage Quota', `${database.storageQuotaMb ?? '—'} MB`]].map(([label, value]) => <div key={label}><dt className="text-xs font-bold uppercase text-app-muted">{label}</dt><dd className="mt-1 break-all text-sm">{String(value)}</dd></div>)}</dl><DatabaseBackups databaseId={database.id} databaseName={database.databaseName} workspacePublicId={database.workspacePublicId} /></div>;
}
