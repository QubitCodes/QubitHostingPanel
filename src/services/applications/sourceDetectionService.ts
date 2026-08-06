import { frameworkDefinition, type RuntimeLanguage } from '@config/frameworkCatalog';

interface GitHubRepository {
  owner: string;
  repository: string;
}
interface GitHubTreeItem {
  path?: string;
  type?: string;
}
interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}
interface NpmLockManifest {
	packages?: Record<string, {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	}>;
}
interface ComposerManifest {
  require?: Record<string, string>;
  "require-dev"?: Record<string, string>;
}

export interface SourceCandidate {
	commands?: {
		build?: string;
		install?: string;
		start?: string;
	};
	framework?: string;
	packageManager?: string;
	projectDirectory: string;
  stack: RuntimeLanguage;
  versionHint?: string;
}
export interface SourceAnalysis {
  branches: string[];
  candidates: SourceCandidate[];
  environmentKeys: Array<{ isSecret: boolean; key: string; required: boolean }>;
  evidence: string[];
  outputDirectory?: string;
  repository: string;
}

const SECRET_KEY =
  /(?:secret|token|password|passwd|private|credential|api_key|auth|database_url|dsn)/i;

/** Parses a canonical GitHub HTTPS URL without accepting credentials or ambiguous paths. */
function githubRepository(value: string): GitHubRepository {
  const url = new URL(value);
  const parts = url.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  if (url.hostname !== "github.com" || parts.length !== 2)
    throw new Error("Enter a GitHub repository URL in owner/repository form.");
  return { owner: parts[0], repository: parts[1] };
}

async function githubJson<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "GhostDeploy",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "Repository or branch not found, or the repository is private."
        : `GitHub source inspection returned HTTP ${response.status}.`,
    );
  return response.json() as Promise<T>;
}

