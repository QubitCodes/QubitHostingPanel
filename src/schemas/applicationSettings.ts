import { z } from 'zod';

const optionalCommand = z.string().trim().max(500).refine((value) => !/[\r\n\0]/.test(value), 'Commands must be a single line.').nullable();
const optionalExpiry = z.iso.datetime().nullable();

/** Customer-editable application policy. Custom page bodies are intentionally deferred. */
export const updateApplicationSettingsSchema = z.object({
	comingSoonEnabled: z.boolean(),
	comingSoonExpiresAt: optionalExpiry,
	maintenanceDuringDeployment: z.boolean(),
	maintenanceEnabled: z.boolean(),
	maintenanceExpiresAt: optionalExpiry,
	migrateOnDeploy: z.boolean(),
	migrationCommand: optionalCommand,
	migrationTimeoutSeconds: z.number().int().min(30).max(3600),
	publicErrorMode: z.enum(['generic', 'message', 'detailed']),
	returnErrors: z.boolean(),
	runSeederOnDeploy: z.boolean(),
	seederCommand: optionalCommand,
	seederTimeoutSeconds: z.number().int().min(30).max(3600),
	uploadAllowedExtensions: z.array(z.string().trim().toLowerCase().regex(/^\.?[a-z0-9][a-z0-9.+_-]{0,30}$/)).max(100),
	uploadAllowedMimeTypes: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+*-]*$/)).max(100),
	uploadMaxFileSizeMb: z.number().int().min(1).max(10240),
	uploadMaxRequestSizeMb: z.number().int().min(1).max(20480),
	uploadTimeoutSeconds: z.number().int().min(30).max(3600),
}).strict().superRefine((input, context) => {
	if (input.uploadMaxRequestSizeMb < input.uploadMaxFileSizeMb)
		context.addIssue({ code: 'custom', message: 'Request size must be at least the individual file size.', path: ['uploadMaxRequestSizeMb'] });
	if (input.migrateOnDeploy && !input.migrationCommand)
		context.addIssue({ code: 'custom', message: 'Choose a migration command or disable migration on deploy.', path: ['migrationCommand'] });
	if (input.runSeederOnDeploy && !input.seederCommand)
		context.addIssue({ code: 'custom', message: 'Choose a seeder command or disable seeding on deploy.', path: ['seederCommand'] });
});

export type UpdateApplicationSettingsRequest = z.infer<typeof updateApplicationSettingsSchema>;
