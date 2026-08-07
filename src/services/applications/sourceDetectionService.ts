import {
  frameworkDefinition,
  type RuntimeLanguage,
} from "@config/frameworkCatalog";
import {
  resolveDeploymentContract,
  type DeploymentContract,
} from "@services/applications/deploymentRecipeService";

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
  environmentKeys?: Array<{
    isSecret: boolean;
    key: string;
    required: boolean;
  }>;
  framework?: string;
  packageManager?: string;
  projectDirectory: string;
  deploymentContract?: DeploymentContract;
  stack: RuntimeLanguage;
  versionHint?: string;
}
export interface SourceAnalysis {
  branches: string[];
  directories: string[];
  candidates: SourceCandidate[];
  environmentKeys: Array<{ isSecret: boolean; key: string; required: boolean }>;
  evidence: string[];
  outputDirectory?: string;
  repository: string;
}

const SECRET_KEY =
  /(?:secret|token|password|passwd|private|credential|api_key|auth|database_url|dsn)/i;
const ENVIRONMENT_TEMPLATE_NAMES = [
  '.env.example',
  '.env.sample',
  '.env.template',
  'env.example',
] as const;

/** Parses template names only; values are never returned to the deployment UI. */
function environmentKeys(
  template: string | undefined,
  framework?: string,
): Array<{ isSecret: boolean; key: string; required: boolean }> {
  return [
    ...new Set(
      (template ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
        .map((line) => line.split('=', 1)[0].trim().toUpperCase()),
    ),
  ].map((key) => ({
    key,
    isSecret: SECRET_KEY.test(key) || key === 'APP_KEY',
    required: framework === 'laravel' && key === 'APP_KEY',
  }));
}

/** Finds only a template directly owned by the selected project directory. */
function projectEnvironmentTemplate(
  paths: string[],
  directory: string,
): string | undefined {
  const prefix = directory === '/' ? '' : `${directory}/`;
  return ENVIRONMENT_TEMPLATE_NAMES.map((name) => `${prefix}${name}`).find(
    (path) => paths.includes(path),
  );
}

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
  return directory === "/" ? fileName : `${directory}/${fileName}`;
}

/** Infers safe Node package commands from lockfiles and declared package scripts. */
function nodeCommands(
  manifest: PackageManifest,
  manifestPath: string,
  paths: string[],
  framework?: string,
): { commands: SourceCandidate["commands"]; packageManager: string } {
  const besideManifest = (name: string) =>
    paths.includes(siblingPath(manifestPath, name));
  let packageManager = "npm";
  let install = "npm install";
  let run = "npm run";
  const startNeedsEnvironmentFile =
    manifest.scripts?.start &&
    /--env-file(?:=|\s+)\.env(?:\s|$)/.test(manifest.scripts.start) &&
    !manifest.scripts.start.includes("--env-file-if-exists");
  if (besideManifest("bun.lock") || besideManifest("bun.lockb")) {
    packageManager = "bun";
    install = "bun install --frozen-lockfile";
    run = "bun run";
  } else if (besideManifest("pnpm-lock.yaml")) {
    packageManager = "pnpm";
    install = "corepack enable && pnpm install --frozen-lockfile";
    run = "pnpm run";
  } else if (besideManifest("yarn.lock")) {
    packageManager = "yarn";
    install = "corepack enable && yarn install --frozen-lockfile";
    run = "yarn";
  }
  return {
    packageManager,
    commands: {
      install,
      ...(manifest.scripts?.build ? { build: `${run} build` } : {}),
      ...(manifest.scripts?.start
        ? {
            start: `${startNeedsEnvironmentFile ? "touch .env && " : ""}${run} start`,
          }
        : framework === "nuxt" && manifest.scripts?.build
          ? { start: "node .output/server/index.mjs" }
          : framework === "nestjs" && manifest.scripts?.build
            ? { start: "node dist/main.js" }
            : framework === "sveltekit" &&
                dependency(manifest, "@sveltejs/adapter-node") &&
                manifest.scripts?.build
              ? { start: "node build" }
              : {}),
    },
  };
}

