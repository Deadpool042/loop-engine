import { existsSync, readFileSync } from "node:fs";
import { fail, pass } from "../findings.js";
import type { AuditRule } from "../types.js";

export const AUDIT_DOCUMENTATION_COVERAGE_RULE: AuditRule = {
  id: "DOCS-001",
  category: "docs",
  severity: "warning",
  title: "Audit engine documentation covers human and JSON reports",
  description:
    "The audit documentation should describe both human-readable and JSON report outputs.",
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

    const expectedTerms = ["audit", "--json", "rapport humain", "rapport json"];

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
  description:
    "The README should not list duplicate documentation links in the See also section.",
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
  description:
    "The final audit report should mention the README audit rules and current rule count.",
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
  description:
    "The final audit report should document audit registry integrity checks.",
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
  description:
    "The README should document the public audit --profile option and available profile names.",
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
  description:
    "The architecture audit documentation should document audit profiles and their public usage.",
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
  description:
    "The README and architecture docs should document the audit profile CI check script.",
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
  description:
    "The README and architecture docs should document public audit profile error cases.",
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
  description:
    "The architecture docs should document the internal structure of the audit profile check script.",
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

    const missing = expectedTokens.filter(
      (token) => !architectureContent.includes(token),
    );

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
  description:
    "The repository should document the final Audit Engine V4 report and link it from the README.",
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
  description:
    "The README should document the stable recommendation summary contract and the legacy deprecation path.",
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
  title:
    "Final audit report documents recommendation summary deprecation cycle",
  description:
    "The final audit report should formalize the canonical recommendation summary field, the legacy field, compatibility, breaking change handling, json-check synchronization, and regression test coverage.",
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

export const AUDIT_ENGINE_V5_FINAL_REPORT_RULE: AuditRule = {
  id: "DOCS-014",
  category: "docs",
  severity: "warning",
  title: "Audit Engine V5 final report is documented",
  description:
    "The repository should document the dedicated Audit Engine V5 final report and link it from the audits README.",
  check: () => {
    const reportPath = "docs/audits/audit-engine-v5-final.md";
    const readmePath = "docs/audits/README.md";

    if (!existsSync(reportPath) || !existsSync(readmePath)) {
      return fail(
        AUDIT_ENGINE_V5_FINAL_REPORT_RULE,
        "Audit Engine V5 final report or audits README is missing.",
        [reportPath, readmePath],
        "Create docs/audits/audit-engine-v5-final.md and list it in docs/audits/README.md.",
      );
    }

    const reportContent = readFileSync(reportPath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");
    const haystack = `${reportContent}
${readmeContent}`;

    const expectedTokens = [
      "Audit Engine V5 — Rapport final",
      "V5.14.1",
      "96 règles exécutables",
      "96 règles en pass",
      "score 100",
      "V5.8 / V5.8.1",
      "V5.13",
      "summary.recommendations.total",
      "summary.recommendations.byPriority",
      "summary.recommendationsByPriority",
      "legacy / déprécié",
      "compatibilité descendante",
      "breaking change explicite",
      "json-check",
      "test de non-régression",
      "JSON-033",
      "AUDIT-050",
      "AUDIT-051",
      "DOCS-012",
      "DOCS-013",
      "AUDIT-016",
      "audit-engine-v5-final.md",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_ENGINE_V5_FINAL_REPORT_RULE,
        "Audit Engine V5 final report documentation is incomplete.",
        missing,
        "Document the V5 final report, the recommendation contract, the key rules, and the README link.",
      );
    }

    return pass(
      AUDIT_ENGINE_V5_FINAL_REPORT_RULE,
      "Audit Engine V5 final report is documented.",
      expectedTokens,
    );
  },
};

export const AUDIT_ENGINE_V5_FINAL_STABLE_TAG_RULE: AuditRule = {
  id: "DOCS-015",
  category: "docs",
  severity: "warning",
  title: "Audit Engine V5 final stable tag is documented",
  description:
    "The final Audit Engine V5 report should document that audit-engine-v5.14.1 is the final stable tag, that audit-engine-v5.14 is superseded, and that no history rewrite or force-push is required.",
  check: () => {
    const reportPath = "docs/audits/audit-engine-v5-final.md";
    const readmePath = "docs/audits/README.md";

    if (!existsSync(reportPath) || !existsSync(readmePath)) {
      return fail(
        AUDIT_ENGINE_V5_FINAL_STABLE_TAG_RULE,
        "Audit Engine V5 final report or audits README is missing.",
        [reportPath, readmePath],
        "Create docs/audits/audit-engine-v5-final.md and document the final stable tag in docs/audits/README.md.",
      );
    }

    const reportContent = readFileSync(reportPath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");
    const haystack = `${reportContent}
${readmeContent}`;

    const expectedTokens = [
      "audit-engine-v5.14.1",
      "audit-engine-v5.14",
      "tag final V5 complet",
      "tag final stable",
      "supersédé",
      "ne doit pas être utilisé comme référence finale",
      "L'historique n'a pas été réécrit",
      "Aucun force-push n'est requis",
      "inclut `docs/audits/audit-engine-v5-final.md`",
      "96 règles pass",
      "score 100",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_ENGINE_V5_FINAL_STABLE_TAG_RULE,
        "Final stable tag documentation is incomplete.",
        missing,
        "Document the final V5 stable tag, the superseded tag, the preserved history, and the stable V5 closure.",
      );
    }

    return pass(
      AUDIT_ENGINE_V5_FINAL_STABLE_TAG_RULE,
      "Audit Engine V5 final stable tag is documented.",
      expectedTokens,
    );
  },
};

export const AUDIT_STABLE_TAGS_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-016",
  category: "docs",
  severity: "warning",
  title: "Stable audit tags are documented and consistent",
  description:
    "The repository should expose a simple source of truth for the stable audit tags, and the audits documentation should reference it consistently.",
  check: () => {
    const stableTagsPath = "docs/audits/stable-tags.md";
    const readmePath = "docs/audits/README.md";
    const v5ReportPath = "docs/audits/audit-engine-v5-final.md";

    if (
      !existsSync(stableTagsPath) ||
      !existsSync(readmePath) ||
      !existsSync(v5ReportPath)
    ) {
      return fail(
        AUDIT_STABLE_TAGS_DOCUMENTATION_RULE,
        "Stable tags documentation files are missing.",
        [stableTagsPath, readmePath, v5ReportPath],
        "Create docs/audits/stable-tags.md and keep it referenced from docs/audits/README.md and docs/audits/audit-engine-v5-final.md.",
      );
    }

    const stableTagsContent = readFileSync(stableTagsPath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");
    const v5ReportContent = readFileSync(v5ReportPath, "utf8");
    const haystack = `${stableTagsContent}\n${readmeContent}\n${v5ReportContent}`;

    const expectedTokens = [
      "Source de vérité",
      "Dernier tag stable global actuel : `audit-engine-v6.6`",
      "Tag supersédé : `audit-engine-v6.1`",
      "`audit-engine-v6.1.1` inclut `docs/audits/stable-tags.md`",
      "`audit-engine-v6.0` reste le tag de démarrage V6",
      "Tag final stable du cycle V5 : `audit-engine-v5.14.1`",
      "Tag supersédé : `audit-engine-v5.14`",
      "Ne pas force-push.",
      "Ne pas supprimer les tags supersédés.",
      "Publier un tag correctif `.1` si une correction est nécessaire.",
      "audit-engine-v6.1.1",
      "audit-engine-v6.1",
      "audit-engine-v5.14.1",
      "audit-engine-v5.14",
      "audit-engine-v6.0",
      "audit-engine-v5-final.md",
      "stable-tags.md",
      "Tag final stable",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_STABLE_TAGS_DOCUMENTATION_RULE,
        "Stable tags documentation is incomplete or inconsistent.",
        missing,
        "Document the stable tag source of truth, the superseded V5 tag, and the README/report references.",
      );
    }

    return pass(
      AUDIT_STABLE_TAGS_DOCUMENTATION_RULE,
      "Stable audit tags are documented and consistent.",
      expectedTokens,
    );
  },
};

