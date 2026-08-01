import { resp } from '@qubitcodes/qcresp';
import UAParser from 'ua-parser-js';
import type { z } from 'zod';

export interface SessionClientMetadata {
	browserName?: string;
	browserVersion?: string;
	city?: string;
	clientHints: Record<string, string>;
	country?: string;
	countryCode?: string;
	deviceIdentifier?: string;
	deviceModel?: string;
	deviceType?: string;
	deviceVendor?: string;
	latitude?: string;
	location?: string;
	longitude?: string;
	networkAsn?: string;
	networkName?: string;
	osName?: string;
	osVersion?: string;
	region?: string;
	timezone?: string;
}

export interface RequestMetadata {
	ipAddress?: string;
	sessionClient: SessionClientMetadata;
	userAgent?: string;
}

/** Extracts bounded request metadata without trusting it for authorization. */
export function getRequestMetadata(request: Request): RequestMetadata {
	const header = (name: string, maximum = 160) => request.headers.get(name)?.trim().slice(0, maximum) || undefined;
	const userAgent = header('user-agent', 500);
	const parsed = new UAParser(userAgent).getResult();
	const ipAddress = header('cf-connecting-ip', 64) ?? header('x-real-ip', 64) ?? header('x-forwarded-for', 256)?.split(',')[0]?.trim().slice(0, 64);
	const city = header('x-vercel-ip-city', 120) ?? header('cf-ipcity', 120);
	const region = header('x-vercel-ip-country-region', 120) ?? header('cf-region', 120);
	const countryCode = header('x-vercel-ip-country', 8) ?? header('cf-ipcountry', 8);
	const clientHints = Object.fromEntries([
		['sec-ch-ua', header('sec-ch-ua', 500)],
		['sec-ch-ua-mobile', header('sec-ch-ua-mobile', 20)],
		['sec-ch-ua-platform', header('sec-ch-ua-platform', 80)],
		['sec-ch-ua-platform-version', header('sec-ch-ua-platform-version', 80)],
		['sec-ch-ua-model', header('sec-ch-ua-model', 120)]
	].filter((entry): entry is [string, string] => Boolean(entry[1])));
	return {
		...(ipAddress ? { ipAddress } : {}),
		...(userAgent ? { userAgent } : {}),
		sessionClient: {
			browserName: parsed.browser.name,
			browserVersion: parsed.browser.version,
			city,
			clientHints,
			country: header('x-vercel-ip-country-name', 120) ?? header('cf-country-name', 120),
			countryCode,
			deviceIdentifier: header('x-device-id', 255),
			deviceModel: parsed.device.model ?? clientHints['sec-ch-ua-model'],
			deviceType: parsed.device.type ?? (clientHints['sec-ch-ua-mobile'] === '?1' ? 'mobile' : 'desktop'),
			deviceVendor: parsed.device.vendor,
			latitude: header('x-vercel-ip-latitude', 32),
			location: [city, region, countryCode].filter(Boolean).join(', ') || undefined,
			longitude: header('x-vercel-ip-longitude', 32),
			networkAsn: header('x-network-asn', 32),
			networkName: header('x-network-name', 160),
			osName: parsed.os.name,
			osVersion: parsed.os.version,
			region,
			timezone: header('x-vercel-ip-timezone', 80) ?? header('cf-timezone', 80)
		}
	};
}

/** Parses a strict JSON request and returns a standardized validation failure. */
export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
		return resp.failure('Content-Type must be application/json.', resp.codes.UNSUPPORTED_MEDIA_TYPE, undefined, null, undefined, 415);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return resp.failure('Request body must contain valid JSON.', resp.codes.INVALID_FORMAT, undefined, null, undefined, 400);
	}

	const result = schema.safeParse(body);
	if (!result.success) {
		return resp.failure('Validation failed.', resp.codes.VALIDATION_ERROR, result.error.issues, null, undefined, 400);
	}
	return result.data;
}
