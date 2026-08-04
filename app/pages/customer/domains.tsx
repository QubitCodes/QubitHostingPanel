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
interface Ownership { hostname: string; id: string; status: string; verificationMethod: string; verifiedAt?: string | null }
interface IncomingRequest { createdAt: string; hostname: string; id: string; requestingWorkspaceId: number; requestingWorkspaceName: string; status: string }
interface OutgoingRequest { applicationId: string; createdAt: string; hostname: string; id: string; ownerHostname: string; status: string }
interface OwnershipData { canApprove: boolean; incoming: IncomingRequest[]; outgoing: OutgoingRequest[]; ownerships: Ownership[] }

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
	const [ownership, setOwnership] = useState<OwnershipData>({ canApprove: false, incoming: [], outgoing: [], ownerships: [] });
	const load = useCallback(async () => {
		if (!activePublicId) return;
		setLoading(true);
		try { const [domainRows, ownershipData] = await Promise.all([api<Domain[]>(`/api/v1/workspaces/${activePublicId}/domains`), api<OwnershipData>(`/api/v1/workspaces/${activePublicId}/domain-ownership`)]); setDomains(domainRows); setOwnership(ownershipData); }
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

	/** Respond to an incoming protected-subdomain request as the owning workspace. */
	async function respond(requestId: string, operation: 'approve' | 'reject' | 'revoke'): Promise<void> {
		if (!activePublicId) return;
		try {
			await api(`/api/v1/workspaces/${activePublicId}/domain-access/${requestId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: operation }) });
			toast.success(`Domain access ${operation === 'approve' ? 'approved' : operation === 'reject' ? 'rejected' : 'revoked'}.`);
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to respond to domain access.'); }
	}

	return <main className="mx-auto max-w-7xl">
		<div><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Workspace routing</p><h2 className="mt-2 text-4xl font-black">Domains</h2><p className="mt-3 text-app-muted">Review every connected hostname, application, DNS ownership, and SSL state.</p></div>
		{loading ? <LoaderCircle className="mt-8 size-6 animate-spin" /> : <div className="mt-7"><DataTable minimumWidth="78rem"><thead className="bg-app-canvas text-left text-xs font-bold uppercase text-app-muted"><tr><th className="px-5 py-3">Domain</th><th className="px-5 py-3">Application</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">DNS</th><th className="px-5 py-3">SSL</th><th className="px-5 py-3">Routing</th><th className="px-5 py-3">Verification</th><StickyActionsHeader /></tr></thead><tbody className="divide-y divide-brand-primary/10">{domains.map((domain) => <tr key={domain.id}><td className="px-5 py-4"><div className="flex items-center gap-2 font-bold"><Globe2 className="size-4 text-app-muted" />{domain.hostname}</div></td><td className="px-5 py-4"><Link className="font-semibold text-brand-primary hover:underline dark:text-brand-action" to={`/dashboard/applications/${domain.applicationId}`}>{domain.applicationName}</Link></td><td className="px-5 py-4 capitalize">{domain.type}</td><td className="px-5 py-4 capitalize"><span className={domain.status === 'verified' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{domain.status}</span></td><td className="px-5 py-4 capitalize">{domain.tlsStatus}{domain.tlsFailureReason && <span className="block max-w-52 truncate text-xs text-red-600" title={domain.tlsFailureReason}>{domain.tlsFailureReason}</span>}</td><td className="px-5 py-4">{domain.isPrimary ? 'Primary' : domain.isEnabled ? 'Enabled' : 'Disabled'}</td><td className="px-5 py-4">{domain.type === 'custom' && domain.status !== 'verified' ? <div className="max-w-72 text-xs"><p className="font-mono">_qubit-verification.{domain.hostname}</p><p className="mt-1 truncate font-mono" title={domain.verificationToken ?? ''}>{domain.verificationToken}</p></div> : '—'}</td><StickyActionsCell><Link aria-label={`View ${domain.applicationName}`} className="rounded-lg p-2 hover:bg-brand-primary/5" to={`/dashboard/applications/${domain.applicationId}/domains`}><Eye className="size-4" /></Link>{domain.type === 'custom' && domain.status !== 'verified' && <button aria-label={`Verify ${domain.hostname}`} className="rounded-lg p-2 hover:bg-brand-primary/5" onClick={() => void action(domain, 'verify')} type="button"><CheckCircle2 className="size-4" /></button>}{domain.status === 'verified' && domain.isEnabled && <button aria-label={`Check SSL for ${domain.hostname}`} className="rounded-lg p-2 hover:bg-brand-primary/5" onClick={() => void action(domain, 'refresh_tls')} type="button"><ShieldCheck className="size-4" /></button>}{domain.status === 'verified' && domain.isEnabled && !domain.isPrimary && <button aria-label={`Make ${domain.hostname} primary`} className="rounded-lg p-2 hover:bg-brand-primary/5" onClick={() => void action(domain, 'set_primary')} type="button"><RefreshCw className="size-4" /></button>}{domain.type === 'platform' && <button aria-label={`${domain.isEnabled ? 'Disable' : 'Enable'} ${domain.hostname}`} className="rounded-lg px-2 py-1 text-xs font-bold hover:bg-brand-primary/5" onClick={() => void action(domain, 'toggle_platform')} type="button">{domain.isEnabled ? 'Off' : 'On'}</button>}<a aria-label={`Open ${domain.hostname}`} className="rounded-lg p-2 hover:bg-brand-primary/5" href={`https://${domain.hostname}`} rel="noreferrer" target="_blank"><ExternalLink className="size-4" /></a><button aria-label={`Remove ${domain.hostname}`} className="rounded-lg p-2 text-red-600 hover:bg-red-500/10" onClick={() => void remove(domain)} type="button"><Trash2 className="size-4" /></button></StickyActionsCell></tr>)}{!domains.length && <tr><td className="px-5 py-10 text-center text-app-muted" colSpan={8}>No application domains yet.</td></tr>}</tbody></DataTable></div>}
		{!loading && <section className="mt-8 grid gap-6 xl:grid-cols-2"><article className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6"><h3 className="text-xl font-black">Owned domain scopes</h3><p className="mt-1 text-sm text-app-muted">Verified scopes protect the hostname and its descendant subdomains.</p><div className="mt-5 grid gap-3">{ownership.ownerships.map((item) => <div className="rounded-2xl border border-brand-primary/10 p-4" key={item.id}><div className="flex items-center justify-between gap-3"><span className="font-bold">{item.hostname}</span><span className="text-xs font-bold capitalize text-app-muted">{item.status}</span></div><p className="mt-1 text-xs text-app-muted">{item.verificationMethod === 'dns_txt' ? 'DNS TXT verified' : 'Platform verification bypass'}</p></div>)}{!ownership.ownerships.length && <p className="text-sm text-app-muted">No ownership claims yet.</p>}</div></article><article className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6"><h3 className="text-xl font-black">Incoming access requests</h3><p className="mt-1 text-sm text-app-muted">Only the workspace owner can approve or revoke protected subdomains.</p><div className="mt-5 grid gap-3">{ownership.incoming.map((item) => <div className="rounded-2xl border border-brand-primary/10 p-4" key={item.id}><p className="font-bold">{item.hostname}</p><p className="mt-1 text-sm text-app-muted">{item.requestingWorkspaceName} · workspace {item.requestingWorkspaceId} · <span className="capitalize">{item.status}</span></p>{ownership.canApprove && <div className="mt-3 flex gap-2">{item.status === 'pending' && <><button className="rounded-xl bg-brand-action px-3 py-2 text-sm font-bold text-brand-ink" onClick={() => void respond(item.id, 'approve')} type="button">Approve</button><button className="rounded-xl border border-red-500/30 px-3 py-2 text-sm font-bold text-red-600" onClick={() => void respond(item.id, 'reject')} type="button">Reject</button></>}{item.status === 'approved' && <button className="rounded-xl border border-red-500/30 px-3 py-2 text-sm font-bold text-red-600" onClick={() => void respond(item.id, 'revoke')} type="button">Revoke</button>}</div>}</div>)}{!ownership.incoming.length && <p className="text-sm text-app-muted">No incoming requests.</p>}</div></article><article className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6 xl:col-span-2"><h3 className="text-xl font-black">Requests sent</h3><div className="mt-5 grid gap-3 md:grid-cols-2">{ownership.outgoing.map((item) => <div className="rounded-2xl border border-brand-primary/10 p-4" key={item.id}><p className="font-bold">{item.hostname}</p><p className="mt-1 text-sm text-app-muted">Protected by {item.ownerHostname} · <span className="capitalize">{item.status}</span></p></div>)}{!ownership.outgoing.length && <p className="text-sm text-app-muted">No outgoing requests.</p>}</div></article></section>}
	</main>;
}