export const AUDIT_RELEASE_CHECKLIST_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-017",
  category: "docs",
  severity: "warning",
  title: "Audit tag release checklist is documented",
  description:
    "The repository should document a reusable release checklist that forces an explicit worktree verification before audit tags are published.",
  check: () => {
    const checklistPath = "docs/audits/release-checklist.md";
    const stableTagsPath = "docs/audits/stable-tags.md";
    const readmePath = "docs/audits/README.md";

    if (
      !existsSync(checklistPath) ||
      !existsSync(stableTagsPath) ||
      !existsSync(readmePath)
    ) {
      return fail(
        AUDIT_RELEASE_CHECKLIST_DOCUMENTATION_RULE,
        "Audit release checklist or related documentation is missing.",
        [checklistPath, stableTagsPath, readmePath],
        "Create docs/audits/release-checklist.md and link it from docs/audits/stable-tags.md and docs/audits/README.md.",
      );
    }

    const checklistContent = readFileSync(checklistPath, "utf8");
    const stableTagsContent = readFileSync(stableTagsPath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");
    const haystack = `${checklistContent}\n${stableTagsContent}\n${readmeContent}`;

    const expectedTokens = [
      "git status --short --untracked-files=all",
      "git diff --stat",
      "git diff --staged --stat",
      "fichiers créés attendus",
      "fichiers non suivis attendus",
      "tag correctif `.1`",
      "sans force-push",
      "ne pas supprimer les tags supersédés",
      "ne pas réécrire l'historique",
      "release-checklist.md",
      "stable-tags.md",
      "Audit tag release checklist",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_RELEASE_CHECKLIST_DOCUMENTATION_RULE,
        "Audit release checklist documentation is incomplete.",
        missing,
        "Document the worktree checks, the no-untracked-files rule, and the corrective .1 tagging guidance.",
      );
    }

    return pass(
      AUDIT_RELEASE_CHECKLIST_DOCUMENTATION_RULE,
      "Audit tag release checklist is documented.",
      expectedTokens,
    );
  },
};

