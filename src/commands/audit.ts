import { runAudit } from "../audit/runner.js";
import { isAuditProfile } from "../audit/profiles.js";
import type { AuditProfile, AuditReport } from "../audit/types.js";
import { terminal } from "../ui/terminal.js";


export function parseAuditProfileOption(args: readonly string[]): AuditProfile | undefined {
  const profileIndex = args.indexOf("--profile");

  if (profileIndex === -1) {
    return undefined;
  }

  const value = args[profileIndex + 1];

  if (value === undefined || value.startsWith("--") || !isAuditProfile(value)) {
    throw new Error(`Invalid audit profile: ${value ?? "<missing>"}`);
  }

  return value;
}

export function printAuditReport(): AuditReport {
  const profile = parseAuditProfileOption(process.argv);
  const report = runAudit({ profile });

  terminal.header("Audit");

  terminal.section("Summary");
  terminal.info(`Status: ${report.summary.status}`);
  terminal.info(`Total: ${report.summary.total}`);
  terminal.info(`Score: ${report.summary.score}`);
  terminal.success(`Pass: ${report.summary.pass}`);

  if (report.summary.warning > 0) {
    terminal.warning(`Warning: ${report.summary.warning}`);
  } else {
    terminal.success("Warning: 0");
  }

  if (report.summary.fail > 0) {
    terminal.error(`Fail: ${report.summary.fail}`);
  } else {
    terminal.success("Fail: 0");
  }

  if (report.summary.skipped > 0) {
    terminal.warning(`Skipped: ${report.summary.skipped}`);
  } else {
    terminal.success("Skipped: 0");
  }

  terminal.section("Categories");

  for (const [category, count] of Object.entries(report.summary.byCategory)) {
    terminal.info(`${category}: ${count}`);
  }

  terminal.section("Priorities");

  for (const [priority, count] of Object.entries(report.summary.byPriority)) {
    terminal.info(`${priority}: ${count}`);
  }

  const recommendations = report.findings.filter(
    (finding) => finding.recommendation,
  );

  if (recommendations.length > 0) {
    terminal.section("Recommendations");

    for (const finding of recommendations) {
      terminal.info(`${finding.ruleId}: ${finding.recommendation}`);
    }
  }

  terminal.section("Findings");

  for (const finding of report.findings) {
    const label = `${finding.ruleId} ${finding.status.toUpperCase()}`;

    if (finding.status === "fail") {
      terminal.error(`${label} — ${finding.message}`);
    } else if (finding.status === "warning") {
      terminal.warning(`${label} — ${finding.message}`);
    } else {
      terminal.success(`${label} — ${finding.message}`);
    }

    for (const detail of finding.details ?? []) {
      terminal.info(detail);
    }
  }

  return report;
}


export function printAuditReportJson(): AuditReport {
  const profile = parseAuditProfileOption(process.argv);
  const report = runAudit({ profile });
  console.log(JSON.stringify(report));
  return report;
}
