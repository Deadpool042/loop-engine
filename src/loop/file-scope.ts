export type FileScopeParseResult =
  | Readonly<{ ok: true; allowedPaths: readonly string[] }>
  | Readonly<{ ok: false; code: "scope_missing" | "scope_malformed"; reason: string }>;

const UNSUPPORTED_GLOB = /[*?\[\]{}]/;

/**
 * Parses the deliberately small V1 writable-file contract. Paths are Git
 * relative POSIX paths; the sole supported pattern is a terminal `/**`.
 */
export function parseAllowedPaths(value: unknown): FileScopeParseResult {
  if (value === undefined) {
    return { ok: false, code: "scope_missing", reason: "READY execution decisions require decision.candidate.allowedPaths." };
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, code: "scope_malformed", reason: "decision.candidate.allowedPaths must be a non-empty list." };
  }

  const allowedPaths: string[] = [];
  for (const path of value) {
    if (typeof path !== "string" || path.trim().length === 0) {
      return { ok: false, code: "scope_malformed", reason: "Each allowed path must be a non-empty string." };
    }
    if (path !== path.trim() || path.startsWith("/") || path.includes("\\")) {
      return { ok: false, code: "scope_malformed", reason: "Allowed paths must be trimmed, relative POSIX paths." };
    }
    const recursive = path.endsWith("/**");
    const base = recursive ? path.slice(0, -3) : path;
    if (
      base.length === 0 ||
      base.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
      UNSUPPORTED_GLOB.test(base) ||
      (!recursive && UNSUPPORTED_GLOB.test(path)) ||
      (recursive && path.slice(0, -3).includes("/**"))
    ) {
      return { ok: false, code: "scope_malformed", reason: "Allowed paths support exact relative POSIX paths or one terminal /** prefix only." };
    }
    allowedPaths.push(path);
  }
  return { ok: true, allowedPaths: Object.freeze([...new Set(allowedPaths)].sort()) };
}

export function isPathAllowed(path: string, allowedPaths: readonly string[]): boolean {
  return allowedPaths.some((allowedPath) =>
    allowedPath.endsWith("/**")
      ? path.startsWith(allowedPath.slice(0, -2))
      : path === allowedPath,
  );
}

export function findOutOfScopeFiles(
  modifiedFiles: readonly string[],
  allowedPaths: readonly string[],
): readonly string[] {
  return Object.freeze(
    [...new Set(modifiedFiles.filter((path) => !isPathAllowed(path, allowedPaths)))].sort(),
  );
}