export const AUDIT_FINAL_OBJECTIVE_ALIGNMENT_RULE: AuditRule = {
  id: "DOCS-018",
  category: "docs",
  severity: "warning",
  title:
    "Final objective is documented and referenced as the product source of truth",
  description:
    "docs/architecture/final-objective.md should hold every structuring term, and CLAUDE.md and README.md should each reference it as the product source of truth.",
  check: () => {
    const finalObjectivePath = "docs/architecture/final-objective.md";
    const claudePath = "CLAUDE.md";
    const readmePath = "README.md";

    const missingFiles = [finalObjectivePath, claudePath, readmePath].filter(
      (file) => !existsSync(file),
    );

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_FINAL_OBJECTIVE_ALIGNMENT_RULE,
        "Final objective documentation or its referencing files are missing.",
        missingFiles,
        "Create docs/architecture/final-objective.md and reference it from CLAUDE.md and README.md as the product source of truth.",
      );
    }

    const finalObjectiveContent = readFileSync(finalObjectivePath, "utf8");
    const claudeContent = readFileSync(claudePath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");

    const finalObjectiveTerms = [
      "objectif final",
      "source de vérité",
      "local",
      "déterministe",
      "read-only",
      "Claude",
      "pas de commit automatique",
      "pas de push automatique",
    ];

    const missingFinalObjectiveTerms = finalObjectiveTerms
      .filter((term) => !finalObjectiveContent.includes(term))
      .map((term) => `${finalObjectivePath}: missing "${term}"`);

    const referenceMarkers = [
      finalObjectivePath,
      "source de vérité",
      "objectif final",
    ];

    const missingClaudeMarkers = referenceMarkers
      .filter((marker) => !claudeContent.includes(marker))
      .map((marker) => `${claudePath}: missing "${marker}"`);

    const missingReadmeMarkers = referenceMarkers
      .filter((marker) => !readmeContent.includes(marker))
      .map((marker) => `${readmePath}: missing "${marker}"`);

    const missing = [
      ...missingFinalObjectiveTerms,
      ...missingClaudeMarkers,
      ...missingReadmeMarkers,
    ];

    if (missing.length > 0) {
      return fail(
        AUDIT_FINAL_OBJECTIVE_ALIGNMENT_RULE,
        "Final objective alignment is incomplete.",
        missing,
        'Keep docs/architecture/final-objective.md holding every structuring term, and reference it with "source de vérité" and "objectif final" from both CLAUDE.md and README.md.',
      );
    }

    return pass(
      AUDIT_FINAL_OBJECTIVE_ALIGNMENT_RULE,
      "Final objective is documented and consistently referenced as the product source of truth.",
      [
        ...finalObjectiveTerms,
        ...referenceMarkers.map(
          (marker) => `${claudePath}/${readmePath}: ${marker}`,
        ),
      ],
    );
  },
};