/** Locates a conventional Python application module beside its dependency manifest. */
function pythonStartCommand(
  framework: string | undefined,
  directory: string,
  paths: string[],
  manifest: string,
): string | undefined {
  const relative = (path: string) =>
    directory === "/" ? path : `${directory}/${path}`;
  const modulePath = (path: string) =>
    path
      .replace(
        directory === "/"
          ? /^/
          : new RegExp(`^${directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`),
        "",
      )
      .replace(/\.py$/, "")
      .replace(/\//g, ".");
  if (framework === "django") {
    const wsgi = paths.find(
      (path) =>
        path.startsWith(directory === "/" ? "" : `${directory}/`) &&
        /(^|\/)wsgi\.py$/.test(path),
    );
    if (wsgi && /(?:^|\n)\s*gunicorn(?:[=<>~!]|$)/i.test(manifest))
      return `gunicorn ${modulePath(wsgi)}:application --bind 0.0.0.0:$PORT`;
  }
  const entry = ["main.py", "app.py"]
    .map(relative)
    .find((path) => paths.includes(path));
  if (!entry) return undefined;
  const module = modulePath(entry);
  if (
    framework === "fastapi" &&
    /(?:^|\n)\s*uvicorn(?:[=<>~![]|$)/i.test(manifest)
  )
    return `uvicorn ${module}:app --host 0.0.0.0 --port $PORT`;
  if (framework === "flask") {
    if (/(?:^|\n)\s*gunicorn(?:[=<>~!]|$)/i.test(manifest))
      return `gunicorn ${module}:app --bind 0.0.0.0:$PORT`;
    return `flask --app ${module} run --host 0.0.0.0 --port $PORT`;
  }
  if (framework === "litestar")
    return `litestar --app ${module}:app run --host 0.0.0.0 --port $PORT`;
  return undefined;
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
  if (/\bdjango(?:[=<>~!["']|$)/i.test(requirements)) return "django";
  if (/\bfastapi(?:[=<>~!["']|$)/i.test(requirements)) return "fastapi";
  if (/\bflask(?:[=<>~!["']|$)/i.test(requirements)) return "flask";
  if (/\blitestar(?:[=<>~!["']|$)/i.test(requirements)) return "litestar";
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
  const directories = [
    ...new Set(
      ["/"].concat(
        (tree.tree ?? [])
          .filter((item) => item.type === "tree" && item.path)
          .map((item) => item.path!),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const candidates: SourceCandidate[] = [];
  const evidence: string[] = [];
  const wordpressMarker = paths.find((path) =>
    /(^|\/)wp-includes\/version\.php$/.test(path),
  );
  if (wordpressMarker) {
    const directory =
      projectDirectory(wordpressMarker).replace(/(?:^|\/)wp-includes$/, "") ||
      "/";
    candidates.push({
      projectDirectory: directory,
      stack: "php",
      framework: "wordpress",
    });
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
      const commandSuggestion = nodeCommands(manifest, path, paths, framework);
      candidates.push({
        commands: commandSuggestion.commands,
        projectDirectory: projectDirectory(path),
        packageManager: commandSuggestion.packageManager,
        stack:
          framework &&
          ["react", "vite", "vue", "angular", "astro", "gatsby"].includes(
            framework,
          )
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
          install: paths.includes(siblingPath(path, "composer.lock"))
            ? "composer install --no-interaction --prefer-dist --optimize-autoloader"
            : "composer install --no-interaction --prefer-dist",
        },
        projectDirectory: projectDirectory(path),
        packageManager: "composer",
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
    const framework = /^\s*gem\s+["']rails["']/m.test(raw)
      ? "rails"
      : undefined;
    const directory = projectDirectory(path);
    const locked = paths.includes(
      directory === "/" ? "Gemfile.lock" : `${directory}/Gemfile.lock`,
    );
    candidates.push({
      commands: {
        install: locked
          ? "bundle config set deployment true && bundle install"
          : "bundle install",
        ...(framework === "rails"
          ? { start: "bundle exec rails server -b 0.0.0.0 -p $PORT" }
          : {}),
      },
      packageManager: "bundler",
      projectDirectory: directory,
      stack: "ruby",
      framework,
    });
    evidence.push(
      `${path}${framework ? " identifies Ruby on Rails" : " identifies Ruby"}`,
    );
  }
  for (const path of paths
    .filter((item) =>
      /(?:requirements(?:[-_.][a-z0-9]+)?\.txt|pyproject\.toml|Pipfile)$/i.test(
        item,
      ),
    )
    .slice(0, 20)) {
    const raw = await rawFile(repository, branch, path, token);
    if (!raw) continue;
    const framework = pythonFramework(raw);
    const directory = projectDirectory(path);
    const besideManifest = (name: string) =>
      paths.includes(directory === "/" ? name : `${directory}/${name}`);
    const pythonInstall = besideManifest("uv.lock")
      ? "uv sync --frozen"
      : besideManifest("poetry.lock")
        ? "poetry install --no-interaction --no-root"
        : path.endsWith("Pipfile")
          ? besideManifest("Pipfile.lock")
            ? "pipenv sync"
            : "pipenv install"
          : path.endsWith("pyproject.toml")
            ? "pip install ."
            : `pip install -r ${path.split("/").pop() ?? "requirements.txt"}`;
    candidates.push({
      commands: {
        install: pythonInstall,
        start: pythonStartCommand(framework, directory, paths, raw),
      },
      projectDirectory: directory,
      packageManager: besideManifest("uv.lock")
        ? "uv"
        : besideManifest("poetry.lock")
          ? "poetry"
          : path.endsWith("Pipfile")
            ? "pipenv"
            : "pip",
      stack: "python",
      framework,
    });
    evidence.push(
      `${path}${framework ? ` identifies ${framework}` : " identifies Python"}`,
    );
  }
	for (const phpCandidate of candidates.filter(
		(candidate) => candidate.stack === 'php',
	)) {
		const frontendCandidate = candidates.find(
			(candidate) =>
				(candidate.stack === 'node' || candidate.stack === 'static') &&
				candidate.projectDirectory === phpCandidate.projectDirectory,
		);
		if (!frontendCandidate?.commands?.install) continue;
		const frontendInstall =
			frontendCandidate.commands.build &&
			frontendCandidate.commands.install === 'npm ci'
				? 'npm ci --include=dev'
				: frontendCandidate.commands.build &&
					  frontendCandidate.commands.install === 'npm install'
					? 'npm install --include=dev'
					: frontendCandidate.commands.install;
		phpCandidate.commands = {
			...phpCandidate.commands,
			...(frontendCandidate.commands.build
				? { build: frontendCandidate.commands.build }
				: {}),
			install: [phpCandidate.commands?.install, frontendInstall]
				.filter(Boolean)
				.join(' && '),
		};
		evidence.push(
			`${phpCandidate.projectDirectory} combines PHP and Node dependency installation`,
		);
	}
  const unique = candidates.filter(
    (candidate, index) =>
      candidates.findIndex(
        (item) =>
          item.projectDirectory === candidate.projectDirectory &&
          item.stack === candidate.stack,
      ) === index,
  );
  const templated: SourceCandidate[] = [];
  for (const candidate of unique) {
    const templatePath = projectEnvironmentTemplate(
      paths,
      candidate.projectDirectory,
    );
    const template = templatePath
      ? await rawFile(repository, branch, templatePath, token)
      : undefined;
    const keys = environmentKeys(template, candidate.framework);
    if (templatePath)
      evidence.push(
        `${templatePath} provides ${keys.length} environment variable keys`,
      );
    templated.push({ ...candidate, environmentKeys: keys });
  }
  const contracted = templated.map((candidate) => {
    const definition = frameworkDefinition(candidate.framework);
    const deploymentContract = resolveDeploymentContract({
      buildCommand: candidate.commands?.build,
      framework: candidate.framework,
      installCommand: candidate.commands?.install,
      port:
        definition?.defaultPort ??
        (candidate.stack === "php" || candidate.stack === "static"
          ? 80
          : candidate.stack === "python"
            ? 8000
            : 3000),
      projectDirectory: candidate.projectDirectory,
      publishDirectory: definition?.outputDirectory,
      stack: candidate.stack,
      startCommand: candidate.commands?.start,
    });
    return {
      ...candidate,
      commands: {
        ...candidate.commands,
        ...(deploymentContract.buildCommand
          ? { build: deploymentContract.buildCommand }
          : {}),
        install: deploymentContract.installCommand,
        ...(deploymentContract.startCommand
          ? { start: deploymentContract.startCommand }
          : {}),
      },
      deploymentContract,
    };
  });
  const selected = contracted[0];
  return {
    repository: `${repository.owner}/${repository.repository}`,
    directories,
    branches: branchRows.map(({ name }) => name),
    candidates: contracted.length
      ? contracted
      : [{ projectDirectory: "/", stack: "static" }],
    environmentKeys: selected?.environmentKeys ?? [],
    evidence,
    outputDirectory: outputDirectory(selected?.framework),
  };
}
