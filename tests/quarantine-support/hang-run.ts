// Processus enfant des tests rouges L7.2-0 : prend le verrou de projet réel,
// signale « running » puis ne se termine jamais (le parent le tue avec SIGKILL).
import { createIsolatedProviderRunExecute } from "../../src/composition/isolated-provider-execution.js";

const [repositoryPath, lockRoot, workspaceRoot] = process.argv.slice(2) as [
  string,
  string,
  string,
];

const project = {
  name: "red-project",
  path: repositoryPath,
  type: "test",
  required_docs: [],
  validation: [],
  roadmap: ["roadmap.md"],
};

const run = createIsolatedProviderRunExecute({
  executor: (async () => {
    throw new Error("executor must not be called");
  }) as never,
  agentRegistry: { profiles: [] } as never,
  resolveRepositoryPath: () => repositoryPath,
  lockRoot,
  workspaceRoot,
  createAttemptId: () => "attempt-hanging-child",
  prepareWorkspaceDependencies: async () => undefined,
  runLoopExecute: (async () => {
    process.stdout.write("running\n");
    await new Promise<never>(() => undefined);
  }) as never,
});

await run("red-project", { loadConfig: () => ({ projects: [project] }) } as never);
