import { z } from 'zod';

const dnsRecordObject = z
	.object({
		name: z.string().trim().toLowerCase().min(1).max(255),
		type: z.enum(['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'NS', 'SRV', 'TXT']),
		content: z.string().trim().min(1).max(4096),
		ttl: z.number().int().min(60).max(86400).default(300),
		priority: z.number().int().min(0).max(65535).nullable().optional(),
		proxied: z.boolean().default(false),
	})
	.strict();

function validateProxyCompatibility(
	value: { proxied?: boolean; type?: string },
	context: z.RefinementCtx,
): void {
	if (value.proxied && !['A', 'AAAA', 'CNAME'].includes(value.type ?? ''))
		context.addIssue({
			code: 'custom',
			message:
				'Traffic proxying is only available for A, AAAA, and CNAME records.',
			path: ['proxied'],
		});
}

export const dnsRecordSchema = dnsRecordObject.superRefine(
	validateProxyCompatibility,
);
export const createDnsRecordSchema = dnsRecordSchema;
export const updateDnsRecordSchema = dnsRecordObject
	.partial()
	.strict()
	.superRefine(validateProxyCompatibility);
export const importDnsSchema = z
	.object({
		source: z.enum(['public_scan', 'zone_file', 'godaddy', 'hostinger']),
		zoneFile: z.string().max(262144).optional(),
		apiToken: z.string().min(8).max(4096).optional(),
	})
	.strict()
	.superRefine((value, context) => {
		if (value.source === 'zone_file' && !value.zoneFile)
			context.addIssue({
				code: 'custom',
				message: 'Zone file content is required.',
				path: ['zoneFile'],
			});
	});
export const dnsZoneActionSchema = z
	.object({ action: z.enum(['provision', 'sync', 'refresh']) })
	.strict();
export type CreateDnsRecordInput = z.infer<typeof createDnsRecordSchema>;
export type ImportDnsInput = z.infer<typeof importDnsSchema>;
export type UpdateDnsRecordInput = z.infer<typeof updateDnsRecordSchema>;
