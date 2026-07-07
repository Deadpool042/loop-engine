import { runAudit } from "../audit/runner.js";
import { terminal } from "../ui/terminal.js";

export function printAuditReport(): void {
  const report = runAudit();

  terminal.header("Audit");

  terminal.section("Summary");
  terminal.info(`Total: ${report.summary.total}`);
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
}


export function printAuditReportJson(): void {
  console.log(JSON.stringify(runAudit()));
}