export const CLAUDE_MD_CURRENT_STATE_ALIGNMENT_RULE: AuditRule = {
  id: "DOCS-019",
  category: "docs",
  severity: "warning",
  title: "CLAUDE.md reflects the current state of Loop Engine",
  description:
    "CLAUDE.md should document the final objective reference, the full CI validation chain, and the current CLI surface (audit, handoff, RAG, json-check) rather than stale V0/V1 wording.",
  check: () => {
    const claudePath = "CLAUDE.md";

    if (!existsSync(claudePath)) {
      return fail(
        CLAUDE_MD_CURRENT_STATE_ALIGNMENT_RULE,
        "CLAUDE.md is missing.",
        [claudePath],
        "Restore CLAUDE.md and document the current state of Loop Engine.",
      );
    }

    const content = readFileSync(claudePath, "utf8");

    const expectedTokens = [
      "docs/architecture/final-objective.md",
      "pnpm run ci",
      "pnpm run audit:strict",
      "pnpm run audit:profiles",
      "pnpm run audit:release-check",
      "audit",
      "handoff",
      "rag-index",
      "rag-search",
      "json-check",
      "No automatic AI calls by default",
    ];

    const missing = expectedTokens
      .filter((token) => !content.includes(token))
      .map((token) => `${claudePath}: missing "${token}"`);

    if (missing.length > 0) {
      return fail(
        CLAUDE_MD_CURRENT_STATE_ALIGNMENT_RULE,
        "CLAUDE.md does not reflect the current state of Loop Engine.",
        missing,
        'Update CLAUDE.md to reference docs/architecture/final-objective.md, document pnpm run ci as the reference validation, list the audit/handoff/rag-index/rag-search/json-check commands, and replace V0/V1 wording with "No automatic AI calls by default".',
      );
    }

    return pass(
      CLAUDE_MD_CURRENT_STATE_ALIGNMENT_RULE,
      "CLAUDE.md reflects the current state of Loop Engine.",
      expectedTokens,
    );
  },
};

