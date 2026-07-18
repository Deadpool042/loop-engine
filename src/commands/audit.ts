import { runAudit } from "../audit/runner.js";
import { isAuditProfile } from "../audit/profiles.js";
import {
  createAuditRuleManifest,
  isAuditRuleStability,
  isAuditRuleTag,
  selectAuditRules,
  type AuditRuleSelection,
} from "../audit/registry.js";
import { AUDIT_RULES } from "../audit/rules.js";
import { selectAuditRulesForProfile } from "../audit/profiles.js";
import type { AuditProfile, AuditReport } from "../audit/types.js";
import { terminal } from "../ui/terminal.js";

export function parseAuditProfileOption(
  args: readonly string[],
): AuditProfile | undefined {
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

function parseRepeatedOption(
  args: readonly string[],
  option: string,
): readonly string[] {
  const values: string[] = [];

  for (let index = 0; index < args.length; index++) {
    if (args[index] !== option) {
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Invalid audit ${option.slice(2)}: ${value ?? "<missing>"}`);
    }
    values.push(value);
  }

  return values;
}

export type AuditCommandOptions = Readonly<{
  profile?: AuditProfile;
  selection: AuditRuleSelection;
}>;

export function parseAuditCommandOptions(
  args: readonly string[],
): AuditCommandOptions {
  const profile = parseAuditProfileOption(args);
  const ruleIds = parseRepeatedOption(args, "--rule");
  const tags = parseRepeatedOption(args, "--tag");
  const stabilities = parseRepeatedOption(args, "--stability");

  const validTags = tags.map((tag) => {
    if (!isAuditRuleTag(tag)) {
      throw new Error(`Invalid audit tag: ${tag}`);
    }
    return tag;
  });
  const validStabilities = stabilities.map((stability) => {
    if (!isAuditRuleStability(stability)) {
      throw new Error(`Invalid audit stability: ${stability}`);
    }
    return stability;
  });

  return {
    ...(profile === undefined ? {} : { profile }),
    selection: {
      ...(ruleIds.length === 0 ? {} : { ruleIds }),
      ...(validTags.length === 0 ? {} : { tags: validTags }),
      ...(validStabilities.length === 0
        ? {}
        : { stabilities: validStabilities }),
    },
  };
}

function selectRulesForOptions(options: AuditCommandOptions) {
  const profileRules =
    options.profile === undefined
      ? AUDIT_RULES
      : selectAuditRulesForProfile(options.profile, AUDIT_RULES);
  const rules = selectAuditRules(profileRules, options.selection);

  if (rules.length === 0) {
    throw new Error("No audit rules match the selected filters.");
  }

  return rules;
}

export function printAuditReport(): AuditReport {
  const options = parseAuditCommandOptions(process.argv);
  const report = runAudit(options);

  terminal.header("Audit");

  terminal.section("Summary");
  terminal.info(`Status: ${report.summary.status}`);
  terminal.info(`Total: ${report.summary.total}`);
  terminal.info(`Score: ${report.summary.score}`);
  terminal.info(`Recommendations: ${report.summary.recommendations.total}`);
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
  const options = parseAuditCommandOptions(process.argv);
  const report = runAudit(options);
  console.log(JSON.stringify(report));
  return report;
}

export function printAuditRuleManifest(): void {
  const options = parseAuditCommandOptions(process.argv);
  console.log(JSON.stringify(createAuditRuleManifest(selectRulesForOptions(options))));
}
