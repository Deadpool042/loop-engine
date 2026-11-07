/**
 * L7.2-0 — tests ROUGES de référence (ADR-0027, statut « Proposé »).
 *
 * Ils décrivent le comportement ATTENDU après L7.2 et échouent aujourd'hui sur
 * une ASSERTION, après une assertion de contrôle prouvant que le banc fonctionne
 * (fournisseur simulé atteint, patch exporté, etc.). Ils ne s'appuient que sur des
 * composants existants. Extension `.red.ts` : hors inventaire `pnpm run test`.
 *
 *   pnpm exec tsx --test --test-concurrency=1 tests/quarantine-red/l7-2-0-baseline.red.ts
 *
 * Contreparties vertes (ce qui doit rester vrai) : tests/quarantine-baseline/.
 * Aucune implémentation du runtime de quarantaine n'est présente ni requise.
 */
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { appendFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { createIsolatedProviderRunPublish } from "../../src/composition/isolated-provider-publication.js";
import { createLocalProjectLockManager } from "../../src/execution/adapters/local-project-lock-manager.js";
import {
  PROJECT_NAME,
  buildIsolatedRun,
  createRepository,
  killAndWait,
  projectFor,
  runOptionsFor,
  spawnHangingRun,
  toLoopRunResult,
  type StubResult,
} from "../quarantine-support/support.js";

describe("L7.2-0 — comportement attendu de la quarantaine (rouge tant que L7.2 n'existe pas)", () => {
  let root: string;
  let repositoryPath: string;
  const children: ChildProcess[] = [];

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "l7-2-0-red-"));
    repositoryPath = await createRepository(root);
  });

  after(async () => {
    for (const child of children) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });

  function sequencedRun(
    name: string,
    results: readonly StubResult[],
    calls: { count: number },
  ) {
    return buildIsolatedRun({
      repositoryPath,
      lockRoot: join(root, `locks-${name}`),
      workspaceRoot: join(root, `ws-${name}`),
      runLoopExecute: async () => {
        const stub = results[Math.min(calls.count, results.length - 1)]!;
        calls.count += 1;
        return toLoopRunResult(stub);
      },
    });
  }

  it("constats 1-2 : après un arrêt incertain, une exécution du même projet (autre tentative) est refusée", async () => {
    const calls = { count: 0 };
    const run = sequencedRun(
      "uncertain",
      [{ code: "cancellation_cleanup_failed" }, { code: null }],
      calls,
    );

    await run(PROJECT_NAME, runOptionsFor(repositoryPath));
    assert.equal(calls.count, 1, "contrôle : le fournisseur simulé a été atteint");

    const second = await run(PROJECT_NAME, runOptionsFor(repositoryPath));

    assert.equal(
      calls.count,
      1,
      "le second run ne doit pas atteindre le fournisseur : le projet est en quarantaine",
    );
    assert.equal(second.status, "failed");
  });

  it("constat 2 : l'espace de travail est conservé après un arrêt incertain (preuve à examiner)", async () => {
    const calls = { count: 0 };
    const run = sequencedRun("keep-ws", [{ code: "cancellation_cleanup_failed" }], calls);

    await run(PROJECT_NAME, runOptionsFor(repositoryPath));
    assert.equal(calls.count, 1, "contrôle : le fournisseur simulé a été atteint");

    const entries = await readdir(join(root, "ws-keep-ws")).catch(() => [] as string[]);
    assert.notEqual(
      entries.length,
      0,
      "l'espace isolé doit subsister tant que la quarantaine n'est pas levée",
    );
  });

  it("constat 3 : un run tué (SIGKILL) pendant le fournisseur laisse le projet fermé aux autres tentatives", async () => {
    const lockRoot = join(root, "locks-kill");
    const workspaceRoot = join(root, "ws-kill");
    const child = await spawnHangingRun({ repositoryPath, lockRoot, workspaceRoot, children });
    await killAndWait(child);

    const calls = { count: 0 };
    const run = buildIsolatedRun({
      repositoryPath,
      lockRoot,
      workspaceRoot,
      attemptPrefix: "after-kill",
      runLoopExecute: async () => {
        calls.count += 1;
        return toLoopRunResult({ code: null });
      },
    });
    const after = await run(PROJECT_NAME, runOptionsFor(repositoryPath));

    assert.equal(
      calls.count,
      0,
      "un propriétaire mort en pleine exécution doit laisser une quarantaine, pas un verrou repris",
    );
    assert.equal(after.status, "failed");
  });

  it("constat 9 : l'étape de publication de `publish` est sous admission (une autre admission y est refusée)", async () => {
    const lockRoot = join(root, "locks-publish-red");
    const run = buildIsolatedRun({
      repositoryPath,
      lockRoot,
      workspaceRoot: join(root, "ws-publish-red"),
      runLoopExecute: async (_name, options) => {
        await appendFile(join(options.executionProjectPath!, "README.md"), "change\n");
        return {
          ...(toLoopRunResult({ code: null }) as object),
          runId: "run-publish-red",
          modifiedFiles: ["README.md"],
          validation: { status: "passed", failedCommand: null, exitCode: 0, details: [] },
        };
      },
    });
    let publisherReached = false;
    let probeAcquired: boolean | undefined;
    const publish = createIsolatedProviderRunPublish({
      runExecute: run,
      loadConfig: (() => ({ projects: [projectFor(repositoryPath)] })) as never,
      findProject: (() => projectFor(repositoryPath)) as never,
      candidatePublisher: async () => {
        publisherReached = true;
        const locks = createLocalProjectLockManager({ lockRoot });
        const probe = await locks.acquire({ projectId: PROJECT_NAME, attemptId: "probe" });
        probeAcquired = probe.acquired;
        if (probe.acquired) await locks.release(probe.handle);
        return { published: false, code: "probe", message: "probe" };
      },
    });

    await publish(PROJECT_NAME, runOptionsFor(repositoryPath));
    assert.equal(publisherReached, true, "contrôle : l'étape de publication a été atteinte");

    assert.equal(
      probeAcquired,
      false,
      "pendant la publication, le projet doit être sous la barrière d'admission",
    );
  });

  it("constat 5 : `commit` partage la barrière d'admission (exclusion mutuelle avec `execute` isolé)", {
    todo: "Point d'entrée garanti = wrapper de composition de `commit` (lot L7.2-6a), inexistant. Un test sur `runLoopCommit` brut resterait rouge après implémentation (chemin hors garantie, ADR §1). Contrepartie verte : « deux runLoopCommit se chevauchent » dans tests/quarantine-baseline/.",
  }, () => {
    assert.fail("non écrit : dépend du wrapper de composition L7.2-6a");
  });

  it("constat 8 : la publication de gouvernance (`execution_decision`) est refusée pendant une quarantaine", {
    todo: "Point d'entrée garanti = admission `governed-write` (lot L7.2-6b), inexistant ; Q11 non tranchée.",
  }, () => {
    assert.fail("non écrit : dépend de L7.2-6b et de Q11");
  });
});
