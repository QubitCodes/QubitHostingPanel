import { ProviderConnections } from '@root/app/components/admin/ProviderConnections';

export default function OperationsProvidersPage() {
	return <main className="mx-auto max-w-7xl"><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Commerce & infrastructure</p><h2 className="mt-2 text-4xl font-black">Provider connections</h2><p className="mt-3 text-app-muted">Encrypted Coolify credentials, validation, token rotation, and ownership-safe inventory reconciliation.</p><ProviderConnections /></main>;
}
