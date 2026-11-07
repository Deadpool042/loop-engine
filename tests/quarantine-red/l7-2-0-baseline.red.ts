/**
 * L7.2-0 — tests ROUGES de référence (ADR-0027, statut « Proposé »).
 *
 * Ces tests décrivent le comportement ATTENDU après L7.2 et échouent
 * aujourd'hui sur une assertion (pas sur un import manquant) : ils ne
 * s'appuient que sur des composants existants. Ils ne font PAS partie de
 * l'inventaire `npm test` (extension `.red.ts`, comme `.burnin.ts`).
 *
 *   pnpm exec tsx --test tests/quarantine-red/l7-2-0-baseline.red.ts
 *
 * À rebaser sur #410 fusionnée. Aucune implémentation du runtime de
 * quarantaine n'est présente ni requise ici.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createIsolatedProviderRunExecute } from "../../src/composition/isolated-provider-execution.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const HANG_RUN = resolve(currentDir, "fixtures", "hang-run.ts");

type StubResult = Readonly<{
  code: string | null;
}>;

function toLoopRunResult(stub: StubResult): unknown {
  return Object.freeze({
    status: stub.code === null ? "completed" : "failed",
    modifiedFiles: [],
    validation: null,
    failure:
      stub.code === null
        ? null
        : { code: stub.code, message: "stub", details: [] },
  });
}

async function createRepository(root: string): Promise<string> {
  const path = join(root, "repo");
  await mkdir(path);
  execFileSync("git", ["init", "-q"], { cwd: path });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: path });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: path });
  await writeFile(join(path, "README.md"), "red\n");
  execFileSync("git", ["add", "README.md"], { cwd: path });
  execFileSync("git", ["commit", "-q", "-m", "test: baseline"], { cwd: path });
  return path;
}

function projectFor(path: string) {
  return {
    name: "red-project",
    path,
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: ["roadmap.md"],
  };
}

describe("L7.2-0 — comportement attendu de la quarantaine (rouge tant que L7.2 n'existe pas)", () => {
  let root: string;
  let repositoryPath: string;
  let lockRoot: string;
  let workspaceRoot: string;
  const children: ReturnType<typeof spawn>[] = [];

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "l7-2-0-red-"));
    repositoryPath = await createRepository(root);
    lockRoot = join(root, "locks");
    workspaceRoot = join(root, "workspaces");
  });

  after(async () => {
    for (const child of children) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });

  function buildRun(
    resultsByCall: readonly StubResult[],
    calls: { count: number },
  ) {
    let attempt = 0;
    return createIsolatedProviderRunExecute({
      executor: (async () => {
        throw new Error("executor must not be called");
      }) as never,
      agentRegistry: { profiles: [] } as never,
      resolveRepositoryPath: () => repositoryPath,
      lockRoot,
      workspaceRoot,
      createAttemptId: () => `attempt-${(attempt += 1)}`,
      prepareWorkspaceDependencies: async () => undefined,
      runLoopExecute: (async () => {
        const stub = resultsByCall[Math.min(calls.count, resultsByCall.length - 1)]!;
        calls.count += 1;
        return toLoopRunResult(stub);
      }) as never,
    });
  }

  const options = () =>
    ({ loadConfig: () => ({ projects: [projectFor(repositoryPath)] }) }) as never;

  it("constats 1-2 : après un arrêt incertain, une exécution du même projet (autre tentative) est refusée", async () => {
    const calls = { count: 0 };
    const run = buildRun(
      [{ code: "cancellation_cleanup_failed" }, { code: null }],
      calls,
    );

    await run("red-project", options());
    assert.equal(calls.count, 1);

    const second = await run("red-project", options());

    assert.equal(
      calls.count,
      1,
      "le second run ne doit pas atteindre le fournisseur : le projet est en quarantaine",
    );
    assert.equal(second.status, "failed");
  });

  it("constat 2 : l'espace de travail est conservé après un arrêt incertain (preuve à examiner)", async () => {
    const isolatedRoot = join(root, "workspaces-uncertain");
    const calls = { count: 0 };
    let attempt = 0;
    const run = createIsolatedProviderRunExecute({
      executor: (async () => undefined) as never,
      agentRegistry: { profiles: [] } as never,
      resolveRepositoryPath: () => repositoryPath,
      lockRoot: join(root, "locks-uncertain"),
      workspaceRoot: isolatedRoot,
      createAttemptId: () => `uncertain-${(attempt += 1)}`,
      prepareWorkspaceDependencies: async () => undefined,
      runLoopExecute: (async () => {
        calls.count += 1;
        return toLoopRunResult({ code: "cancellation_cleanup_failed" });
      }) as never,
    });

    await run("red-project", options());
    assert.equal(calls.count, 1, "contrôle : le fournisseur simulé a bien été atteint");

    const entries = await readdir(isolatedRoot).catch(() => [] as string[]);
    assert.notEqual(
      entries.length,
      0,
      "l'espace isolé doit subsister tant que la quarantaine n'est pas levée",
    );
  });

  it("constat 3 : un run tué (SIGKILL) pendant le fournisseur laisse le projet fermé aux autres tentatives", async () => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", HANG_RUN, repositoryPath, lockRoot, workspaceRoot],
      { stdio: ["ignore", "pipe", "inherit"], cwd: resolve(currentDir, "..", "..") },
    );
    children.push(child);
    await new Promise<void>((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error("child not running")), 30_000);
      child.stdout!.on("data", (chunk: Buffer) => {
        if (chunk.toString("utf8").includes("running")) {
          clearTimeout(timer);
          resolveReady();
        }
      });
      child.once("exit", () => reject(new Error("child exited early")));
    });

    child.kill("SIGKILL");
    await new Promise((resolveExit) => child.once("exit", resolveExit));

    const calls = { count: 0 };
    const run = buildRun([{ code: null }], calls);
    const after = await run("red-project", options());

    assert.equal(
      calls.count,
      0,
      "un propriétaire mort en pleine exécution doit laisser une quarantaine, pas un verrou repris",
    );
    assert.equal(after.status, "failed");
  });

  it("constat 5 : `commit` partage la barrière d'admission (exclusion mutuelle avec `execute` isolé)", {
    todo: "Le point d'entrée garanti (wrapper de composition de `commit`, lot L7.2-6a) n'existe pas ; un test sur `runLoopCommit` brut resterait rouge après implémentation car ce chemin est hors garantie (ADR §1). Test à écrire avec le wrapper.",
  }, () => {
    assert.fail("non écrit : dépend du wrapper de composition L7.2-6a");
  });
});
