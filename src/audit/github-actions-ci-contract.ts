export type GithubActionsCiContractReport = Readonly<{
  missing: readonly string[];
  violations: readonly string[];
}>;

type CountInvariant = Readonly<{
  label: string;
  pattern: RegExp;
  expected: number;
}>;

export const GITHUB_ACTIONS_CI_CONTRACT = Object.freeze({
  requiredPatterns: Object.freeze([
    /uses:\s*actions\/checkout@v\d+/,
    /uses:\s*actions\/setup-node@v\d+/,
    /corepack enable/,
    /pnpm --version/,
    /\bquality:/,
    /\bci-gate:/,
    /needs:[\s\S]*- quality/,
    /pnpm run ci/,
    /if:\s*failure\(\)/,
    /name:\s*ci-diagnostics/,
  ]),
  exactCounts: Object.freeze([
    Object.freeze({
      label: "Node setup",
      pattern: /uses:\s*actions\/setup-node@v\d+/g,
      expected: 1,
    }),
    Object.freeze({
      label: "Corepack enable",
      pattern: /corepack enable/g,
      expected: 1,
    }),
    Object.freeze({
      label: "dependency install",
      pattern: /run:\s*pnpm install --frozen-lockfile/g,
      expected: 1,
    }),
    Object.freeze({
      label: "reference validation",
      pattern: /pnpm run ci/g,
      expected: 1,
    }),
  ] satisfies readonly CountInvariant[]),
  forbiddenPatterns: Object.freeze([
    /uses:\s*pnpm\/action-setup@v\d+/,
    /cache:\s*pnpm/,
    /(?:^|\n)\s{2}typecheck:/,
    /(?:^|\n)\s{2}tests:/,
    /(?:^|\n)\s{2}audit-strict:/,
    /(?:^|\n)\s{2}audit-profiles:/,
  ]),
});

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

export function inspectGithubActionsCiContract(
  source: string,
): GithubActionsCiContractReport {
  const missing = GITHUB_ACTIONS_CI_CONTRACT.requiredPatterns
    .filter((pattern) => !pattern.test(source))
    .map((pattern) => pattern.source);

  const countViolations = GITHUB_ACTIONS_CI_CONTRACT.exactCounts
    .filter(({ pattern, expected }) => countMatches(source, pattern) !== expected)
    .map(({ label, pattern, expected }) => {
      const actual = countMatches(source, pattern);
      return `${label}: expected ${expected}, found ${actual}`;
    });

  const forbiddenViolations = GITHUB_ACTIONS_CI_CONTRACT.forbiddenPatterns
    .filter((pattern) => pattern.test(source))
    .map((pattern) => `forbidden CI pattern: ${pattern.source}`);

  return Object.freeze({
    missing: Object.freeze(missing),
    violations: Object.freeze([...countViolations, ...forbiddenViolations]),
  });
}
