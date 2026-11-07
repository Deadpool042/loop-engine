/**
 * L7.2-0 — tests de CARACTÉRISATION (verts aujourd'hui, doivent le rester).
 *
 * Ils figent le comportement existant dont dépend l'ADR-0027 (proposé) :
 *  - ce que la quarantaine NE doit PAS casser (verrou par projet, reprise du
 *    verrou d'un propriétaire mort, indépendance des projets, run propre) ;
 *  - les écarts connus qu'elle doit combler (constats 5, 7, 9) : `commit` sans
 *    exclusion, magasin durable verrouillé par clé, publication hors verrou.
 *
 * Les assertions de la deuxième famille décrivent l'état ACTUEL ; elles
 * devront être remplacées (pas supprimées) par leur contraire à l'implémentation
 * de L7.2-6a/6b. Les tests rouges correspondants sont dans tests/quarantine-red/.
 */
import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import type { ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { createLocalProjectLockManager } from "../../src/execution/adapters/local-project-lock-manager.js";
import { runLoopCommit } from "../../src/loop/commit-runner.js";
import { DURABLE_EXECUTION_SCHEMA_VERSION } from "../../src/loop/durable-execution.js";
import { createFileDurableExecutionStore } from "../../src/loop/file-durable-execution-store.js";
import {
  PROJECT_NAME,
  buildIsolatedRun,
  createRepository,
  killAndWait,
  projectFor,
  runOptionsFor,
  spawnHangingRun,
  toLoopRunResult,
} from "../quarantine-support/support.js";

describe("L7.2-0 — caractérisation de l'admission existante", () => {
  let root: string;
  let repositoryPath: string;
  const children: ChildProcess[] = [];

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "l7-2-0-char-"));
    repositoryPath = await createRepository(root);
  });

  after(async () => {
    for (const child of children) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });

  it("[à préserver] un run propre n'empêche pas le run suivant du même projet (critère 6)", async () => {
    let calls = 0;
    const run = buildIsolatedRun({
      repositoryPath,
      lockRoot: join(root, "locks-clean"),
      workspaceRoot: join(root, "ws-clean"),
      runLoopExecute: async () => {
        calls += 1;
        return toLoopRunResult({ code: null });
      },
    });

    await run(PROJECT_NAME, runOptionsFor(repositoryPath));
    await run(PROJECT_NAME, runOptionsFor(repositoryPath));

    assert.equal(calls, 2);
  });

  it("[à préserver] un détenteur vivant fait refuser une autre admission du même projet (project_locked)", async () => {
    const lockRoot = join(root, "locks-live");
    const workspaceRoot = join(root, "ws-live");
    const child = await spawnHangingRun({
      repositoryPath,
      lockRoot,
      workspaceRoot,
      children,
    });
    let calls = 0;
    const run = buildIsolatedRun({
      repositoryPath,
      lockRoot,
      workspaceRoot,
      attemptPrefix: "contender",
      runLoopExecute: async () => {
        calls += 1;
        return toLoopRunResult({ code: null });
      },
    });

    const result = await run(PROJECT_NAME, runOptionsFor(repositoryPath));
    await killAndWait(child);

    assert.equal(calls, 0);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "project_locked");
  });

  it("[à préserver] deux projets distincts ne s'excluent pas (critère 6)", async () => {
    const lockRoot = join(root, "locks-two");
    const workspaceRoot = join(root, "ws-two");
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolveGate) => {
      releaseFirst = resolveGate;
    });
    let secondCompleted = false;
    const repositoryB = await createRepository(root, "repo-b");

    const runA = buildIsolatedRun({
      repositoryPath,
      lockRoot,
      workspaceRoot,
      runLoopExecute: async () => {
        await gate;
        return toLoopRunResult({ code: null });
      },
    });
    const runB = buildIsolatedRun({
      repositoryPath: repositoryB,
      lockRoot,
      workspaceRoot,
      runLoopExecute: async () => {
        secondCompleted = true;
        return toLoopRunResult({ code: null });
      },
    });

    const first = runA(PROJECT_NAME, runOptionsFor(repositoryPath));
    const second = await runB("red-project-b", runOptionsFor(repositoryB, "red-project-b"));
    assert.equal(secondCompleted, true);
    assert.equal(second.status, "completed");
    releaseFirst();
    await first;
  });

  it("[à préserver, couche verrou] le verrou d'un propriétaire mort est repris par l'admission suivante (ADR §4 : inchangé)", async () => {
    const lockRoot = join(root, "locks-dead");
    const child = await spawnHangingRun({
      repositoryPath,
      lockRoot,
      workspaceRoot: join(root, "ws-dead"),
      children,
    });
    await killAndWait(child);

    const locks = createLocalProjectLockManager({ lockRoot });
    const acquisition = await locks.acquire({
      projectId: PROJECT_NAME,
      attemptId: "after-crash",
    });

    // La quarantaine doit s'ajouter AU-DESSUS de ce comportement, pas le modifier.
    assert.equal(acquisition.acquired, true);
    if (acquisition.acquired) await locks.release(acquisition.handle);
  });

  it("[état actuel, constat 5] deux `runLoopCommit` du même projet se chevauchent (aucune exclusion)", async () => {
    const project = projectFor(repositoryPath);
    let active = 0;
    let maxActive = 0;
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolveGate) => {
      releaseGate = resolveGate;
    });
    const candidate = {
      path: "roadmap.md",
      line: 1,
      text: "- [ ] Overlap probe",
      kind: "safe",
      reason: "safe fixture",
      status: "todo",
      priority: "default",
    };
    const snapshot = {
      project: { name: project.name, type: project.type, path: project.path },
      git: { branch: "main", clean: true, requiresGit: true, statusText: "", lastCommit: null },
      docs: { required: [], missing: [] },
      validation: { commands: [], configured: true },
      roadmap: {
        available: true,
        paths: project.roadmap,
        candidates: [candidate],
        selectedCandidate: candidate,
        stats: { total: 1, todo: 1, inProgress: 0, done: 0, unknown: 0, safe: 1, warning: 0, blocked: 0 },
        summary: { active: 1, done: 0, selectable: 1, hasBlocked: false },
      },
      health: "good",
    };
    const options = () =>
      ({
        loadConfig: () => ({ projects: [project] }),
        planLoopCycle: () => ({
          outcome: "ready",
          candidate,
          plannedSteps: ["Execute", "Validate", "Commit"],
          snapshot,
        }),
        buildMinimalContext: (_s: unknown, budget: unknown) => ({
          project: project.name,
          budget,
          files: [],
          omitted: [],
          totalCharacters: 0,
          estimatedTokens: 0,
          truncated: false,
        }),
        commitMessage: "test: overlap probe",
        readModifiedWorktreeFiles: async () => ["README.md"],
        executor: async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await gate;
          active -= 1;
          return { status: "completed", modifiedFiles: ["README.md"], details: [] };
        },
        validator: async () => ({ status: "passed", failedCommand: null, exitCode: 0, details: [] }),
        committer: async ({ message }: { message: string }) => ({
          committed: true,
          sha: "a".repeat(40),
          message,
        }),
      }) as never;

    const first = runLoopCommit(PROJECT_NAME, options());
    const second = runLoopCommit(PROJECT_NAME, options());
    for (let i = 0; i < 50 && maxActive < 2; i += 1) {
      await new Promise((resolveTick) => setTimeout(resolveTick, 10));
    }
    releaseGate();
    await Promise.all([first, second]);

    // Écart à combler par L7.2-6a : `commit` doit passer par la barrière (max 1).
    assert.equal(maxActive, 2);
  });

  it("[état actuel, constat 7] le magasin durable verrouille par DIGEST DE CLÉ, jamais par nom de projet", async () => {
    const acquiredIds: string[] = [];
    const real = createLocalProjectLockManager({ lockRoot: join(root, "durable-locks") });
    const spy = {
      acquire: async (request: { projectId: string; attemptId: string }) => {
        acquiredIds.push(request.projectId);
        return real.acquire(request);
      },
      release: real.release,
    };
    const store = createFileDurableExecutionStore({
      directory: join(root, "durable"),
      lockManager: spy as never,
    });

    const now = "2026-01-01T00:00:00.000Z";
    await store.save(
      {
        schemaVersion: DURABLE_EXECUTION_SCHEMA_VERSION,
        revision: 1,
        idempotencyKey: "idempotency-key-1",
        project: PROJECT_NAME,
        status: "queued",
        attempt: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        cancellationRequested: false,
        createdAt: now,
        updatedAt: now,
        result: null,
        failure: null,
        events: [],
      } as never,
      null,
    );

    // Le décorateur de quarantaine ne doit JAMAIS être appliqué à ce port.
    assert.ok(acquiredIds.length > 0, "le magasin doit acquérir un verrou");
    assert.ok(acquiredIds.every((id) => id !== PROJECT_NAME && id !== "idempotency-key-1"));
  });

  it("[état actuel, constat 9] l'étape de publication de `publish` s'exécute verrou LIBRE", async () => {
    const lockRoot = join(root, "locks-publish");
    const workspaceRoot = join(root, "ws-publish");
    const run = buildIsolatedRun({
      repositoryPath,
      lockRoot,
      workspaceRoot,
      runLoopExecute: async (_name, options) => {
        await appendFile(join(options.executionProjectPath!, "README.md"), "change\n");
        return {
          ...(toLoopRunResult({ code: null }) as object),
          runId: "run-publish-probe",
          modifiedFiles: ["README.md"],
          validation: { status: "passed", failedCommand: null, exitCode: 0, details: [] },
        };
      },
    });
    const { createIsolatedProviderRunPublish } = await import(
      "../../src/composition/isolated-provider-publication.js"
    );
    let lockWasFreeDuringPublication: boolean | undefined;
    const publish = createIsolatedProviderRunPublish({
      runExecute: run,
      loadConfig: (() => ({ projects: [projectFor(repositoryPath)] })) as never,
      findProject: (() => projectFor(repositoryPath)) as never,
      candidatePublisher: async () => {
        const locks = createLocalProjectLockManager({ lockRoot });
        const probe = await locks.acquire({ projectId: PROJECT_NAME, attemptId: "probe" });
        lockWasFreeDuringPublication = probe.acquired;
        if (probe.acquired) await locks.release(probe.handle);
        return { published: false, code: "probe", message: "probe" };
      },
    });

    await publish(PROJECT_NAME, runOptionsFor(repositoryPath));

    assert.equal(
      lockWasFreeDuringPublication,
      true,
      "l'étape de publication n'a aujourd'hui aucune admission (écart à combler par L7.2-6b)",
    );
  });
});
