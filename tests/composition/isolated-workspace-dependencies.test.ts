import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  IsolatedWorkspaceDependencyPreparationError,
  prepareIsolatedWorkspaceDependencies,
  type IsolatedWorkspaceDependencyInstall,
} from "../../src/composition/isolated-provider-execution.js";
import type { ProjectConfig } from "../../src/core/config.js";

function project(
  dependencies: "none" | "on_demand" | "production",
): ProjectConfig {
  return {
    name: "project-a",
    path: ".",
    type: "node-cli",
    required_docs: [],
    validation: [],
    workspace: {
      mode: "permanent",
      dependencies,
    },
  };
}

describe("isolated workspace dependency preparation", () => {
  it("does nothing for none and on_demand dependency modes", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-deps-"));
    let calls = 0;
    const install: IsolatedWorkspaceDependencyInstall = async () => {
      calls += 1;
    };

    try {
      await prepareIsolatedWorkspaceDependencies(
        project("none"),
        root,
        install,
      );
      await prepareIsolatedWorkspaceDependencies(
        project("on_demand"),
        root,
        install,
      );
      assert.equal(calls, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("prepares production dependencies from the local pnpm store only", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-deps-"));
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ packageManager: "pnpm@10.33.1" }),
      "utf8",
    );
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const calls: Array<{
      workspacePath: string;
      args: readonly string[];
      env: NodeJS.ProcessEnv;
    }> = [];
    const install: IsolatedWorkspaceDependencyInstall = async (
      workspacePath,
      args,
      env,
    ) => {
      calls.push({ workspacePath, args, env });
    };

    try {
      await prepareIsolatedWorkspaceDependencies(
        project("production"),
        root,
        install,
      );

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.workspacePath, root);
      assert.deepEqual(calls[0]?.args, [
        "install",
        "--offline",
        "--frozen-lockfile",
        "--ignore-scripts",
      ]);
      assert.equal(calls[0]?.env.CI, "1");
      assert.equal(calls[0]?.env.COREPACK_ENABLE_NETWORK, "0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when production dependency metadata is incomplete", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-deps-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ packageManager: "pnpm@10.33.1" }),
      "utf8",
    );

    try {
      await assert.rejects(
        prepareIsolatedWorkspaceDependencies(project("production"), root),
        (error: unknown) =>
          error instanceof IsolatedWorkspaceDependencyPreparationError &&
          error.code === "workspace_dependency_preparation_failed",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed for an unsupported production package manager", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-deps-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ packageManager: "npm@11.0.0" }),
      "utf8",
    );
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    try {
      await assert.rejects(
        prepareIsolatedWorkspaceDependencies(project("production"), root),
        (error: unknown) =>
          error instanceof IsolatedWorkspaceDependencyPreparationError &&
          error.code === "workspace_dependency_preparation_failed",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
