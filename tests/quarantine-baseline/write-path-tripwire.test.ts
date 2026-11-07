/**
 * L7.2-0 — détecteur d'ajout de chemins d'écriture (tripwire).
 *
 * ⚠ Ce n'est PAS une preuve d'exhaustivité (ADR-0027 §1, « Contrôle structurel ») :
 * c'est un balayage lexical des fichiers de `src/` qui utilisent une API
 * d'écriture du système de fichiers ou lancent un processus. Il échoue quand
 * un NOUVEAU fichier apparaît ou qu'un fichier du registre disparaît, afin qu'un
 * humain le classe (barrière / autre protection / hors garantie) dans
 * `docs/roadmap/l7-2-plan-quarantaine.md` et dans l'ADR-0027 de LP-INFRA.
 * Il ne voit pas : écritures via `fs` importé sous un autre nom, via une
 * dépendance, via un binaire externe lancé par un chemin dynamique.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import { REPOSITORY_ROOT } from "../quarantine-support/support.js";

const WRITE_PATTERN =
  /(writeFile(Sync)?\(|appendFile(Sync)?\(|rename(Sync)?\(|rmSync\(|\brm\(|unlink(Sync)?\(|mkdir(Sync)?\(|copyFile|symlink)/;
const PROCESS_PATTERN = /(spawn\(|execFile(Sync)?\(|execSync\(|\bexec\(|shell: true)/;

/** Registre au 2026-11-07 (HEAD `c8a19ce`). Classification : voir le plan L7.2 §3bis. */
const EXPECTED_FS_WRITERS: readonly string[] = [
  "src/audit/rules/audit.ts",
  "src/audit/rules/configured-inbound-security-adapter.ts",
  "src/audit/rules/inbound-authentication-verification.ts",
  "src/composition/auto-subscription-decision-renewal.ts",
  "src/composition/isolated-provider-publication.ts",
  "src/composition/validated-git-patch-export.ts",
  "src/core/ci-terminal-events.ts",
  "src/core/config.ts",
  "src/core/reports.ts",
  "src/core/run-history.ts",
  "src/execution/adapters/git-worktree-workspace-manager.ts",
  "src/execution/adapters/local-project-lock-manager.ts",
  "src/execution/adapters/local-workspace-manager.ts",
  "src/governance/execution-decision-production.ts",
  "src/gui/config-store.ts",
  "src/inbound-security/file-replay-protection.ts",
  "src/loop/file-durable-execution-store.ts",
  "src/loop/git-candidate-publisher.ts",
  "src/workspace/materialization.ts",
  "src/workspace/project-archive.ts",
  "src/workspace/project-registration.ts",
  "src/workspace/project-retire.ts",
  "src/workspace/project-set-repository.ts",
];

const EXPECTED_PROCESS_LAUNCHERS: readonly string[] = [
  "src/audit/rules/application-assembly-contract.ts",
  "src/audit/rules/audit.ts",
  "src/audit/rules/cli-command-boundary.ts",
  "src/audit/rules/composition-root-direction.ts",
  "src/audit/rules/concrete-provider-exposure.ts",
  "src/audit/rules/core-concrete-dependency-direction.ts",
  "src/commands/json-check.ts",
  "src/commands/validate.ts",
  "src/composition/auto-subscription-decision-renewal.ts",
  "src/composition/execution-status.ts",
  "src/composition/validated-git-patch-export.ts",
  "src/core/git.ts",
  "src/core/reports.ts",
  "src/core/selected-lot-detail.ts",
  "src/gui/cli-invoker.ts",
  "src/gui/desktop/patch-review.ts",
  "src/gui/keychain-reader.ts",
  "src/loop/claude-code-cli-executor.ts",
  "src/loop/codex-cli-executor.ts",
  "src/loop/content-policy.ts",
  "src/loop/execution.ts",
  "src/loop/git-candidate-publisher.ts",
  "src/loop/git-candidate-reviewer.ts",
  "src/loop/git-committer.ts",
  "src/loop/worktree-status.ts",
  "src/runtime/local-process.ts",
  "src/workspace/materialization.ts",
  "src/workspace/project-archive.ts",
  "src/workspace/project-registration.ts",
  "src/workspace/project-retire.ts",
  "src/workspace/project-set-repository.ts",
];

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(path);
  }
  return files;
}

function scan(pattern: RegExp): string[] {
  return sourceFiles(join(REPOSITORY_ROOT, "src"))
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(REPOSITORY_ROOT, path))
    .sort();
}

describe("L7.2-0 — détecteur de chemins d'écriture (non exhaustif par nature)", () => {
  it("aucun fichier de src/ n'utilise une API d'écriture FS hors du registre classé", () => {
    assert.deepEqual(scan(WRITE_PATTERN), [...EXPECTED_FS_WRITERS].sort());
  });

  it("aucun fichier de src/ ne lance un processus hors du registre classé", () => {
    assert.deepEqual(scan(PROCESS_PATTERN), [...EXPECTED_PROCESS_LAUNCHERS].sort());
  });
});
