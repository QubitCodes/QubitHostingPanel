import { z } from 'zod';

/** Supported outbound Coolify notification events. */
export const coolifyWebhookSchema = z
	.object({
		application_uuid: z.string().trim().min(1).optional(),
		deployment_uuid: z.string().trim().min(1).optional(),
		event: z.enum([
			'deployment_success',
			'deployment_failed',
			'status_changed',
			'test',
		]),
		message: z.string().trim().max(2_000),
		success: z.boolean(),
	})
	.passthrough()
	.superRefine((input, context) => {
		if (input.event !== 'test' && !input.application_uuid)
			context.addIssue({
				code: 'custom',
				message: 'Application UUID is required.',
				path: ['application_uuid'],
			});
	});

export type CoolifyWebhookRequest = z.infer<typeof coolifyWebhookSchema>;