export const AUDIT_ENGINE_V6_FINAL_REPORT_RULE: AuditRule = {
  id: "DOCS-020",
  category: "docs",
  severity: "warning",
  title: "Audit Engine V6 final report is documented",
  description:
    "The repository should document the dedicated Audit Engine V6 final report, its final stable tag, and list it from the audits README.",
  check: () => {
    const reportPath = "docs/audits/audit-engine-v6-final.md";
    const readmePath = "docs/audits/README.md";
    const stableTagsPath = "docs/audits/stable-tags.md";

    const missingFiles = [reportPath, readmePath, stableTagsPath].filter(
      (file) => !existsSync(file),
    );

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_ENGINE_V6_FINAL_REPORT_RULE,
        "Audit Engine V6 final report or its referencing files are missing.",
        missingFiles,
        "Create docs/audits/audit-engine-v6-final.md and list it in docs/audits/README.md and docs/audits/stable-tags.md.",
      );
    }

    const reportContent = readFileSync(reportPath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");
    const stableTagsContent = readFileSync(stableTagsPath, "utf8");
    const haystack = `${reportContent}\n${readmeContent}\n${stableTagsContent}`;

    const expectedTokens = [
      "Audit Engine V6 — Rapport final",
      "V6.6",
      "102 règles exécutables",
      "102 règles en pass",
      "score 100",
      "audit-engine-v6.6",
      "tag final stable du cycle V6",
      "AUDIT-052",
      "DOCS-018",
      "DOCS-019",
      "audit-engine-v6-final.md",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_ENGINE_V6_FINAL_REPORT_RULE,
        "Audit Engine V6 final report documentation is incomplete.",
        missing,
        "Document the V6 final report, its rule count, its final stable tag, and the README/stable-tags links.",
      );
    }

    return pass(
      AUDIT_ENGINE_V6_FINAL_REPORT_RULE,
      "Audit Engine V6 final report is documented.",
      expectedTokens,
    );
  },
};

export const AUTONOMOUS_LOOP_RUNNER_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-021",
  category: "docs",
  severity: "warning",
  title: "Autonomous Loop Runner architecture is documented",
  description:
    "The repository should document the LoopRunner architecture, its LoopRunResult contract, its execution modes, its cycle states, and its future CLI options, and reference it from CLAUDE.md and README.md.",
  check: () => {
    const runnerDocPath = "docs/architecture/autonomous-loop-runner.md";
    const claudePath = "CLAUDE.md";
    const readmePath = "README.md";

    const missingFiles = [runnerDocPath, claudePath, readmePath].filter(
      (file) => !existsSync(file),
    );

    if (missingFiles.length > 0) {
      return fail(
        AUTONOMOUS_LOOP_RUNNER_DOCUMENTATION_RULE,
        "Autonomous Loop Runner documentation or its referencing files are missing.",
        missingFiles,
        "Create docs/architecture/autonomous-loop-runner.md and reference it from CLAUDE.md and README.md.",
      );
    }

    const runnerDocContent = readFileSync(runnerDocPath, "utf8");
    const claudeContent = readFileSync(claudePath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");

    const expectedRunnerDocTerms = [
      "LoopRunner",
      "LoopRunResult",
      "plan",
      "execute",
      "commit",
      "publish",
      "planning",
      "executing",
      "validating",
      "repairing",
      "completed",
      "blocked",
      "failed",
      "cancelled",
      "--max-repairs",
      "--resume",
      "force-push",
      "boucle infinie",
      "n8n",
      "OpenClaw",
      "Claude Code",
      "External orchestration",
      "Loop Engine",
      "Execution agents",
      "Interface Agent",
    ];

    const missingRunnerDocTerms = expectedRunnerDocTerms
      .filter((term) => !runnerDocContent.includes(term))
      .map((term) => `${runnerDocPath}: missing "${term}"`);

    const missingClaudeReference = claudeContent.includes(runnerDocPath)
      ? []
      : [`${claudePath}: missing "${runnerDocPath}"`];

    const missingReadmeReference = readmeContent.includes(runnerDocPath)
      ? []
      : [`${readmePath}: missing "${runnerDocPath}"`];

    const missing = [
      ...missingRunnerDocTerms,
      ...missingClaudeReference,
      ...missingReadmeReference,
    ];

    if (missing.length > 0) {
      return fail(
        AUTONOMOUS_LOOP_RUNNER_DOCUMENTATION_RULE,
        "Autonomous Loop Runner documentation is incomplete.",
        missing,
        "Document LoopRunner, LoopRunResult, the plan/execute/commit/publish modes, the cycle states, --max-repairs, --resume, the no-force-push and no-infinite-loop guardrails in docs/architecture/autonomous-loop-runner.md, and reference it from CLAUDE.md and README.md.",
      );
    }

    return pass(
      AUTONOMOUS_LOOP_RUNNER_DOCUMENTATION_RULE,
      "Autonomous Loop Runner architecture is documented.",
      [...expectedRunnerDocTerms, runnerDocPath],
    );
  },
};

