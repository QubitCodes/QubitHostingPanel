import { CheckCircle2, ExternalLink, Eye, Globe2, LoaderCircle, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { toast } from 'sonner';

import { DataTable, StickyActionsCell, StickyActionsHeader } from '@components/ui/data-table';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Domain {
	applicationId: string;
	applicationName: string;
	hostname: string;
	id: string;
	isEnabled: boolean;
	isPrimary: boolean;
	status: string;
	tlsCheckedAt?: string | null;
	tlsFailureReason?: string | null;
	tlsStatus: string;
	type: 'custom' | 'platform';
	verificationToken?: string | null;
}
interface ApiBody<T> { data?: T; message: string; status: boolean }

/** Send an authenticated domain request and unwrap the standard response. */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = await response.json() as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined) throw new Error(body.message);
	return body.data;
}

export default function CustomerDomainsPage() {
	const { active } = useOutletContext<{ active?: { publicId: number } }>();
	const activePublicId = active?.publicId;
	const [domains, setDomains] = useState<Domain[]>([]);
	const [loading, setLoading] = useState(true);
	const load = useCallback(async () => {
		if (!activePublicId) return;
		setLoading(true);
		try { setDomains(await api(`/api/v1/workspaces/${activePublicId}/domains`)); }
		catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load domains.'); }
		finally { setLoading(false); }
	}, [activePublicId]);
	useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);

	/** Apply an existing domain lifecycle action and refresh the workspace list. */
	async function action(domain: Domain, operation: 'refresh_tls' | 'set_primary' | 'toggle_platform' | 'verify'): Promise<void> {
		if (!activePublicId) return;
		const path = `/api/v1/workspaces/${activePublicId}/applications/${domain.applicationId}/domains/${domain.id}${operation === 'verify' ? '/verify' : ''}`;
		try {
			await api(path, { body: operation === 'verify' ? '{}' : JSON.stringify({ action: operation, ...(operation === 'toggle_platform' ? { enabled: !domain.isEnabled } : {}) }), headers: { 'content-type': 'application/json' }, method: 'POST' });
			toast.success(operation === 'verify' ? 'Domain ownership verified.' : 'Domain updated.');
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update domain.'); }
	}

	/** Remove a saved domain only after the server validates primary-domain safety. */
	async function remove(domain: Domain): Promise<void> {
		if (!activePublicId || !window.confirm(`Remove ${domain.hostname}?`)) return;
		try {
			await api(`/api/v1/workspaces/${activePublicId}/applications/${domain.applicationId}/domains/${domain.id}`, { method: 'DELETE' });
			toast.success('Domain removed.');
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to remove domain.'); }
	}

	return <main className="mx-auto max-w-7xl">
		<div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Workspace routing</p><h2 className="mt-2 text-4xl font-black">Domains</h2><p className="mt-3 text-app-muted">Review every connected hostname, application, DNS ownership, and SSL state.</p></div>
		{loading ? <LoaderCircle className="mt-8 size-6 animate-spin" /> : <div className="mt-7"><DataTable minimumWidth="78rem"><thead className="bg-app-canvas text-left text-xs font-bold uppercase text-app-muted"><tr><th className="px-5 py-3">Domain</th><th className="px-5 py-3">Application</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">DNS</th><th className="px-5 py-3">SSL</th><th className="px-5 py-3">Routing</th><th className="px-5 py-3">Verification</th><StickyActionsHeader /></tr></thead><tbody className="divide-y divide-brand-primary/10">{domains.map((domain) => <tr key={domain.id}><td className="px-5 py-4"><div className="flex items-center gap-2 font-bold"><Globe2 className="size-4 text-app-muted" />{domain.hostname}</div></td><td className="px-5 py-4"><Link className="font-semibold text-brand-primary hover:underline dark:text-brand-action" to={`/dashboard/applications/${domain.applicationId}`}>{domain.applicationName}</Link></td><td className="px-5 py-4 capitalize">{domain.type}</td><td className="px-5 py-4 capitalize"><span className={domain.status === 'verified' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{domain.status}</span></td><td className="px-5 py-4 capitalize">{domain.tlsStatus}{domain.tlsFailureReason && <span className="block max-w-52 truncate text-xs text-red-600" title={domain.tlsFailureReason}>{domain.tlsFailureReason}</span>}</td><td className="px-5 py-4">{domain.isPrimary ? 'Primary' : domain.isEnabled ? 'Enabled' : 'Disabled'}</td><td className="px-5 py-4">{domain.type === 'custom' && domain.status !== 'verified' ? <div className="max-w-72 text-xs"><p className="font-mono">_qubit-verification.{domain.hostname}</p><p className="mt-1 truncate font-mono" title={domain.verificationToken ?? ''}>{domain.verificationToken}</p></div> : '—'}</td><StickyActionsCell><Link aria-label={`View ${domain.applicationName}`} className="rounded-lg p-2 hover:bg-brand-primary/5" to={`/dashboard/applications/${domain.applicationId}/domains`}><Eye className="size-4" /></Link>{domain.type === 'custom' && domain.status !== 'verified' && <button aria-label={`Verify ${domain.hostname}`} className="rounded-lg p-2 hover:bg-brand-primary/5" onClick={() => void action(domain, 'verify')} type="button"><CheckCircle2 className="size-4" /></button>}{domain.status === 'verified' && domain.isEnabled && <button aria-label={`Check SSL for ${domain.hostname}`} className="rounded-lg p-2 hover:bg-brand-primary/5" onClick={() => void action(domain, 'refresh_tls')} type="button"><ShieldCheck className="size-4" /></button>}{domain.status === 'verified' && domain.isEnabled && !domain.isPrimary && <button aria-label={`Make ${domain.hostname} primary`} className="rounded-lg p-2 hover:bg-brand-primary/5" onClick={() => void action(domain, 'set_primary')} type="button"><RefreshCw className="size-4" /></button>}{domain.type === 'platform' && <button aria-label={`${domain.isEnabled ? 'Disable' : 'Enable'} ${domain.hostname}`} className="rounded-lg px-2 py-1 text-xs font-bold hover:bg-brand-primary/5" onClick={() => void action(domain, 'toggle_platform')} type="button">{domain.isEnabled ? 'Off' : 'On'}</button>}<a aria-label={`Open ${domain.hostname}`} className="rounded-lg p-2 hover:bg-brand-primary/5" href={`https://${domain.hostname}`} rel="noreferrer" target="_blank"><ExternalLink className="size-4" /></a><button aria-label={`Remove ${domain.hostname}`} className="rounded-lg p-2 text-red-600 hover:bg-red-500/10" onClick={() => void remove(domain)} type="button"><Trash2 className="size-4" /></button></StickyActionsCell></tr>)}{!domains.length && <tr><td className="px-5 py-10 text-center text-app-muted" colSpan={8}>No application domains yet.</td></tr>}</tbody></DataTable></div>}
	</main>;
}
