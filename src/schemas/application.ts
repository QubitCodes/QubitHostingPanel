import { z } from 'zod';

const command = z.string().trim().max(500).optional();
export const applicationPublicIdSchema = z.uuid();
export const createApplicationSchema = z.object({
	name: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/),
	runtimeCode: z.string().trim().min(2).max(80),
	repository: z.url({ protocol: /^https$/ }).refine((value) => ['github.com', 'gitlab.com', 'bitbucket.org'].includes(new URL(value).hostname), 'Repository host is unsupported.'),
	branch: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/).default('main'),
	buildPack: z.enum(['nixpacks', 'static', 'dockerfile']).default('nixpacks'),
	installCommand: command,
	buildCommand: command,
	startCommand: command,
	baseDirectory: z.string().trim().min(1).max(500).regex(/^\/(?!.*\.\.)/).default('/'),
	publishDirectory: z.string().trim().max(500).optional(),
	port: z.number().int().min(1).max(65535),
	domain: z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).optional(),
	subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/).optional(),
	databases: z.array(z.object({ databaseId: z.uuid(), environmentPrefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/) })).max(5).default([]),
});
export type CreateApplicationRequest = z.infer<typeof createApplicationSchema>;
export const createApplicationDomainSchema = z.object({ hostname: z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/) }).strict();
export const updateApplicationDomainSchema = z.object({ action: z.enum(['set_primary', 'toggle_platform', 'refresh_tls']), enabled: z.boolean().optional() }).strict();
export type CreateApplicationDomainRequest = z.infer<typeof createApplicationDomainSchema>;
export type UpdateApplicationDomainRequest = z.infer<typeof updateApplicationDomainSchema>;
