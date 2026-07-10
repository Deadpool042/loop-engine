import { execFileSync, spawnSync } from "node:child_process";

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

type CommandFailureExpectation = {
  readonly name: string;
  readonly args: readonly string[];
  readonly expectedOutput: string;
};

const PROFILE_EXPECTATIONS: readonly ProfileExpectation[] = [
  { profile: "quick", categories: ["architecture", "cli"] },
  { profile: "strict", categories: ["json", "cli", "docs", "architecture"] },
  { profile: "release", categories: ["json", "cli", "docs", "architecture"] },
  { profile: "json", categories: ["json"] },
  { profile: "docs", categories: ["docs"] },
  { profile: "architecture", categories: ["architecture"] },
];

const FAILURE_EXPECTATIONS: readonly CommandFailureExpectation[] = [
  {
    name: "invalid profile",
    args: ["exec", "tsx", "src/cli.ts", "audit", "--json", "--profile", "unknown"],
    expectedOutput: "Invalid audit profile",
  },
  {
    name: "missing profile value",
    args: ["exec", "tsx", "src/cli.ts", "audit", "--json", "--profile"],
    expectedOutput: "Invalid audit profile: <missing>",
  },
];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runAuditProfileCommand(profile: string): AuditProfileReport {
  const output = execFileSync(
    "pnpm",
    ["exec", "tsx", "src/cli.ts", "audit", "--json", "--profile", profile],
    { encoding: "utf8" },
  );

  return JSON.parse(output) as AuditProfileReport;
}

function getActualCategories(report: AuditProfileReport): readonly string[] {
  return Object.entries(report.summary.byCategory)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([category]) => category);
}

function assertExpectedCategories(
  expectation: ProfileExpectation,
  report: AuditProfileReport,
): void {
  const expectedCategories = new Set(expectation.categories);
  const actualCategories = getActualCategories(report);

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

function assertProfile(expectation: ProfileExpectation): void {
  const report = runAuditProfileCommand(expectation.profile);

  assert(report.summary.total === report.findings.length, `${expectation.profile}: total should match findings length`);
  assert(report.findings.length > 0, `${expectation.profile}: should return at least one finding`);

  assertExpectedCategories(expectation, report);
}

function assertCommandFails(expectation: CommandFailureExpectation): void {
  const result = spawnSync("pnpm", expectation.args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  assert(result.status !== 0, `${expectation.name} should exit with a non-zero status`);
  assert(
    output.includes(expectation.expectedOutput),
    `${expectation.name} should print ${expectation.expectedOutput}`,
  );
}

function assertInvalidProfileFails(): void {
  const expectation = FAILURE_EXPECTATIONS.find(({ name }) => name === "invalid profile");

  assert(expectation !== undefined, "invalid profile failure expectation should exist");
  assertCommandFails(expectation);
}

function assertMissingProfileValueFails(): void {
  const expectation = FAILURE_EXPECTATIONS.find(({ name }) => name === "missing profile value");

  assert(expectation !== undefined, "missing profile value failure expectation should exist");
  assertCommandFails(expectation);
}

for (const expectation of PROFILE_EXPECTATIONS) {
  assertProfile(expectation);
}

assertInvalidProfileFails();
assertMissingProfileValueFails();

console.log("audit profile checks passed");
