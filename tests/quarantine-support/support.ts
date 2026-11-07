/**
 * Support partagé des tests de référence de la quarantaine (ADR-0027, proposé).
 * Aucun code de production n'est modifié ; rien ici n'implémente la quarantaine.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createIsolatedProviderRunExecute } from "../../src/composition/isolated-provider-execution.js";

const supportDir = dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = resolve(supportDir, "..", "..");
export const HANG_RUN = join(supportDir, "hang-run.ts");
export const PROJECT_NAME = "red-project";

export type StubResult = Readonly<{ code: string | null }>;

export function toLoopRunResult(stub: StubResult): unknown {
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

export async function createRepository(
  root: string,
  name = "repo",
): Promise<string> {
  const path = join(root, name);
  await mkdir(path);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: path });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  await writeFile(join(path, "README.md"), "baseline\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "test: baseline");
  return path;
}

export function projectFor(path: string, name = PROJECT_NAME) {
  return {
    name,
    path,
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: ["roadmap.md"],
  };
}

export function runOptionsFor(path: string, name = PROJECT_NAME) {
  return {
    loadConfig: () => ({ projects: [projectFor(path, name)] }),
  } as never;
}

export type RunStub = (
  projectName: string,
  options: { executionProjectPath?: string },
) => Promise<unknown>;

/** Enveloppe isolée réelle (verrou local réel, vrai worktree Git) autour d'un fournisseur simulé. */
export function buildIsolatedRun(input: {
  repositoryPath: string;
  lockRoot: string;
  workspaceRoot: string;
  runLoopExecute: RunStub;
  attemptPrefix?: string;
}) {
  let attempt = 0;
  return createIsolatedProviderRunExecute({
    executor: (async () => {
      throw new Error("executor must not be called");
    }) as never,
    agentRegistry: { profiles: [] } as never,
    resolveRepositoryPath: () => input.repositoryPath,
    lockRoot: input.lockRoot,
    workspaceRoot: input.workspaceRoot,
    createAttemptId: () => `${input.attemptPrefix ?? "attempt"}-${(attempt += 1)}`,
    prepareWorkspaceDependencies: async () => undefined,
    runLoopExecute: input.runLoopExecute as never,
  });
}

/** Lance un enfant qui tient le verrou de projet réel et ne se termine jamais. */
export async function spawnHangingRun(input: {
  repositoryPath: string;
  lockRoot: string;
  workspaceRoot: string;
  children: ChildProcess[];
}): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      HANG_RUN,
      input.repositoryPath,
      input.lockRoot,
      input.workspaceRoot,
    ],
    { stdio: ["ignore", "pipe", "inherit"], cwd: REPOSITORY_ROOT },
  );
  input.children.push(child);
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
  return child;
}

export async function killAndWait(child: ChildProcess): Promise<void> {
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill("SIGKILL");
  await exited;
}
