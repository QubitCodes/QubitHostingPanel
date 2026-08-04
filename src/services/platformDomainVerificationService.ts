import { resolve4, resolve6 } from 'node:dns/promises';

async function resolves(hostname: string): Promise<boolean> {
	const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
	return results.some((result) => result.status === 'fulfilled' && result.value.length > 0);
}

/** Verifies DNS and HTTPS reachability without claiming certificate ownership from configuration alone. */
export async function verifyPlatformHostname(target: 'applications' | 'panel', value: string): Promise<{ hostname: string; httpsReachable: boolean }> {
	const hostname = target === 'panel' ? new URL(value).hostname : `qubit-domain-check.${value}`;
	if (!await resolves(hostname)) throw new Error(`DNS does not currently resolve ${hostname}.`);
	let httpsReachable = false;
	try { const response = await fetch(`https://${hostname}`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8_000) }); httpsReachable = response.status > 0; } catch { httpsReachable = false; }
	if (!httpsReachable) throw new Error(`HTTPS is not ready for ${hostname}.`);
	return { hostname, httpsReachable };
}
