import { z } from 'zod';

const httpsBaseUrl = z.url().refine((value) => value.startsWith('https://'), 'HTTPS is required.').transform((value) => value.replace(/\/$/, ''));
const hostname = z.string().trim().toLowerCase().max(255).regex(/^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Enter a valid domain name.');

export const updatePlatformSettingsSchema = z.object({
	applicationBaseDomain: hostname,
	defaultApplicationSubdomainEnabled: z.boolean(),
	domainOwnershipVerificationEnabled: z.boolean(),
	panelBaseUrl: httpsBaseUrl.nullable(),
	panelDomainMode: z.enum(['same_domain', 'separate_domain']),
	publicBaseUrl: httpsBaseUrl,
}).strict().superRefine((input, context) => {
	if (input.panelDomainMode === 'separate_domain' && !input.panelBaseUrl) context.addIssue({ code: 'custom', message: 'A panel URL is required in separate-domain mode.', path: ['panelBaseUrl'] });
	if (input.panelBaseUrl === input.publicBaseUrl && input.panelDomainMode === 'separate_domain') context.addIssue({ code: 'custom', message: 'The separate panel URL must differ from the public URL.', path: ['panelBaseUrl'] });
});

export type UpdatePlatformSettingsInput = z.infer<typeof updatePlatformSettingsSchema>;
export const verifyPlatformDomainSchema = z.object({ target: z.enum(['panel', 'applications']) }).strict();
export type VerifyPlatformDomainInput = z.infer<typeof verifyPlatformDomainSchema>;
