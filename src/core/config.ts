import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { parse as parseYaml } from "yaml";

export const WORKSPACE_MATERIALIZATION_MODES = [
  "permanent",
  "source_only",
  "on_demand",
  "none",
] as const;
export type WorkspaceMaterializationMode =
  (typeof WORKSPACE_MATERIALIZATION_MODES)[number];

export const WORKSPACE_DEPENDENCY_MODES = [
  "none",
  "on_demand",
  "production",
] as const;
export type WorkspaceDependencyMode =
  (typeof WORKSPACE_DEPENDENCY_MODES)[number];

export type ProjectConfig = {
  name: string;
  path: string;
  /**
   * Optional alternative checkout locations, relative to the process cwd like
   * `path`. Used only when `path` is not an exact-case directory on this host
   * (e.g. the VPS layout `../CREATYSS` vs the Mac layout `../creatyss`).
   */
  path_aliases?: string[];
  type: string;
  archived?: boolean;
  /** Tombstone: identity burned after a full hard-delete; implies archived, never reusable. */
  retired?: boolean;
  required_docs: string[];
  validation: string[];
  roadmap?: string[];
  optional?: boolean;
  requires_git?: boolean;
  repository?: string;
  workspace?: {
    mode: WorkspaceMaterializationMode;
    dependencies?: WorkspaceDependencyMode;
  };
  // Opt-in, project-relative path to an explicit, SHA-bound execution
  // authorization file (see src/governance/execution-decision.ts).
  execution_decision?: string;
  planning?: {
    mode: "roadmap" | "maintenance" | "deferred" | "external";
    /** One project-relative canonical objective document. */
    objective_source?: string;
  };
};

export type Config = {
  workspace_policy?: {
    min_free_disk_gib?: number;
  };
  projects: ProjectConfig[];
};

export type ProjectsRoot = Readonly<{
  configuredPath: string;
  canonicalPath: string;
}>;

/** Resolves the required host-provided root without inferring a fallback. */
export function resolveProjectsRoot(
  value: string | undefined = process.env.LOOP_PROJECTS_ROOT,
): ProjectsRoot {
  if (value === undefined) {
    throw new Error("LOOP_PROJECTS_ROOT is required.");
  }
  if (value.length === 0 || value.trim().length === 0) {
    throw new Error("LOOP_PROJECTS_ROOT must not be empty.");
  }
  if (!isAbsolute(value)) {
    throw new Error("LOOP_PROJECTS_ROOT must be an absolute path.");
  }

  const configuredPath = resolve(value);
  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(configuredPath);
  } catch {
    throw new Error(
      "LOOP_PROJECTS_ROOT does not exist or cannot be canonicalized.",
    );
  }

  let rootIsDirectory: boolean;
  try {
    rootIsDirectory = statSync(canonicalPath).isDirectory();
  } catch {
    throw new Error("LOOP_PROJECTS_ROOT cannot be inspected.");
  }
  if (!rootIsDirectory)
    throw new Error("LOOP_PROJECTS_ROOT must be a directory.");

  return Object.freeze({ configuredPath, canonicalPath });
}

export type ConfinedProjectPath = Readonly<{
  canonicalPath: string;
  exists: boolean;
}>;

type InspectedProjectPath = ConfinedProjectPath &
  Readonly<{ caseMismatch: boolean }>;

function isWithinRoot(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." &&
      !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot))
  );
}

function resolveCandidateComponents(
  candidate: string,
  projectsRoot: ProjectsRoot,
  cwd: string,
): string[] {
  if (typeof candidate !== "string" || candidate.length === 0) {
    throw new Error("Project path must be a non-empty string.");
  }

  let canonicalCwd: string;
  try {
    canonicalCwd = realpathSync(cwd);
  } catch {
    throw new Error("Loop Engine working directory cannot be canonicalized.");
  }

  let baseComponents: string[];
  let candidateComponents: string[];
  if (!isAbsolute(candidate)) {
    if (!isWithinRoot(projectsRoot.canonicalPath, canonicalCwd)) {
      throw new Error(
        "Loop Engine working directory is outside LOOP_PROJECTS_ROOT.",
      );
    }
    const cwdRelative = relative(projectsRoot.canonicalPath, canonicalCwd);
    baseComponents = cwdRelative ? cwdRelative.split(sep) : [];
    candidateComponents = candidate.split(sep);
  } else {
    let rootPrefix: string;
    const hasRootPrefix = (root: string) =>
      candidate === root ||
      candidate.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
    if (hasRootPrefix(projectsRoot.configuredPath)) {
      rootPrefix = projectsRoot.configuredPath;
    } else if (hasRootPrefix(projectsRoot.canonicalPath)) {
      rootPrefix = projectsRoot.canonicalPath;
    } else {
      throw new Error("Project path escapes LOOP_PROJECTS_ROOT.");
    }
    let suffix = candidate.slice(rootPrefix.length);
    while (suffix.startsWith(sep)) suffix = suffix.slice(sep.length);
    baseComponents = [];
    candidateComponents = suffix ? suffix.split(sep) : [];
  }

  return [...baseComponents, ...candidateComponents];
}

