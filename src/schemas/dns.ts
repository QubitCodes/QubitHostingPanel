import { z } from 'zod';

export const dnsRecordSchema = z.object({ name: z.string().trim().toLowerCase().min(1).max(255), type: z.enum(['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'NS', 'SRV', 'TXT']), content: z.string().trim().min(1).max(4096), ttl: z.number().int().min(60).max(86400).default(300), priority: z.number().int().min(0).max(65535).nullable().optional(), proxied: z.boolean().default(false) }).strict();
export const createDnsRecordSchema = dnsRecordSchema;
export const updateDnsRecordSchema = dnsRecordSchema.partial().strict();
export const importDnsSchema = z.object({ source: z.enum(['public_scan', 'zone_file', 'godaddy', 'hostinger']), zoneFile: z.string().max(262144).optional(), apiToken: z.string().min(8).max(4096).optional() }).strict().superRefine((value, context) => {
	if (value.source === 'zone_file' && !value.zoneFile) context.addIssue({ code: 'custom', message: 'Zone file content is required.', path: ['zoneFile'] });
	if ((value.source === 'godaddy' || value.source === 'hostinger') && !value.apiToken) context.addIssue({ code: 'custom', message: 'Provider API token is required.', path: ['apiToken'] });
});
export const dnsZoneActionSchema = z.object({ action: z.enum(['provision', 'refresh']) }).strict();
export type CreateDnsRecordInput = z.infer<typeof createDnsRecordSchema>;
export type ImportDnsInput = z.infer<typeof importDnsSchema>;
export type UpdateDnsRecordInput = z.infer<typeof updateDnsRecordSchema>;
