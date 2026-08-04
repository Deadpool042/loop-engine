// Bounded, non-recursive repo path auto-detection. Never walks the
// filesystem tree — every candidate is a single literal path, checked for
// a fixed, small set of required markers via one `exists()` call each.
//
// Candidate priority (gui-cockpit.md §15, and the settings-recovery lot):
//   1. the currently configured repo path, if it still has the markers
//   2. process.cwd()
//   3. a bounded list of parent directories of the app's own main file
//   4. a bounded, explicitly documented list of extra candidates (optional)
import { dirname, join } from "node:path";

export const REQUIRED_REPO_MARKERS = [
  "package.json",
  "projects.yaml",
  "src/cli.ts",
] as const;

export interface PathMarkerCheck {
  exists(path: string): Promise<boolean>;
}

export interface RepoPathCandidateSource {
  configuredRepoPath(): Promise<string | null>;
  cwd(): string;
  appDirParents(): readonly string[];
  extraCandidates(): readonly string[];
}

export async function detectRepoPath(
  checker: PathMarkerCheck,
  source: RepoPathCandidateSource,
): Promise<string | null> {
  const configured = await source.configuredRepoPath();

  const candidates = [
    configured,
    source.cwd(),
    ...source.appDirParents(),
    ...source.extraCandidates(),
  ].filter((candidate): candidate is string => typeof candidate === "string");

  for (const candidate of candidates) {
    if (await hasRequiredMarkers(checker, candidate)) {
      return candidate;
    }
  }

  return null;
}

// Bounded ancestor walk from `startDir` — never recurses into siblings or
// descendants, only follows dirname() up to `maxLevels` times, stopping the
// instant the filesystem root is reached (dirname(x) === x).
export function boundedParents(
  startDir: string,
  maxLevels: number,
): readonly string[] {
  const parents: string[] = [];
  let current = startDir;

  for (let level = 0; level < maxLevels; level += 1) {
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    parents.push(parent);
    current = parent;
  }

  return parents;
}

async function hasRequiredMarkers(
  checker: PathMarkerCheck,
  candidate: string,
): Promise<boolean> {
  for (const marker of REQUIRED_REPO_MARKERS) {
    if (!(await checker.exists(join(candidate, marker)))) {
      return false;
    }
  }
  return true;
}
