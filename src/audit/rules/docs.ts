import { existsSync, readFileSync } from "node:fs";
import { fail, pass } from "../findings.js";
import type { AuditRule } from "../types.js";

export const AUDIT_DOCUMENTATION_COVERAGE_RULE: AuditRule = {
  id: "DOCS-001",
  category: "docs",
  severity: "warning",
  title: "Audit engine documentation covers human and JSON reports",
  description: "The audit documentation should describe both human-readable and JSON report outputs.",
  check: () => {
    const docsPath = "docs/audits/audit-engine-v1-final.md";

    if (!existsSync(docsPath)) {
      return fail(
        AUDIT_DOCUMENTATION_COVERAGE_RULE,
        "Audit engine documentation is missing.",
        [docsPath],
        "Create docs/audits/audit-engine-v1-final.md and document the audit command outputs.",
      );
    }

    const content = readFileSync(docsPath, "utf8").toLowerCase();

    const expectedTerms = [
      "audit",
      "--json",
      "rapport humain",
      "rapport json",
    ];

    const missing = expectedTerms.filter(
      (term) => !content.includes(term.toLowerCase()),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_DOCUMENTATION_COVERAGE_RULE,
        "Audit engine documentation does not cover all expected report outputs.",
        missing,
        "Document the human audit report and the audit --json report contract.",
      );
    }

    return pass(
      AUDIT_DOCUMENTATION_COVERAGE_RULE,
      "Audit engine documentation covers human and JSON report outputs.",
      expectedTerms,
    );
  },
};

export const README_AUDIT_CI_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-002",
  category: "docs",
  severity: "warning",
  title: "README documents audit and CI commands",
  description: "The README should document the public audit and CI commands.",
  check: () => {
    const readmePath = "README.md";

    if (!existsSync(readmePath)) {
      return fail(
        README_AUDIT_CI_DOCUMENTATION_RULE,
        "README is missing.",
        [readmePath],
        "Restore README.md and document audit and CI commands.",
      );
    }

    const content = readFileSync(readmePath, "utf8");
    const expectedTokens = [
      "## Audit et CI",
      "pnpm loop audit",
      "pnpm loop audit --json",
      "pnpm loop audit --strict",
      "pnpm loop audit --json --strict",
      "pnpm run audit:strict",
      "pnpm run ci",
      "summary.status",
      "summary.score",
      "recommendations",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        README_AUDIT_CI_DOCUMENTATION_RULE,
        "README audit and CI documentation is incomplete.",
        missing,
        "Document the audit command, strict audit mode, CI script, and JSON report fields in README.md.",
      );
    }

    return pass(
      README_AUDIT_CI_DOCUMENTATION_RULE,
      "README documents audit and CI commands.",
      expectedTokens,
    );
  },
};

export const README_SEE_ALSO_UNIQUE_RULE: AuditRule = {
  id: "DOCS-003",
  category: "docs",
  severity: "warning",
  title: "README see also links are unique",
  description: "The README should not list duplicate documentation links in the See also section.",
  check: () => {
    const readmePath = "README.md";

    if (!existsSync(readmePath)) {
      return fail(
        README_SEE_ALSO_UNIQUE_RULE,
        "README is missing.",
        [readmePath],
        "Restore README.md so documentation links can be verified.",
      );
    }

    const content = readFileSync(readmePath, "utf8");
    const marker = "Voir aussi :";
    const markerIndex = content.indexOf(marker);

    if (markerIndex < 0) {
      return fail(
        README_SEE_ALSO_UNIQUE_RULE,
        "README does not expose a See also section.",
        [marker],
        "Keep a Voir aussi section in README.md for documentation discoverability.",
      );
    }

    const section = content.slice(markerIndex);
    const links = section
      .split("\\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- `") && line.endsWith("`"));

    const seen = new Set<string>();
    const duplicates = links.filter((link) => {
      if (seen.has(link)) {
        return true;
      }

      seen.add(link);
      return false;
    });

    if (duplicates.length > 0) {
      return fail(
        README_SEE_ALSO_UNIQUE_RULE,
        "README See also section contains duplicate links.",
        duplicates,
        "Remove duplicate documentation links from README.md.",
      );
    }

    return pass(
      README_SEE_ALSO_UNIQUE_RULE,
      "README See also links are unique.",
      links,
    );
  },
};

