import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface InventoryItem { estimatedRows?: number | null; kind: string; name: string; schema: string; tableName?: string | null }
interface ApiBody { data?: { objects: InventoryItem[] }; message: string; status: boolean }

/** Compact read-only database inventory used inside the customer dashboard. */
export function DatabaseInventoryList({ databaseId, kind, workspacePublicId }: { databaseId: string; kind: 'objects' | 'tables'; workspacePublicId: number }) {
	const [items, setItems] = useState<InventoryItem[]>([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		const controller = new AbortController();
		const endpoint = kind === 'tables' ? 'objects' : 'advanced';
		void authenticatedFetch(`/api/v1/workspaces/${workspacePublicId}/databases/${databaseId}/explorer/${endpoint}`, { signal: controller.signal })
			.then(async (response) => { const body = await response.json() as ApiBody; if (!response.ok || !body.status || !body.data) throw new Error(body.message); setItems(body.data.objects); })
			.catch((error: unknown) => { if (error instanceof DOMException && error.name === 'AbortError') return; toast.error(error instanceof Error ? error.message : 'Unable to load database inventory.'); })
			.finally(() => setLoading(false));
		return () => controller.abort();
	}, [databaseId, kind, workspacePublicId]);
	if (loading) return <div className="grid min-h-52 place-items-center"><LoaderCircle className="size-6 animate-spin" /></div>;
	return <section className="overflow-hidden rounded-2xl border border-brand-primary/10"><header className="bg-brand-primary/5 px-5 py-4"><h3 className="text-lg font-black">{kind === 'tables' ? 'Tables and Views' : 'Database Objects'}</h3><p className="text-sm text-app-muted">Read-only inventory. Open the database manager to inspect or modify data.</p></header><div className="max-h-[28rem] divide-y divide-brand-primary/10 overflow-y-auto">{items.map((item) => <div className="grid gap-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_8rem]" key={`${item.kind}:${item.schema}:${item.name}`}><strong className="truncate font-mono text-sm">{item.name}</strong><span className="truncate text-xs text-app-muted">{item.schema}</span><span className="text-xs capitalize text-app-muted">{item.kind.replaceAll('_', ' ')}</span></div>)}{!items.length && <p className="p-8 text-center text-sm text-app-muted">No {kind === 'tables' ? 'tables or views' : 'database objects'} found.</p>}</div></section>;
}