export const LOOP_RUNNER_PLAN_MODE_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-022",
  category: "docs",
  severity: "warning",
  title: "LoopRunner plan mode (V7.2) is documented",
  description:
    "The repository should document that only the LoopRunner plan mode is implemented, that no agent is called, and that no modification, commit, or push happens, referencing this from CLAUDE.md and README.md.",
  check: () => {
    const runnerDocPath = "docs/architecture/autonomous-loop-runner.md";
    const claudePath = "CLAUDE.md";
    const readmePath = "README.md";

    const missingFiles = [runnerDocPath, claudePath, readmePath].filter(
      (file) => !existsSync(file),
    );

    if (missingFiles.length > 0) {
      return fail(
        LOOP_RUNNER_PLAN_MODE_DOCUMENTATION_RULE,
        "LoopRunner plan mode documentation or its referencing files are missing.",
        missingFiles,
        "Document the V7.2 plan mode in docs/architecture/autonomous-loop-runner.md, CLAUDE.md, and README.md.",
      );
    }

    const runnerDocContent = readFileSync(runnerDocPath, "utf8");
    const claudeContent = readFileSync(claudePath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");
    const haystack = `${runnerDocContent}\n${claudeContent}\n${readmeContent}`;

    const expectedTokens = [
      "V7.2",
      "runLoopPlan",
      "mode `plan`",
      "Loop run mode not implemented",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        LOOP_RUNNER_PLAN_MODE_DOCUMENTATION_RULE,
        "LoopRunner plan mode (V7.2) documentation is incomplete.",
        missing,
        "Document V7.2, runLoopPlan, the plan-only mode, and the mode-not-implemented rejection across docs/architecture/autonomous-loop-runner.md, CLAUDE.md, and README.md.",
      );
    }

    return pass(
      LOOP_RUNNER_PLAN_MODE_DOCUMENTATION_RULE,
      "LoopRunner plan mode (V7.2) is documented.",
      expectedTokens,
    );
  },
};

export const AGENT_POLICY_ENGINE_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-023",
  category: "docs",
  severity: "warning",
  title: "Agent Policy Engine (V7.4) and the n8n boundary are documented",
  description:
    "The repository should document the Agent Policy Engine, its forecast-only integration with the LoopRunner's plan mode, and the restrictive-merge boundary applied to n8n requests, referencing it from CLAUDE.md and README.md.",
  check: () => {
    const policyDocPath = "docs/architecture/agent-policy-engine.md";
    const claudePath = "CLAUDE.md";
    const readmePath = "README.md";

    const missingFiles = [policyDocPath, claudePath, readmePath].filter(
      (file) => !existsSync(file),
    );

    if (missingFiles.length > 0) {
      return fail(
        AGENT_POLICY_ENGINE_DOCUMENTATION_RULE,
        "Agent Policy Engine documentation or its referencing files are missing.",
        missingFiles,
        "Create docs/architecture/agent-policy-engine.md and reference it from CLAUDE.md and README.md.",
      );
    }

    const policyDocContent = readFileSync(policyDocPath, "utf8");
    const claudeContent = readFileSync(claudePath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");

    const expectedPolicyDocTerms = [
      "V7.4",
      "AgentPolicyResolution",
      "getAllowedPermissionsForMode",
      "Fusion toujours restrictive",
      "prévisionnelle",
      "n8n",
      "git_tag",
    ];

    const missingPolicyDocTerms = expectedPolicyDocTerms
      .filter((term) => !policyDocContent.includes(term))
      .map((term) => `${policyDocPath}: missing "${term}"`);

    const missingClaudeReference = claudeContent.includes(policyDocPath)
      ? []
      : [`${claudePath}: missing "${policyDocPath}"`];

    const missingReadmeReference = readmeContent.includes(policyDocPath)
      ? []
      : [`${readmePath}: missing "${policyDocPath}"`];

    const missing = [
      ...missingPolicyDocTerms,
      ...missingClaudeReference,
      ...missingReadmeReference,
    ];

    if (missing.length > 0) {
      return fail(
        AGENT_POLICY_ENGINE_DOCUMENTATION_RULE,
        "Agent Policy Engine documentation is incomplete.",
        missing,
        "Document V7.4, AgentPolicyResolution, getAllowedPermissionsForMode, the restrictive-merge principle, the forecast-only preview, the n8n boundary, and git_tag separation in docs/architecture/agent-policy-engine.md, and reference it from CLAUDE.md and README.md.",
      );
    }

    return pass(
      AGENT_POLICY_ENGINE_DOCUMENTATION_RULE,
      "Agent Policy Engine (V7.4) and the n8n boundary are documented.",
      [...expectedPolicyDocTerms, policyDocPath],
    );
  },
};

