import { createMsg91Client, defineWhatsAppTemplate } from '@qubitcodes/msg91';

import { getEnvironment } from '@config/env';

export interface OtpDeliveryProvider {
	send(destination: string, otp: string): Promise<string | undefined>;
}

/** Server-only MSG91 WhatsApp delivery adapter. OTP verification remains application-owned. */
export class Msg91OtpProvider implements OtpDeliveryProvider {
	public async send(destination: string, otp: string): Promise<string | undefined> {
		const environment = getEnvironment();
		if (!environment.MSG91_AUTH_KEY || !environment.MSG91_WHATSAPP_NUMBER) {
			throw new Error('MSG91 WhatsApp credentials are not configured.');
		}
		const client = createMsg91Client({
			authKey: environment.MSG91_AUTH_KEY,
			configFile: false,
			whatsapp: { defaultNumber: environment.MSG91_WHATSAPP_NUMBER }
		});
		const template = defineWhatsAppTemplate({
			category: 'AUTHENTICATION',
			language: environment.MSG91_OTP_TEMPLATE_LANGUAGE,
			name: environment.MSG91_OTP_TEMPLATE
		});
		const result = await client.whatsapp.messages.sendDefinedTemplate({
			from: environment.MSG91_WHATSAPP_NUMBER,
			template,
			to: destination.replace(/^\+/, ''),
			values: { otp }
		});
		if (typeof result.provider === 'object' && result.provider !== null) {
			const provider = result.provider as Record<string, unknown>;
			const reference = provider.request_id ?? provider.requestId ?? provider.message;
			return typeof reference === 'string' ? reference : undefined;
		}
		return undefined;
	}
}

