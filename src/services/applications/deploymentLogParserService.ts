export interface DeploymentLogSections {
	build: string;
	deployment: string;
	raw: string;
}

const BUILD_START = /(?:Importing .+ to \/(?:artifacts|build\/workspace)|Cloning into|Generating nixpacks configuration|Preparing application build configuration|Building docker image started|^#\d+\s)/i;
const DEPLOYMENT_RESUME = /(?:Deployment failed\. Removing|Rolling update|Starting (?:the )?new container|Removing (?:the )?old container|Waiting for health|Health ?check|Container .+ (?:started|healthy)|Deployment (?:completed|successful)|Gracefully shutting down build container)/i;

/** Splits a provider deployment stream into customer-build and platform-deployment channels. */
export function parseDeploymentLogs(logs?: string | null): DeploymentLogSections {
	const raw = logs?.trim() ?? '';
	if (!raw) return { build: '', deployment: '', raw: '' };
	const build: string[] = [];
	const deployment: string[] = [];
	let phase: 'build' | 'deployment' = 'deployment';
	for (const line of raw.split(/\r?\n/)) {
		if (BUILD_START.test(line)) phase = 'build';
		if (DEPLOYMENT_RESUME.test(line)) phase = 'deployment';
		(phase === 'build' ? build : deployment).push(line);
	}
	return {
		build: build.join('\n').trim(),
		deployment: deployment.join('\n').trim(),
		raw,
	};
}
