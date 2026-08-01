import { createMsg91Client } from '@qubitcodes/msg91';

import { getEnvironment } from '@config/env';

export interface OtpDeliveryProvider {
	send(destination: string): Promise<{ code: string; providerReference?: string }>;
}

/** Server-only MSG91 WhatsApp delivery adapter. OTP verification remains application-owned. */
export class Msg91OtpProvider implements OtpDeliveryProvider {
	public async send(destination: string): Promise<{ code: string; providerReference?: string }> {
		const environment = getEnvironment();
		if (!environment.MSG91_AUTH_KEY || !environment.MSG91_WHATSAPP_NUMBER) {
			throw new Error('MSG91 WhatsApp credentials are not configured.');
		}
		const client = createMsg91Client({
			authKey: environment.MSG91_AUTH_KEY,
			configFile: false,
			whatsapp: { numbers: { support: environment.MSG91_WHATSAPP_NUMBER } }
		});
		const submission = await client.whatsapp.otp.send({
			from: 'support',
			to: destination.replace(/^\+/, ''),
			generate: {},
			language: environment.MSG91_OTP_TEMPLATE_LANGUAGE,
			templateName: environment.MSG91_OTP_TEMPLATE
		});
		const result = submission.results[0];
		if (!result) throw new Error('MSG91 did not return an OTP result.');
		let providerReference: string | undefined;
		if (typeof result.provider === 'object' && result.provider !== null) {
			const provider = result.provider as Record<string, unknown>;
			const reference = provider.request_id ?? provider.requestId ?? provider.message;
			providerReference = typeof reference === 'string' ? reference : undefined;
		}
		return { code: result.code, ...(providerReference ? { providerReference } : {}) };
	}
}
