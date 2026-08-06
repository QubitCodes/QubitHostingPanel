import { resp } from '@qubitcodes/qcresp';

import { CoolifyWebhookController } from '@controllers/CoolifyWebhookController';
import { coolifyWebhookSchema } from '@schemas/coolifyWebhook';

/** Receives outbound deployment notifications from Coolify. */
export async function action({
	request,
}: {
	request: Request;
}): Promise<Response> {
	const input = coolifyWebhookSchema.safeParse(
		await request.json().catch(() => null),
	);
	return input.success
		? CoolifyWebhookController.receive(new URL(request.url), input.data)
		: resp.failure(
				'Invalid webhook payload.',
				resp.codes.VALIDATION_ERROR,
				input.error.issues,
				null,
				undefined,
				400,
			);
}
