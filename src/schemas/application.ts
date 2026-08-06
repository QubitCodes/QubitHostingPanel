import { z } from 'zod';

const command = z.string().trim().max(500).optional();
const hostname = z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
export const applicationPublicIdSchema = z.uuid();
export const createApplicationSchema = z.object({
	name: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/),
	runtimeCode: z.string().trim().min(2).max(80),
	repository: z.url({ protocol: /^https$/ }).refine((value) => ['github.com', 'gitlab.com', 'bitbucket.org'].includes(new URL(value).hostname), 'Repository host is unsupported.'),
	githubConnectionId: z.uuid().optional(),
	branch: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/).default('main'),
	buildPack: z.enum(['nixpacks', 'static']).default('nixpacks'),
	deploymentEnvironment: z.enum(['development', 'testing', 'staging', 'production']).default('production'),
	framework: z.string().trim().toLowerCase().max(80).nullable().optional(),
	environmentVariables: z.array(z.object({ key: z.string().trim().toUpperCase().regex(/^[A-Z_][A-Z0-9_]*$/).max(120), value: z.string().max(16384), isSecret: z.boolean().default(true), scope: z.enum(['runtime', 'build', 'both']).default('runtime') })).max(200).default([]),
	installCommand: command,
	buildCommand: command,
	startCommand: command,
	baseDirectory: z.string().trim().min(1).max(500).regex(/^(?:\/|[a-zA-Z0-9_.-][a-zA-Z0-9_./-]*)$/).refine((value) => !value.split('/').includes('..'), 'Parent-directory traversal is not allowed.').default('/'),
	publishDirectory: z.string().trim().max(500).optional(),
	port: z.number().int().min(1).max(65535),
	domain: hostname.optional(),
	domains: z.array(hostname).max(20).default([]),
	subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/).optional(),
	subdomainSuffix: z.string().trim().toLowerCase().regex(/^[a-z0-9]{6}$/).optional(),
	databases: z.array(z.object({ databaseId: z.uuid(), environmentPrefix: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/) })).max(5).default([]),
});
export type CreateApplicationRequest = z.infer<typeof createApplicationSchema>;
export const updateApplicationSchema = z.object({
	branch: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/),
	installCommand: command,
	buildCommand: command,
	startCommand: command,
	baseDirectory: z.string().trim().min(1).max(500).regex(/^\/(?!.*\.\.)/),
	publishDirectory: z.string().trim().max(500).optional(),
	port: z.number().int().min(1).max(65535),
}).strict();
export type UpdateApplicationRequest = z.infer<typeof updateApplicationSchema>;
export const analyzeApplicationSourceSchema = z.object({ repository: z.url({ protocol: /^https$/ }).refine((value) => new URL(value).hostname === 'github.com', 'Automatic source analysis currently supports GitHub repositories.'), branch: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9._/-]+$/).default('main'), githubConnectionId: z.uuid().optional() }).strict();
export type AnalyzeApplicationSourceRequest = z.infer<typeof analyzeApplicationSourceSchema>;
export const createApplicationDomainSchema = z.object({ hostname }).strict();
export const checkApplicationDomainSchema = z.object({ hostname, purpose: z.enum(['attach', 'ownership']).default('attach') }).strict();
export const registerDomainOwnershipSchema = z.object({ hostname }).strict();
export const domainAccessActionSchema = z.object({ action: z.enum(['approve', 'reject', 'revoke']) }).strict();
export const updateApplicationDomainSchema = z.object({ action: z.enum(['set_primary', 'toggle_platform', 'refresh_tls']), enabled: z.boolean().optional() }).strict();
export type CreateApplicationDomainRequest = z.infer<typeof createApplicationDomainSchema>;
export type RegisterDomainOwnershipRequest = z.infer<typeof registerDomainOwnershipSchema>;
export type UpdateApplicationDomainRequest = z.infer<typeof updateApplicationDomainSchema>;