export const MINIMAL_CONTEXT_BUILDER_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-024",
  category: "docs",
  severity: "warning",
  title: "Minimal Context Builder (V7.5) is documented",
  description:
    "The repository should document the Minimal Context Builder, its bounded/deterministic guarantees, and its additive integration with the LoopRunner's plan mode, referencing it from CLAUDE.md and README.md.",
  check: () => {
    const builderDocPath = "docs/architecture/minimal-context-builder.md";
    const claudePath = "CLAUDE.md";
    const readmePath = "README.md";

    const missingFiles = [builderDocPath, claudePath, readmePath].filter(
      (file) => !existsSync(file),
    );

    if (missingFiles.length > 0) {
      return fail(
        MINIMAL_CONTEXT_BUILDER_DOCUMENTATION_RULE,
        "Minimal Context Builder documentation or its referencing files are missing.",
        missingFiles,
        "Create docs/architecture/minimal-context-builder.md and reference it from CLAUDE.md and README.md.",
      );
    }

    const builderDocContent = readFileSync(builderDocPath, "utf8");
    const claudeContent = readFileSync(claudePath, "utf8");
    const readmeContent = readFileSync(readmePath, "utf8");

    const expectedBuilderDocTerms = [
      "V7.5",
      "MinimalContextPackage",
      "buildMinimalContext",
      "outside_project",
      "includeFullFiles",
      "contextPackage",
    ];

    const missingBuilderDocTerms = expectedBuilderDocTerms
      .filter((term) => !builderDocContent.includes(term))
      .map((term) => `${builderDocPath}: missing "${term}"`);

    const missingClaudeReference = claudeContent.includes(builderDocPath)
      ? []
      : [`${claudePath}: missing "${builderDocPath}"`];

    const missingReadmeReference = readmeContent.includes(builderDocPath)
      ? []
      : [`${readmePath}: missing "${builderDocPath}"`];

    const missing = [
      ...missingBuilderDocTerms,
      ...missingClaudeReference,
      ...missingReadmeReference,
    ];

    if (missing.length > 0) {
      return fail(
        MINIMAL_CONTEXT_BUILDER_DOCUMENTATION_RULE,
        "Minimal Context Builder documentation is incomplete.",
        missing,
        "Document V7.5, MinimalContextPackage, buildMinimalContext, the outside_project confinement rule, includeFullFiles, and the contextPackage field in docs/architecture/minimal-context-builder.md, and reference it from CLAUDE.md and README.md.",
      );
    }

    return pass(
      MINIMAL_CONTEXT_BUILDER_DOCUMENTATION_RULE,
      "Minimal Context Builder (V7.5) is documented.",
      [...expectedBuilderDocTerms, builderDocPath],
    );
  },
};