export const AUDIT_FINAL_REPORT_README_CHECKS_RULE: AuditRule = {
  id: "DOCS-004",
  category: "docs",
  severity: "warning",
  title: "Final audit report documents README checks",
  description: "The final audit report should mention the README audit rules and current rule count.",
  check: () => {
    const reportPath = "docs/audits/audit-engine-v1-final.md";

    if (!existsSync(reportPath)) {
      return fail(
        AUDIT_FINAL_REPORT_README_CHECKS_RULE,
        "Final audit report is missing.",
        [reportPath],
        "Restore docs/audits/audit-engine-v1-final.md and document the current audit rules.",
      );
    }

    const content = readFileSync(reportPath, "utf8");
    const registryPath = "src/audit/rules.ts";

    if (!existsSync(registryPath)) {
      return fail(
        AUDIT_FINAL_REPORT_README_CHECKS_RULE,
        "Audit rule registry is missing.",
        [registryPath],
        "Restore src/audit/rules.ts so the documented rule count can be verified.",
      );
    }

    const registryContent = readFileSync(registryPath, "utf8");
    const registryStart = registryContent.indexOf("export const AUDIT_RULES");
    const registryEnd = registryContent.indexOf("];", registryStart);

    if (registryStart < 0 || registryEnd < 0) {
      return fail(
        AUDIT_FINAL_REPORT_README_CHECKS_RULE,
        "Audit rule registry cannot be parsed.",
        ["export const AUDIT_RULES"],
        "Keep AUDIT_RULES declared as a static array in src/audit/rules.ts.",
      );
    }

    const registry = registryContent.slice(registryStart, registryEnd);
    const documentedRuleCount = Array.from(
      registry.matchAll(/\b[A-Z0-9_]+_RULE\b/g),
    ).length;
    const expectedRuleCount = `${documentedRuleCount} règles`;

    const expectedTokens = [
      expectedRuleCount,
      "`DOCS-002`",
      "`DOCS-003`",
      "Couverture README",
      "pnpm loop audit",
      "pnpm run ci",
      "Voir aussi",
      "README utilisateur aligné",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_FINAL_REPORT_README_CHECKS_RULE,
        "Final audit report does not document all README audit checks.",
        missing,
        "Document DOCS-002, DOCS-003, the README audit commands, and the current rule count in the final audit report.",
      );
    }

    return pass(
      AUDIT_FINAL_REPORT_README_CHECKS_RULE,
      "Final audit report documents README checks.",
      expectedTokens,
    );
  },
};

export const AUDIT_FINAL_REPORT_REGISTRY_CHECKS_RULE: AuditRule = {
  id: "DOCS-005",
  category: "docs",
  severity: "warning",
  title: "Final audit report documents registry checks",
  description: "The final audit report should document audit registry integrity checks.",
  check: () => {
    const reportPath = "docs/audits/audit-engine-v1-final.md";

    if (!existsSync(reportPath)) {
      return fail(
        AUDIT_FINAL_REPORT_REGISTRY_CHECKS_RULE,
        "Final audit report is missing.",
        [reportPath],
        "Restore docs/audits/audit-engine-v1-final.md and document registry integrity checks.",
      );
    }

    const content = readFileSync(reportPath, "utf8");
    const expectedTokens = [
      "`AUDIT-015`",
      "`AUDIT-016`",
      "unicité des identifiants",
      "complétude du registre",
      "`AUDIT_RULES`",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_FINAL_REPORT_REGISTRY_CHECKS_RULE,
        "Final audit report does not document registry checks.",
        missing,
        "Document AUDIT-015, AUDIT-016, rule id uniqueness, and AUDIT_RULES registry completeness.",
      );
    }

    return pass(
      AUDIT_FINAL_REPORT_REGISTRY_CHECKS_RULE,
      "Final audit report documents registry checks.",
      expectedTokens,
    );
  },
};

