import { z } from 'zod';

export const dnsProviderCodeSchema = z.enum(['cloudflare', 'godaddy', 'hostinger']);
export const saveDnsProviderSchema = z.object({
	accountIdentifier: z.string().trim().max(255).nullable().optional(),
	token: z.string().trim().min(8).max(4096).optional(),
}).strict();
export type DnsProviderCode = z.infer<typeof dnsProviderCodeSchema>;
export type SaveDnsProviderInput = z.infer<typeof saveDnsProviderSchema>;
