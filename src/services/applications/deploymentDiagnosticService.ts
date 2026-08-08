export interface DeploymentDiagnostic {
	code: string;
	detail?: string;
	developerActionRequired: boolean;
	explanation: string;
	location?: string;
	owner: 'configuration' | 'platform' | 'project' | 'runtime' | 'unknown';
	phase: 'build' | 'deployment' | 'runtime';
	suggestion: string;
	title: string;
}

interface DiagnosticRule {
	code: string;
	developerActionRequired: boolean;
	explanation: string;
	owner: DeploymentDiagnostic['owner'];
	pattern: RegExp;
	phase: DeploymentDiagnostic['phase'];
	suggestion: string;
	title: string;
}

const DIAGNOSTIC_RULES: DiagnosticRule[] = [
	{
		code: 'invalid-source-encoding',
		developerActionRequired: false,
		explanation: 'A source file uses a character encoding that the automatic builder cannot read as UTF-8.',
		owner: 'platform',
		pattern: /Error reading\s+[^\r\n]+[\s\S]{0,500}stream did not contain valid UTF-8/i,
		phase: 'build',
		suggestion: 'Enable the beta character-set compatibility fix for this workspace and redeploy. Ghost Deploy changes only the disposable build copy.',
		title: 'Source encoding compatibility issue',
	},
	{
		code: 'npm-lock-out-of-sync',
		developerActionRequired: false,
		owner: 'project',
		phase: 'build',
		explanation:
			'The npm lockfile does not fully match package.json, so a frozen clean install cannot run.',
		pattern:
			/npm ci[\s\S]{0,2000}(?:can only install packages|package-lock\.json)[\s\S]{0,1000}(?:not in sync|missing:|invalid:)/i,
		suggestion:
			'Ghost Deploy can retry with npm install. Commit the repaired package-lock.json afterward for reproducible builds.',
		title: 'Dependency lockfile needs repair',
	},
	{
		code: 'typescript-check-failed',
		developerActionRequired: true,
		explanation:
			'Your project did not pass TypeScript validation, so Ghost Deploy stopped before deployment.',
		owner: 'project',
		pattern: /(?:failed to type check|type error:)[\s\S]{0,3000}/i,
		phase: 'build',
		suggestion:
			'Fix the first reported file and line in the repository, run the project typecheck/build locally, then redeploy.',
		title: 'Project build failed',
	},
	{
		code: 'missing-build-environment',
		developerActionRequired: false,
		owner: 'configuration',
		phase: 'build',
		explanation:
			'The application validates a required environment variable while its production bundle is being built.',
		pattern:
			/(?:environment variable|env var|configuration).{0,120}(?:required|missing|not set|undefined)[\s\S]{0,1200}(?:build|compile)|(?:build|compile)[\s\S]{0,1200}(?:environment variable|env var).{0,120}(?:required|missing|not set|undefined)/i,
		suggestion:
			'Add the named value with Build and runtime scope, then redeploy. Keep secrets masked and never commit the real .env file.',
		title: 'Build-time environment value is missing',
	},
	{
		code: 'unsupported-runtime-version',
		developerActionRequired: false,
		owner: 'configuration',
		phase: 'build',
		explanation:
			'The selected language or package version is unavailable in the current builder image.',
		pattern:
			/(?:unsupported|could not find|cannot resolve|no matching version).{0,180}(?:node|nodejs|php|python|ruby|package)/i,
		suggestion: 'Select a platform-approved runtime version and deploy again.',
		title: 'Runtime version is unavailable',
	},
	{
		code: 'dependency-install-failed',
		developerActionRequired: true,
		owner: 'project',
		phase: 'build',
		explanation:
			'The dependency manager could not produce a complete install from the repository manifest.',
		pattern:
			/(?:npm ERR!|ERR_PNPM|yarn error|composer install.{0,120}failed|Could not find a version that satisfies|Bundler could not find compatible versions)/i,
		suggestion:
			'Open the raw output below, fix the first dependency or lockfile error locally, commit the corrected manifest and lockfile, then redeploy.',
		title: 'Dependency installation failed',
	},
	{
		code: 'missing-environment-file',
		developerActionRequired: false,
		owner: 'configuration',
		phase: 'runtime',
		explanation:
			'The start command requires a physical .env file, but the platform supplies runtime values directly to the container.',
		pattern: /ENOENT[\s\S]{0,300}(?:\.env|env file)/i,
		suggestion:
			'Ghost Deploy can create an empty .env before startup while continuing to inject configured values securely.',
		title: 'Start command requires an env file',
	},
	{
		code: 'memory-limit',
		developerActionRequired: false,
		owner: 'platform',
		phase: 'build',
		explanation:
			'The build or application process exceeded its memory allowance.',
		pattern: /(?:out of memory|oomkilled|exit code 137|signal: killed)/i,
		suggestion:
			'Reduce build memory use or choose a package with a higher build-memory allowance.',
		title: 'Memory limit exceeded',
	},
	{
		code: 'port-not-listening',
		developerActionRequired: false,
		owner: 'runtime',
		phase: 'runtime',
		explanation:
			'The process started but did not accept traffic on the platform-assigned interface and port.',
		pattern:
			/(?:no port|port.+not listening|connection refused|health check.+failed)/i,
		suggestion:
			'Listen on 0.0.0.0 and use the PORT environment variable supplied by Ghost Deploy.',
		title: 'Application did not become reachable',
	},
	{
		code: 'database-connection',
		developerActionRequired: false,
		owner: 'configuration',
		phase: 'runtime',
		explanation:
			'The application started but could not authenticate with or reach its configured database.',
		pattern:
			/(?:ECONNREFUSED|connection refused|authentication failed|access denied).{0,240}(?:postgres|mysql|database|5432|3306)|(?:postgres|mysql|database).{0,240}(?:ECONNREFUSED|connection refused|authentication failed|access denied)/i,
		suggestion:
			'Check the application database binding and expected variable names. Ghost Deploy credentials should not be copied manually.',
		title: 'Database connection failed',
	},
];

/** Converts raw provider output into a stable, user-facing failure explanation. */
export function diagnoseDeploymentLogs(
	logs?: string | null,
): DeploymentDiagnostic | null {
	if (!logs) return null;
	const rule = DIAGNOSTIC_RULES.find(({ pattern }) => pattern.test(logs));
	if (!rule) return null;
	const location = logs.match(
		/(?:^|\n)(?:#\d+\s+[\d.]+\s+)?\.\/?([^\r\n:]+\.(?:[cm]?[jt]sx?|php|py|rb|go)):(\d+):(\d+)/i,
	);
	const encodingLocation = logs.match(/Error reading\s+([^\r\n]+)/i);
	const detail = logs.match(
		/(?:Type error:|error TS\d+:|npm ERR!|ERR_PNPM|yarn error)\s*([^\r\n]+)/i,
	);
	return {
		code: rule.code,
		...(detail?.[1] ? { detail: detail[1].trim() } : {}),
		developerActionRequired: rule.developerActionRequired,
		explanation: rule.explanation,
		...(location
			? { location: `${location[1]}:${location[2]}:${location[3]}` }
			: encodingLocation?.[1]
				? { location: encodingLocation[1].trim() }
			: {}),
		owner: rule.owner,
		phase: rule.phase,
		suggestion: rule.suggestion,
		title: rule.title,
	};
}
