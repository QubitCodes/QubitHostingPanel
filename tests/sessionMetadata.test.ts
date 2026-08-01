import { describe, expect, it } from 'vitest';

import { sessionIdSchema, updateSessionLabelSchema } from '@schemas/auth';
import { getRequestMetadata } from '@utils/request';

describe('session metadata', () => {
	it('parses browser, OS, device, proxy location, and client hints', () => {
		const request = new Request('https://panel.example.test', { headers: {
			'cf-connecting-ip': '203.0.113.10',
			'cf-ipcountry': 'IN',
			'sec-ch-ua-mobile': '?1',
			'sec-ch-ua-model': 'Pixel 9',
			'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
			'x-vercel-ip-city': 'Kochi',
			'x-vercel-ip-country-region': 'KL',
			'x-vercel-ip-timezone': 'Asia/Kolkata'
		} });
		const metadata = getRequestMetadata(request);
		expect(metadata.ipAddress).toBe('203.0.113.10');
		expect(metadata.sessionClient.browserName).toBe('Chrome');
		expect(metadata.sessionClient.osName).toBe('Android');
		expect(metadata.sessionClient.deviceType).toBe('mobile');
		expect(metadata.sessionClient.deviceModel).toBe('Pixel 9');
		expect(metadata.sessionClient.location).toBe('Kochi, KL, IN');
		expect(metadata.sessionClient.timezone).toBe('Asia/Kolkata');
	});

	it('validates device labels and session identifiers strictly', () => {
		expect(updateSessionLabelSchema.safeParse({ label: 'Work laptop' }).success).toBe(true);
		expect(updateSessionLabelSchema.safeParse({ label: '' }).success).toBe(false);
		expect(updateSessionLabelSchema.safeParse({ label: 'x'.repeat(101) }).success).toBe(false);
		expect(sessionIdSchema.safeParse(crypto.randomUUID()).success).toBe(true);
		expect(sessionIdSchema.safeParse('not-a-session').success).toBe(false);
	});
});