function inspectProjectPath(
  candidate: string,
  projectsRoot: ProjectsRoot,
  cwd: string,
): InspectedProjectPath {
  const components = resolveCandidateComponents(candidate, projectsRoot, cwd);
  let current = projectsRoot.canonicalPath;
  let missing = false;
  let caseMismatch = false;

  for (const component of components) {
    if (component === "" || component === ".") continue;
    if (component === "..") {
      current = resolve(current, "..");
      if (!isWithinRoot(projectsRoot.canonicalPath, current)) {
        throw new Error("Project path escapes LOOP_PROJECTS_ROOT.");
      }
      continue;
    }
    if (missing) {
      current = resolve(current, component);
      if (!isWithinRoot(projectsRoot.canonicalPath, current)) {
        throw new Error("Project path escapes LOOP_PROJECTS_ROOT.");
      }
      continue;
    }

    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      throw new Error(
        "Project path parent cannot be inspected as a directory.",
      );
    }

    let actualComponent = component;
    if (!entries.includes(component)) {
      const caseEquivalent = entries.find(
        (entry) => entry.toLowerCase() === component.toLowerCase(),
      );
      if (caseEquivalent === undefined) {
        missing = true;
        current = resolve(current, component);
        continue;
      }
      actualComponent = caseEquivalent;
      caseMismatch = true;
    }

    const componentPath = resolve(current, actualComponent);
    let componentIsSymlink: boolean;
    try {
      componentIsSymlink = lstatSync(componentPath).isSymbolicLink();
    } catch {
      throw new Error("Project path changed or cannot be inspected.");
    }

    let canonicalComponent: string;
    try {
      canonicalComponent = realpathSync(componentPath);
    } catch {
      if (componentIsSymlink)
        throw new Error("Project path contains a broken symlink.");
      throw new Error("Project path component cannot be canonicalized.");
    }
    if (!isWithinRoot(projectsRoot.canonicalPath, canonicalComponent)) {
      throw new Error(
        "Project path escapes LOOP_PROJECTS_ROOT through a symlink.",
      );
    }
    current = canonicalComponent;
  }

  if (!missing) {
    let isDirectory: boolean;
    try {
      isDirectory = statSync(current).isDirectory();
    } catch {
      throw new Error("Project path cannot be inspected.");
    }
    if (!isDirectory)
      throw new Error("Project path must resolve to a directory.");
  }

  return Object.freeze({
    canonicalPath: current,
    exists: !missing && !caseMismatch,
    caseMismatch,
  });
}

/** Resolves a project path to a canonical, root-confined destination. */
export function resolveConfinedProjectPath(
  candidate: string,
  projectsRoot: ProjectsRoot,
  cwd = process.cwd(),
): ConfinedProjectPath {
  const inspected = inspectProjectPath(candidate, projectsRoot, cwd);
  if (inspected.caseMismatch) {
    throw new Error("Project path contains a component with incorrect case.");
  }
  return Object.freeze({
    canonicalPath: inspected.canonicalPath,
    exists: inspected.exists,
  });
}

/** Revalidates a project destination immediately before a filesystem/Git operation. */
export function resolveProjectPathForOperation(
  candidate: string,
  requireExisting = false,
  projectsRoot = resolveProjectsRoot(),
  cwd = process.cwd(),
): string {
  const inspected = resolveConfinedProjectPath(candidate, projectsRoot, cwd);
  if (requireExisting && !inspected.exists) {
    throw new Error("Project path does not exist with exact casing.");
  }
  return inspected.canonicalPath;
}

/**
 * Resolves one existing candidate among `path` then `path_aliases`.
 * Falls back to the declared `path` unchanged when none exist, but refuses
 * multiple existing candidates so a stale or duplicate checkout is not chosen silently.
 */
export function resolveProjectPath(
  project: Pick<ProjectConfig, "path" | "path_aliases">,
  projectsRoot: ProjectsRoot,
  cwd = process.cwd(),
): string {
  if (typeof project?.path !== "string" || project.path.length === 0) {
    throw new Error("Project path must be a non-empty string.");
  }
  const aliases = project.path_aliases;
  if (
    aliases !== undefined &&
    (!Array.isArray(aliases) ||
      aliases.some((candidate) => typeof candidate !== "string"))
  ) {
    throw new Error("Project path aliases must be an array of strings.");
  }
  const candidates = [project.path, ...(aliases ?? [])];
  const inspected = candidates.map((candidate) => ({
    candidate,
    result: inspectProjectPath(candidate, projectsRoot, cwd),
  }));
  const existing = inspected.filter(({ result }) => result.exists);
  if (existing.length > 1) {
    throw new Error(
      "Project path is ambiguous: multiple configured paths exist.",
    );
  }
  if (existing.length === 1) return existing[0]!.candidate;
  if (inspected.some(({ result }) => result.caseMismatch)) {
    throw new Error("Project path contains a component with incorrect case.");
  }
  return project.path;
}

export function loadConfig(
  projectsRoot = process.env.LOOP_PROJECTS_ROOT,
): Config {
  const allowedRoot = resolveProjectsRoot(projectsRoot);
  const raw = readFileSync("projects.yaml", "utf8");
  const config = parseYaml(raw) as Config;
  if (Array.isArray(config?.projects)) {
    for (const project of config.projects) {
      const selected = resolveProjectPath(project, allowedRoot);
      project.path = resolveConfinedProjectPath(
        selected,
        allowedRoot,
      ).canonicalPath;
    }
  }
  return config;
}
