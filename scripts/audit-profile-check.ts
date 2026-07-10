import { execFileSync } from "node:child_process";

type AuditProfileReport = {
  readonly summary: {
    readonly total: number;
    readonly byCategory: Record<string, number | undefined>;
  };
  readonly findings: readonly {
    readonly ruleId: string;
    readonly category: string;
  }[];
};

type ProfileExpectation = {
  readonly profile: string;
  readonly categories: readonly string[];
};

const PROFILE_EXPECTATIONS: readonly ProfileExpectation[] = [
  { profile: "quick", categories: ["architecture", "cli"] },
  { profile: "strict", categories: ["json", "cli", "docs", "architecture"] },
  { profile: "release", categories: ["json", "cli", "docs", "architecture"] },
  { profile: "json", categories: ["json"] },
  { profile: "docs", categories: ["docs"] },
  { profile: "architecture", categories: ["architecture"] },
];

function runAuditProfile(profile: string): AuditProfileReport {
  const output = execFileSync(
    "pnpm",
    ["exec", "tsx", "src/cli.ts", "audit", "--json", "--profile", profile],
    { encoding: "utf8" },
  );

  return JSON.parse(output) as AuditProfileReport;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertProfile(expectation: ProfileExpectation): void {
  const report = runAuditProfile(expectation.profile);
  const expectedCategories = new Set(expectation.categories);
  const actualCategories = Object.entries(report.summary.byCategory)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([category]) => category);

  assert(report.summary.total === report.findings.length, `${expectation.profile}: total should match findings length`);
  assert(report.findings.length > 0, `${expectation.profile}: should return at least one finding`);

  for (const category of actualCategories) {
    assert(
      expectedCategories.has(category),
      `${expectation.profile}: unexpected category ${category}`,
    );
  }

  for (const expectedCategory of expectedCategories) {
    assert(
      actualCategories.includes(expectedCategory),
      `${expectation.profile}: missing category ${expectedCategory}`,
    );
  }

  for (const finding of report.findings) {
    assert(
      expectedCategories.has(finding.category),
      `${expectation.profile}: finding ${finding.ruleId} has unexpected category ${finding.category}`,
    );
  }
}

for (const expectation of PROFILE_EXPECTATIONS) {
  assertProfile(expectation);
}

console.log("audit profile checks passed");