export const README_AUDIT_PROFILE_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-006",
  category: "docs",
  severity: "warning",
  title: "README documents audit profiles",
  description: "The README should document the public audit --profile option and available profile names.",
  check: () => {
    const readmePath = "README.md";

    if (!existsSync(readmePath)) {
      return fail(
        README_AUDIT_PROFILE_DOCUMENTATION_RULE,
        "README is missing.",
        [readmePath],
        "Create README.md and document audit profiles.",
      );
    }

    const content = readFileSync(readmePath, "utf8");
    const expectedTokens = [
      "Profils d'audit",
      "--profile",
      "pnpm loop audit --profile docs",
      "pnpm loop audit --json --profile docs",
      "pnpm loop audit --json --profile json",
      "pnpm loop audit --json --profile architecture",
      "`quick`",
      "`strict`",
      "`release`",
      "`docs`",
      "`json`",
      "`architecture`",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        README_AUDIT_PROFILE_DOCUMENTATION_RULE,
        "README audit profile documentation is incomplete.",
        missing,
        "Document the public audit --profile option and supported profile names.",
      );
    }

    return pass(
      README_AUDIT_PROFILE_DOCUMENTATION_RULE,
      "README documents audit profiles.",
      expectedTokens,
    );
  },
};

export const ARCHITECTURE_AUDIT_PROFILE_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-007",
  category: "docs",
  severity: "warning",
  title: "Architecture docs document audit profiles",
  description: "The architecture audit documentation should document audit profiles and their public usage.",
  check: () => {
    const architecturePath = "docs/architecture/audit-engine.md";

    if (!existsSync(architecturePath)) {
      return fail(
        ARCHITECTURE_AUDIT_PROFILE_DOCUMENTATION_RULE,
        "Audit architecture documentation is missing.",
        [architecturePath],
        "Create docs/architecture/audit-engine.md and document audit profiles.",
      );
    }

    const content = readFileSync(architecturePath, "utf8");
    const expectedTokens = [
      "Profils d'audit",
      "--profile",
      "pnpm loop audit --profile docs",
      "pnpm loop audit --json --profile docs",
      "pnpm loop audit --json --profile json",
      "pnpm loop audit --json --profile architecture",
      "`quick`",
      "`strict`",
      "`release`",
      "`docs`",
      "`json`",
      "`architecture`",
      "contrat de sortie",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        ARCHITECTURE_AUDIT_PROFILE_DOCUMENTATION_RULE,
        "Audit architecture profile documentation is incomplete.",
        missing,
        "Document audit profiles in docs/architecture/audit-engine.md.",
      );
    }

    return pass(
      ARCHITECTURE_AUDIT_PROFILE_DOCUMENTATION_RULE,
      "Architecture docs document audit profiles.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_CI_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-008",
  category: "docs",
  severity: "warning",
  title: "Docs document audit profile CI checks",
  description: "The README and architecture docs should document the audit profile CI check script.",
  check: () => {
    const readmePath = "README.md";
    const architecturePath = "docs/architecture/audit-engine.md";

    if (!existsSync(readmePath) || !existsSync(architecturePath)) {
      return fail(
        AUDIT_PROFILE_CI_DOCUMENTATION_RULE,
        "Audit profile CI documentation files are missing.",
        [readmePath, architecturePath],
        "Document pnpm run audit:profiles in README.md and docs/architecture/audit-engine.md.",
      );
    }

    const readmeContent = readFileSync(readmePath, "utf8");
    const architectureContent = readFileSync(architecturePath, "utf8");
    const haystack = `${readmeContent}\n${architectureContent}`;

    const expectedTokens = [
      "pnpm run audit:profiles",
      "scripts/audit-profile-check.ts",
      "profils `quick`, `strict`, `release`, `json`, `docs` et `architecture`",
      "pnpm run ci",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_CI_DOCUMENTATION_RULE,
        "Audit profile CI documentation is incomplete.",
        missing,
        "Document the audit profile CI check script and its CI integration.",
      );
    }

    return pass(
      AUDIT_PROFILE_CI_DOCUMENTATION_RULE,
      "Docs document audit profile CI checks.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_ERROR_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-009",
  category: "docs",
  severity: "warning",
  title: "Docs document audit profile errors",
  description: "The README and architecture docs should document public audit profile error cases.",
  check: () => {
    const readmePath = "README.md";
    const architecturePath = "docs/architecture/audit-engine.md";

    if (!existsSync(readmePath) || !existsSync(architecturePath)) {
      return fail(
        AUDIT_PROFILE_ERROR_DOCUMENTATION_RULE,
        "Audit profile error documentation files are missing.",
        [readmePath, architecturePath],
        "Document audit profile error behavior in README.md and docs/architecture/audit-engine.md.",
      );
    }

    const readmeContent = readFileSync(readmePath, "utf8");
    const architectureContent = readFileSync(architecturePath, "utf8");
    const haystack = `${readmeContent}\n${architectureContent}`;

    const expectedTokens = [
      "Erreurs de profils d'audit",
      "Invalid audit profile",
      "Invalid audit profile: <missing>",
      "profil inconnu",
      "profil manquant",
      "code de sortie non nul",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_ERROR_DOCUMENTATION_RULE,
        "Audit profile error documentation is incomplete.",
        missing,
        "Document unknown and missing audit profile errors.",
      );
    }

    return pass(
      AUDIT_PROFILE_ERROR_DOCUMENTATION_RULE,
      "Docs document audit profile errors.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_CHECK_STRUCTURE_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-010",
  category: "docs",
  severity: "warning",
  title: "Architecture docs document audit profile check structure",
  description: "The architecture docs should document the internal structure of the audit profile check script.",
  check: () => {
    const architecturePath = "docs/architecture/audit-engine.md";

    if (!existsSync(architecturePath)) {
      return fail(
        AUDIT_PROFILE_CHECK_STRUCTURE_DOCUMENTATION_RULE,
        "Audit architecture documentation is missing.",
        [architecturePath],
        "Document audit profile check script structure in docs/architecture/audit-engine.md.",
      );
    }

    const architectureContent = readFileSync(architecturePath, "utf8");

    const expectedTokens = [
      "Structure du contrôle des profils d'audit",
      "scripts/audit-profile-check.ts",
      "PROFILE_EXPECTATIONS",
      "FAILURE_EXPECTATIONS",
      "runAuditProfileCommand",
      "assertExpectedCategories",
      "assertCommandFails",
      "code de sortie non nul",
      "sans dupliquer la logique d'exécution",
    ];

    const missing = expectedTokens.filter((token) => !architectureContent.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_CHECK_STRUCTURE_DOCUMENTATION_RULE,
        "Audit profile check structure documentation is incomplete.",
        missing,
        "Document profile expectations, failure expectations, and reusable helper responsibilities.",
      );
    }

    return pass(
      AUDIT_PROFILE_CHECK_STRUCTURE_DOCUMENTATION_RULE,
      "Architecture docs document audit profile check structure.",
      expectedTokens,
    );
  },
};

export const AUDIT_ENGINE_V4_FINAL_REPORT_RULE: AuditRule = {
  id: "DOCS-011",
  category: "docs",
  severity: "warning",
  title: "Audit Engine V4 final report is documented",
  description: "The repository should document the final Audit Engine V4 report and link it from the README.",
  check: () => {
    const reportPath = "docs/audits/audit-engine-v4-final.md";
    const readmePath = "README.md";

    if (!existsSync(reportPath) || !existsSync(readmePath)) {
      return fail(
        AUDIT_ENGINE_V4_FINAL_REPORT_RULE,
        "Audit Engine V4 final report or README link target is missing.",
        [reportPath, readmePath],
        "Create docs/audits/audit-engine-v4-final.md and link it from README.md.",
      );
    }

    const reportContent = readFileSync(reportPath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");
    const haystack = `${reportContent}\n${readmeContent}`;

    const expectedTokens = [
      "Audit Engine V4 — Rapport final",
      "81 règles exécutables",
      "profils d'audit typés",
      "scripts/audit-profile-check.ts",
      "PROFILE_EXPECTATIONS",
      "FAILURE_EXPECTATIONS",
      "AUDIT-030",
      "AUDIT-040",
      "DOCS-006",
      "DOCS-011",
      "docs/audits/audit-engine-v4-final.md",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_ENGINE_V4_FINAL_REPORT_RULE,
        "Audit Engine V4 final report documentation is incomplete.",
        missing,
        "Document the V4 final report, rule range, profile checks, and README link.",
      );
    }

    return pass(
      AUDIT_ENGINE_V4_FINAL_REPORT_RULE,
      "Audit Engine V4 final report is documented.",
      expectedTokens,
    );
  },
};

export const README_RECOMMENDATION_SUMMARY_CONTRACT_RULE: AuditRule = {
  id: "DOCS-012",
  category: "docs",
  severity: "warning",
  title: "README documents recommendation summary contract",
  description: "The README should document the stable recommendation summary contract and the legacy deprecation path.",
  check: () => {
    const readmePath = "README.md";

    if (!existsSync(readmePath)) {
      return fail(
        README_RECOMMENDATION_SUMMARY_CONTRACT_RULE,
        "README is missing.",
        [readmePath],
        "Restore README.md and document the recommendation summary contract.",
      );
    }

    const content = readFileSync(readmePath, "utf8");
    const expectedTokens = [
      "### Contrat des recommandations JSON",
      "summary.recommendations.total",
      "summary.recommendations.byPriority",
      "summary.recommendationsByPriority",
      "legacy et déprécié",
      "reste exposé pour compatibilité",
      "synchronisé avec `summary.recommendationsByPriority` par `json-check`",
      "test de non-régression",
      "les consommateurs JSON doivent migrer vers `summary.recommendations.byPriority`",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        README_RECOMMENDATION_SUMMARY_CONTRACT_RULE,
        "README does not document the recommendation summary contract.",
        missing,
        "Add a README section that documents the canonical recommendation summary fields, the legacy field, synchronization, and migration guidance.",
      );
    }

    return pass(
      README_RECOMMENDATION_SUMMARY_CONTRACT_RULE,
      "README documents the recommendation summary contract.",
      expectedTokens,
    );
  },
};

