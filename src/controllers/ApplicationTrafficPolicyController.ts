import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@db/client';
import {
	applicationBuilds,
	applicationDomains,
	applicationSettings,
	platformSettings,
} from '@db/schema';
import {
	defaultApplicationSitePolicy,
	effectiveApplicationSiteState,
} from '@services/applications/applicationSitePolicyService';
import {
	managedSystemPage,
	type ManagedSystemPageKind,
} from '@services/applications/systemPageService';

function requestHostname(request: Request): string | undefined {
	const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
	const raw = forwarded || request.headers.get('host') || '';
	const hostname = raw.replace(/^\[/, '').replace(/\](?::\d+)?$/, '').replace(/:\d+$/, '').toLowerCase();
	return /^(?=.{1,253}$)[a-z0-9.-]+$/.test(hostname) ? hostname : undefined;
}

function htmlResponse(
	kind: ManagedSystemPageKind,
	hostname: string,
	status: number,
	detail?: string,
): Response {
	return new Response(managedSystemPage({ detail, hostname, kind }), {
		headers: {
			'cache-control': 'no-store, max-age=0',
			'content-type': 'text/html; charset=utf-8',
			'retry-after': status === 503 ? '300' : '0',
			'x-ghostdeploy-policy': kind.replaceAll('_', '-'),
		},
		status,
	});
}

function mimeAllowed(contentType: string, allowed: string[]): boolean {
	return allowed.some((candidate) => {
		const normalized = candidate.toLowerCase();
		return normalized.endsWith('/*')
			? contentType.startsWith(normalized.slice(0, -1))
			: contentType === normalized;
	});
}

/** Traefik ForwardAuth decision endpoint for managed customer application traffic. */
export class ApplicationTrafficPolicyController {
	public static async evaluate(request: Request): Promise<Response> {
		try {
			return await ApplicationTrafficPolicyController.decide(request);
		} catch (error) {
			console.error(
				'Managed traffic policy evaluation failed open.',
				error instanceof Error ? error.message : 'Unknown policy error.',
			);
			return new Response(null, {
				headers: {
					'cache-control': 'no-store',
					'x-ghostdeploy-policy': 'bypass-error',
				},
				status: 204,
			});
		}
	}

	/** Evaluates one request; the public wrapper owns fail-open availability. */
	private static async decide(request: Request): Promise<Response> {
		const hostname = requestHostname(request);
		if (!hostname) return new Response(null, { status: 204 });
		const [platform] = await db
			.select({ enabled: platformSettings.managedTrafficPoliciesEnabled })
			.from(platformSettings)
			.where(and(eq(platformSettings.key, 'default'), isNull(platformSettings.deletedAt)))
			.limit(1);
		if (!platform?.enabled) return new Response(null, { status: 204 });

		const [record] = await db
			.select({ build: applicationBuilds, settings: applicationSettings })
			.from(applicationDomains)
			.innerJoin(
				applicationBuilds,
				and(
					eq(applicationBuilds.id, applicationDomains.applicationBuildId),
					isNull(applicationBuilds.deletedAt),
				),
			)
			.leftJoin(
				applicationSettings,
				and(
					eq(applicationSettings.applicationBuildId, applicationBuilds.id),
					isNull(applicationSettings.deletedAt),
				),
			)
			.where(
				and(
					eq(applicationDomains.hostname, hostname),
					eq(applicationDomains.isEnabled, true),
					isNull(applicationDomains.deletedAt),
				),
			)
			.limit(1);
		if (!record) return new Response(null, { status: 204 });
		if (record.build.operationalStatus === 'suspended')
			return htmlResponse('suspended', hostname, 503);

		const settings =
			record.settings ?? defaultApplicationSitePolicy(record.build.framework);
		const state = effectiveApplicationSiteState(settings);
		if (state.maintenanceActive)
			return htmlResponse('maintenance', hostname, 503);
		if (state.comingSoonActive)
			return htmlResponse('coming_soon', hostname, 503);

		const contentLength = Number(request.headers.get('content-length') ?? 0);
		if (
			Number.isFinite(contentLength) &&
			contentLength > settings.uploadMaxRequestSizeMb * 1024 * 1024
		)
			return htmlResponse(
				'request_rejected',
				hostname,
				413,
				`The request exceeds the ${settings.uploadMaxRequestSizeMb} MB application limit.`,
			);

		const forwardedMethod = request.headers.get('x-forwarded-method')?.toUpperCase();
		const method = forwardedMethod || request.method.toUpperCase();
		const contentType = request.headers
			.get('content-type')
			?.split(';')[0]
			?.trim()
			.toLowerCase();
		if (
			contentType &&
			!contentType.startsWith('multipart/form-data') &&
			['PATCH', 'POST', 'PUT'].includes(method) &&
			settings.uploadAllowedMimeTypes.length > 0 &&
			!mimeAllowed(contentType, settings.uploadAllowedMimeTypes)
		)
			return htmlResponse(
				'request_rejected',
				hostname,
				415,
				'This request content type is not allowed by the application policy.',
			);

		return new Response(null, {
			headers: {
				'cache-control': 'no-store',
				'x-ghostdeploy-policy': 'pass',
			},
			status: 204,
		});
	}
}