async function rawFile(
  repository: GitHubRepository,
  branch: string,
  path: string,
  token?: string,
): Promise<string | undefined> {
  const response = await fetch(
    `https://raw.githubusercontent.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(10_000),
    },
  );
  return response.ok ? response.text() : undefined;
}

function projectDirectory(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.length ? parts.join("/") : "/";
}
function dependency(manifest: PackageManifest, name: string): boolean {
  return Boolean(
    manifest.dependencies?.[name] ?? manifest.devDependencies?.[name],
  );
}

/** Returns the repository-relative path beside a detected manifest. */
function siblingPath(manifestPath: string, fileName: string): string {
	const directory = projectDirectory(manifestPath);
	return directory === '/' ? fileName : `${directory}/${fileName}`;
}

/** Checks whether the npm lockfile's root dependency declarations match package.json. */
function npmLockMatchesManifest(
	manifest: PackageManifest,
	rawLockfile?: string,
): boolean {
	if (!rawLockfile) return false;
	try {
		const lockedRoot = (JSON.parse(rawLockfile) as NpmLockManifest).packages?.[''];
		if (!lockedRoot) return false;
		return (['dependencies', 'devDependencies'] as const).every((section) => {
			const declared = manifest[section] ?? {};
			const locked = lockedRoot[section] ?? {};
			return Object.entries(declared).every(([name, version]) => locked[name] === version);
		});
	} catch {
		return false;
	}
}

/** Infers safe Node package commands from lockfiles and declared package scripts. */
function nodeCommands(
	manifest: PackageManifest,
	manifestPath: string,
	paths: string[],
	npmLockfile?: string,
): { commands: SourceCandidate['commands']; packageManager: string } {
	const besideManifest = (name: string) => paths.includes(siblingPath(manifestPath, name));
	let packageManager = 'npm';
	let install = 'npm install';
	let run = 'npm run';
	if (besideManifest('bun.lock') || besideManifest('bun.lockb')) {
		packageManager = 'bun';
		install = 'bun install --frozen-lockfile';
		run = 'bun run';
	} else if (besideManifest('pnpm-lock.yaml')) {
		packageManager = 'pnpm';
		install = 'corepack enable && pnpm install --frozen-lockfile';
		run = 'pnpm run';
	} else if (besideManifest('yarn.lock')) {
		packageManager = 'yarn';
		install = 'corepack enable && yarn install --frozen-lockfile';
		run = 'yarn';
	} else if (besideManifest('package-lock.json') || besideManifest('npm-shrinkwrap.json')) {
		install = npmLockMatchesManifest(manifest, npmLockfile)
			? 'npm ci'
			: 'npm install';
	}
	return {
		packageManager,
		commands: {
			install,
			...(manifest.scripts?.build ? { build: `${run} build` } : {}),
			...(manifest.scripts?.start ? { start: `${run} start` } : {}),
		},
	};
}

/** Detects common frameworks from repository manifests while leaving every suggestion user-overridable. */
function nodeFramework(manifest: PackageManifest): string | undefined {
  if (
    dependency(manifest, "@react-router/dev") ||
    dependency(manifest, "react-router")
  )
    return "react-router";
  if (dependency(manifest, "next")) return "nextjs";
  if (dependency(manifest, "@remix-run/react")) return "remix";
  if (dependency(manifest, "@nestjs/core")) return "nestjs";
  if (dependency(manifest, "nuxt")) return "nuxt";
  if (dependency(manifest, "@sveltejs/kit")) return "sveltekit";
  if (dependency(manifest, "astro")) return "astro";
  if (dependency(manifest, "gatsby")) return "gatsby";
  if (dependency(manifest, "@angular/core")) return "angular";
  if (dependency(manifest, "fastify")) return "fastify";
  if (dependency(manifest, "express")) return "express";
  if (dependency(manifest, "vue")) return "vue";
  if (dependency(manifest, "react")) return "react";
  if (dependency(manifest, "vite")) return "vite";
  return undefined;
}

function phpFramework(manifest: ComposerManifest): string | undefined {
  const packages = { ...manifest.require, ...manifest["require-dev"] };
  if (packages["laravel/framework"]) return "laravel";
  if (packages["cakephp/cakephp"]) return "cakephp";
  if (packages["symfony/framework-bundle"]) return "symfony";
  if (packages["codeigniter4/framework"]) return "codeigniter";
  if (packages["yiisoft/yii2"]) return "yii";
  if (packages["slim/slim"]) return "slim";
  return undefined;
}

function pythonFramework(requirements: string): string | undefined {
  if (/^django(?:[=<>~!]|$)/im.test(requirements)) return "django";
  if (/^fastapi(?:[=<>~!]|$)/im.test(requirements)) return "fastapi";
  if (/^flask(?:[=<>~!]|$)/im.test(requirements)) return "flask";
  if (/^litestar(?:[=<>~!]|$)/im.test(requirements)) return "litestar";
  return undefined;
}

function outputDirectory(framework?: string): string | undefined {
  return frameworkDefinition(framework)?.outputDirectory;
}

/** Inspects public GitHub trees and safe template files; it never reads real .env files. */
export async function analyzeApplicationSource(
  repositoryUrl: string,
  branch: string,
  token?: string,
): Promise<SourceAnalysis> {
  const repository = githubRepository(repositoryUrl);
  const [tree, branchRows] = await Promise.all([
    githubJson<{ tree?: GitHubTreeItem[] }>(
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      token,
    ),
    githubJson<Array<{ name: string }>>(
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}/branches?per_page=100`,
      token,
    ),
  ]);
  const paths = (tree.tree ?? [])
    .filter((item) => item.type === "blob" && item.path)
    .map((item) => item.path!);
  const candidates: SourceCandidate[] = [];
  const evidence: string[] = [];
  const wordpressMarker = paths.find((path) => /(^|\/)wp-includes\/version\.php$/.test(path));
  if (wordpressMarker) {
    const directory = projectDirectory(wordpressMarker).replace(/(?:^|\/)wp-includes$/, "") || "/";
    candidates.push({ projectDirectory: directory, stack: "php", framework: "wordpress" });
    evidence.push(`${wordpressMarker} identifies WordPress`);
  }
  for (const path of paths
    .filter((item) => item.endsWith("package.json"))
    .slice(0, 20)) {
    const raw = await rawFile(repository, branch, path, token);
    if (!raw) continue;
    try {
      const manifest = JSON.parse(raw) as PackageManifest;
      const framework = nodeFramework(manifest);
	  const npmLockPath = ['package-lock.json', 'npm-shrinkwrap.json']
		.map((name) => siblingPath(path, name))
		.find((candidate) => paths.includes(candidate));
	  const npmLockfile = npmLockPath
		? await rawFile(repository, branch, npmLockPath, token)
		: undefined;
	  const commandSuggestion = nodeCommands(manifest, path, paths, npmLockfile);
      candidates.push({
		commands: commandSuggestion.commands,
        projectDirectory: projectDirectory(path),
		packageManager: commandSuggestion.packageManager,
        stack:
          framework && ["react", "vite", "vue", "angular", "astro", "gatsby"].includes(framework)
            ? "static"
            : "node",
        framework,
      });
      evidence.push(
        `${path}${framework ? ` identifies ${framework}` : " identifies Node.js"}`,
      );
    } catch {
      /* Ignore malformed manifests. */
    }
  }
  for (const path of paths
    .filter((item) => item.endsWith("composer.json"))
    .slice(0, 20)) {
    const raw = await rawFile(repository, branch, path, token);
    if (!raw) continue;
    try {
      const framework = phpFramework(JSON.parse(raw) as ComposerManifest);
      candidates.push({
		commands: {
			install: paths.includes(siblingPath(path, 'composer.lock'))
				? 'composer install --no-interaction --prefer-dist --optimize-autoloader'
				: 'composer install --no-interaction --prefer-dist',
		},
        projectDirectory: projectDirectory(path),
		packageManager: 'composer',
        stack: "php",
        framework,
      });
      evidence.push(
        `${path}${framework ? ` identifies ${framework}` : " identifies PHP"}`,
      );
    } catch {
      /* Ignore malformed manifests. */
    }
  }
  for (const path of paths
    .filter((item) => /(^|\/)Gemfile$/.test(item))
    .slice(0, 20)) {
    const raw = await rawFile(repository, branch, path, token);
    if (!raw) continue;
    const framework = /^\s*gem\s+["']rails["']/m.test(raw) ? "rails" : undefined;
	const directory = projectDirectory(path);
	const locked = paths.includes(directory === '/' ? 'Gemfile.lock' : `${directory}/Gemfile.lock`);
    candidates.push({
		commands: {
			install: locked ? 'bundle config set deployment true && bundle install' : 'bundle install',
			...(framework === 'rails' ? { start: 'bundle exec rails server -b 0.0.0.0 -p 3000' } : {}),
		},
		packageManager: 'bundler',
		projectDirectory: directory,
		stack: "ruby",
		framework,
	});
    evidence.push(`${path}${framework ? " identifies Ruby on Rails" : " identifies Ruby"}`);
  }
  for (const path of paths
    .filter((item) => /(?:requirements\.txt|pyproject\.toml)$/.test(item))
    .slice(0, 20)) {
    const raw = await rawFile(repository, branch, path, token);
    if (!raw) continue;
    const framework = pythonFramework(raw);
	const directory = projectDirectory(path);
	const besideManifest = (name: string) =>
		paths.includes(directory === '/' ? name : `${directory}/${name}`);
	const pythonInstall = besideManifest('uv.lock')
		? 'uv sync --frozen'
		: besideManifest('poetry.lock')
			? 'poetry install --no-interaction --no-root'
			: path.endsWith('pyproject.toml')
				? 'pip install .'
				: 'pip install -r requirements.txt';
    candidates.push({
	  commands: {
		install: pythonInstall,
	  },
	  projectDirectory: directory,
	  packageManager: besideManifest('uv.lock')
		? 'uv'
		: besideManifest('poetry.lock')
			? 'poetry'
			: 'pip',
      stack: "python",
      framework,
    });
    evidence.push(
      `${path}${framework ? ` identifies ${framework}` : " identifies Python"}`,
    );
  }
  const templatePath = paths.find((item) =>
    /(^|\/)(?:\.env\.example|\.env\.sample|\.env\.template|env\.example)$/i.test(
      item,
    ),
  );
  const template = templatePath
    ? await rawFile(repository, branch, templatePath, token)
    : undefined;
  const environmentKeys = [
    ...new Set(
      (template ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
        .map((line) => line.split("=", 1)[0].trim().toUpperCase()),
    ),
  ].map((key) => ({ key, isSecret: SECRET_KEY.test(key), required: false }));
  if (templatePath)
    evidence.push(
      `${templatePath} provides ${environmentKeys.length} environment variable keys`,
    );
  const unique = candidates.filter(
    (candidate, index) =>
      candidates.findIndex(
        (item) =>
          item.projectDirectory === candidate.projectDirectory &&
          item.stack === candidate.stack,
      ) === index,
  );
  const selected = unique[0];
  return {
    repository: `${repository.owner}/${repository.repository}`,
    branches: branchRows.map(({ name }) => name),
    candidates: unique.length
      ? unique
      : [{ projectDirectory: "/", stack: "static" }],
    environmentKeys,
    evidence,
    outputDirectory: outputDirectory(selected?.framework),
  };
}
