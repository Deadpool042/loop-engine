import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function isLoopEngineRepository(path: string): boolean {
  try {
    if (!existsSync(resolve(path, "src/cli.ts"))) return false;
    const packageJson = JSON.parse(
      readFileSync(resolve(path, "package.json"), "utf8"),
    ) as { name?: unknown };
    return packageJson.name === "loop-engine";
  } catch {
    return false;
  }
}

export type RepoPathResolver = Readonly<{
  detect: (startPath?: string) => string | null;
}>;

export function resolveLoopEngineRepositoryPath(options: {
  configuredRepositoryPath: string | null;
  startPath: string;
  resolver?: RepoPathResolver;
}): string | null {
  const resolver = options.resolver ?? createRepoPathResolver();

  if (options.configuredRepositoryPath !== null) {
    const configuredPath = resolver.detect(options.configuredRepositoryPath);
    if (configuredPath !== null) return configuredPath;
  }

  return resolver.detect(options.startPath);
}

export function createRepoPathResolver(): RepoPathResolver {
  return Object.freeze({
    detect(startPath = process.cwd()) {
      let current = resolve(startPath);
      while (true) {
        if (isLoopEngineRepository(current)) return current;
        const parent = dirname(current);
        if (parent === current) return null;
        current = parent;
      }
    },
  });
}
