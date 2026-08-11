export type DocumentationImpact = Readonly<{
  document: string;
  reason: string;
  required: boolean;
}>;

export type DocumentationImpactReport = Readonly<{
  changedPaths: readonly string[];
  impacts: readonly DocumentationImpact[];
  semanticReviewRequired: boolean;
}>;

type DocumentationImpactRule = Readonly<{
  matches: (path: string) => boolean;
  document: string;
  reason: string;
  required: boolean;
}>;

const RULES: readonly DocumentationImpactRule[] = [
  {
    matches: (path) => path === "src/cli.ts" || path.startsWith("src/commands/"),
    document: "docs/architecture/commands.md",
    reason: "CLI command surface or command routing changed",
    required: true,
  },
  {
    matches: (path) => path.startsWith("src/composition/"),
    document: "docs/architecture/application-assembly-contract.md",
    reason: "application assembly or dependency wiring changed",
    required: true,
  },
  {
    matches: (path) => path.startsWith("src/intelligence/"),
    document: "docs/architecture/project-intelligence.md",
    reason: "project intelligence behavior or snapshot construction changed",
    required: true,
  },
  {
    matches: (path) => path.startsWith("src/loop/"),
    document: "docs/architecture/autonomous-loop-runner.md",
    reason: "autonomous loop runner behavior or contract changed",
    required: true,
  },
  {
    matches: (path) => path.startsWith("src/audit/"),
    document: "docs/architecture/audit-engine.md",
    reason: "audit engine behavior, registry, or rules changed",
    required: true,
  },
  {
    matches: (path) => path.startsWith("src/execution/"),
    document: "docs/architecture/isolated-worker-platform-v16.1.md",
    reason: "execution workspace, worker isolation, or execution reporting changed",
    required: true,
  },
];

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizedUniquePaths(paths: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(paths.map((path) => path.trim()).filter(Boolean).map(normalizePath))].sort(),
  );
}

export function changedPathsFromGitDiff(diffNameOnly: string): readonly string[] {
  return normalizedUniquePaths(diffNameOnly.split("\n"));
}

export function untrackedPathsFromGitStatus(gitStatusShort: string): readonly string[] {
  return normalizedUniquePaths(
    gitStatusShort
      .split("\n")
      .filter((line) => line.startsWith("?? "))
      .map((line) => line.slice(3)),
  );
}

export function mergeChangedPaths(
  ...pathSets: readonly (readonly string[])[]
): readonly string[] {
  return normalizedUniquePaths(pathSets.flat());
}

export function createDocumentationImpactReport(
  changedPaths: readonly string[],
): DocumentationImpactReport {
  const normalizedPaths = [...new Set(changedPaths.map(normalizePath))].sort();
  const impacts = new Map<string, DocumentationImpact>();

  for (const path of normalizedPaths) {
    if (path.startsWith("docs/")) {
      continue;
    }

    for (const rule of RULES) {
      if (!rule.matches(path)) {
        continue;
      }

      const existing = impacts.get(rule.document);
      if (!existing || (!existing.required && rule.required)) {
        impacts.set(rule.document, {
          document: rule.document,
          reason: rule.reason,
          required: rule.required,
        });
      }
    }
  }

  const orderedImpacts = [...impacts.values()].sort((a, b) =>
    a.document.localeCompare(b.document),
  );

  return {
    changedPaths: normalizedPaths,
    impacts: orderedImpacts,
    semanticReviewRequired: orderedImpacts.some((impact) => impact.required),
  };
}