export const AUDIT_FINAL_REPORT_RECOMMENDATION_DEPRECATION_RULE: AuditRule = {
  id: "DOCS-013",
  category: "docs",
  severity: "warning",
  title: "Final audit report documents recommendation summary deprecation cycle",
  description: "The final audit report should formalize the canonical recommendation summary field, the legacy field, compatibility, breaking change handling, json-check synchronization, and regression test coverage.",
  check: () => {
    const reportPath = "docs/audits/audit-engine-v1-final.md";

    if (!existsSync(reportPath)) {
      return fail(
        AUDIT_FINAL_REPORT_RECOMMENDATION_DEPRECATION_RULE,
        "Final audit report is missing.",
        [reportPath],
        "Restore docs/audits/audit-engine-v1-final.md and document the recommendation summary deprecation cycle.",
      );
    }

    const content = readFileSync(reportPath, "utf8");
    const expectedTokens = [
      "summary.recommendations.byPriority",
      "summary.recommendationsByPriority",
      "champ canonique",
      "legacy / déprécié",
      "compatibilité descendante",
      "décision explicite de breaking change",
      "synchronisation legacy/canonique",
      "json-check",
      "test de non-régression",
      "DOCS-013",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_FINAL_REPORT_RECOMMENDATION_DEPRECATION_RULE,
        "Final audit report does not document the recommendation summary deprecation cycle.",
        missing,
        "Document the canonical nested field, the legacy compatibility path, the breaking-change constraint, json-check synchronization, and the regression test.",
      );
    }

    return pass(
      AUDIT_FINAL_REPORT_RECOMMENDATION_DEPRECATION_RULE,
      "Final audit report documents the recommendation summary deprecation cycle.",
      expectedTokens,
    );
  },
};

